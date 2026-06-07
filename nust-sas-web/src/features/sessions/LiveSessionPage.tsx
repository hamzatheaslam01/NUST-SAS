import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useSession, useEndSession, useGenerateQR, useSessionAttendance, useMarkAttendanceManual } from '../../hooks/useSessions';
import { useClass, useClassEnrollments } from '../../hooks/useClasses';
import { getWebSocketUrl } from '../../lib/api';
import { ArrowLeft, CheckCircle, XCircle, Clock, Users, Maximize, Minimize, RefreshCw } from 'lucide-react';

export default function LiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: session, isLoading: sessionLoading, isError } = useSession(id!);
  const { data: classData } = useClass(session?.class_id || '');
  const { data: enrollments } = useClassEnrollments(session?.class_id || '');
  const { data: attendanceLogs, refetch: refetchAttendance } = useSessionAttendance(id!, 1000);
  const endSession = useEndSession();
  const generateQR = useGenerateQR();
  const markManual = useMarkAttendanceManual();

  const [qrToken, setQrToken] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [manualCmsId, setManualCmsId] = useState('');
  const [recentUpdates, setRecentUpdates] = useState<any[]>([]);
  const [isProjectorMode, setIsProjectorMode] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Keyboard shortcut for projector mode
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsProjectorMode(false);
      if (e.key === 'p' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setIsProjectorMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (!id) return;

    const connectWebSocket = () => {
      const ws = new WebSocket(getWebSocketUrl(id));

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'attendance_update') {
            setRecentUpdates((prev) => [message, ...prev].slice(0, 10));
            refetchAttendance();
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [id, refetchAttendance]);

  useEffect(() => {
    if (!id) return;

    let isActive = true;
    let isFetching = false;

    const fetchQR = async () => {
      if (isFetching) return;
      isFetching = true;

      try {
        const result = await generateQR.mutateAsync(id);
        if (isActive) {
          setQrToken(result.qr_token);
          setTimeLeft(result.expires_in || 20);
        }
      } catch (error) {
        console.error('Failed to generate QR:', error);
      } finally {
        isFetching = false;
      }
    };

    fetchQR();

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 3) {
          fetchQR();
        }
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [id]);

  const handleEndSession = async () => {
    if (!id || !confirm('End this session?')) return;

    try {
      await endSession.mutateAsync(id);
      navigate('/dashboard');
    } catch (error) {
      alert('Failed to end session');
    }
  };

  const handleManualMark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !manualCmsId.trim()) return;

    try {
      await markManual.mutateAsync({
        sessionId: id,
        studentCmsId: manualCmsId.trim(),
      });
      setManualCmsId('');
      alert('Attendance marked successfully');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to mark attendance');
    }
  };

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading session...</div>
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-slate-500 mb-4">Session not found or failed to load</p>
        <Button onClick={() => navigate('/classes')}>Go back</Button>
      </div>
    );
  }

  const presentCount = attendanceLogs?.filter((log) => log.verification_status === 'SUCCESS').length || 0;
  const totalStudents = enrollments?.length || 0;

  if (isProjectorMode) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-center p-8">
        <div className="absolute top-8 right-8">
          <Button variant="ghost" size="icon" onClick={() => setIsProjectorMode(false)} className="hover:bg-slate-800 text-white">
            <Minimize className="h-8 w-8" />
          </Button>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 tracking-tight">{classData?.course_name}</h1>
          <p className="text-3xl text-slate-400 font-light">{classData?.course_code} - Scan to Attend</p>
        </div>

        {qrToken && (
          <div className="p-8 bg-white rounded-3xl shadow-2xl mb-12">
            <QRCode value={qrToken} size={window.innerHeight * 0.5} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-16 w-full max-w-4xl">
          <div className="text-center p-6 bg-slate-900 rounded-2xl border border-slate-800">
            <div className="text-6xl font-bold text-green-500 mb-2">{presentCount}</div>
            <div className="text-2xl text-slate-400">Present</div>
          </div>

          <div className="text-center p-6 bg-slate-900 rounded-2xl border border-slate-800">
            <div className="text-6xl font-bold mb-2 font-mono text-blue-400">
              {timeLeft}s
            </div>
            <div className="text-2xl text-slate-400">Next Code</div>
          </div>

          <div className="text-center p-6 bg-slate-900 rounded-2xl border border-slate-800">
            <div className="text-6xl font-bold text-slate-500 mb-2">{totalStudents}</div>
            <div className="text-2xl text-slate-400">Enrolled</div>
          </div>
        </div>

        <div className="mt-12 text-slate-500 text-xl">
          Press <kbd className="px-2 py-1 bg-slate-800 rounded mx-1 border border-slate-700">Esc</kbd> to exit projector mode
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/classes')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Live Session</h2>
            <p className="text-slate-500">
              {classData?.course_code} - {classData?.course_name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsProjectorMode(true)}>
            <Maximize className="h-4 w-4 mr-2" />
            Projector Mode
          </Button>
          <Button variant="destructive" onClick={handleEndSession} disabled={endSession.isPending}>
            {endSession.isPending ? 'Ending...' : 'End Session'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Sticky QR Code */}
        <div className="lg:sticky lg:top-4">
          <Card className="h-full flex flex-col justify-center items-center py-8">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl">Attendance QR Code</CardTitle>
              <CardDescription>Students scan this code to mark their attendance</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-6 w-full">
              {qrToken ? (
                <>
                  <div className="p-6 bg-white rounded-2xl shadow-xl border-2 border-slate-200">
                    <QRCode value={qrToken} size={300} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                  </div>
                  <div className={`flex items-center gap-3 px-6 py-3 rounded-full shadow-sm ${timeLeft > 0 ? 'text-green-600 bg-green-50' : 'text-amber-600 bg-amber-50'
                    }`}>
                    {timeLeft > 0 ? (
                      <span className="relative flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
                      </span>
                    ) : (
                      <span className="relative flex h-4 w-4">
                        <span className="animate-pulse relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
                      </span>
                    )}
                    <span className="text-base font-semibold">
                      {timeLeft > 0 ? `Refreshing in ${timeLeft}s` : 'Syncing...'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center py-16">
                  <p className="text-slate-500 text-lg">Generating QR code...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Stats & Lists */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Present</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{presentCount}</div>
                <p className="text-xs text-slate-500 mt-1">out of {totalStudents} students</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Attendance Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0}%
                </div>
                <p className="text-xs text-slate-500 mt-1">current session</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Student Attendance</CardTitle>
                <CardDescription>Real-time attendance status</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetchAttendance()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="relative w-full overflow-auto max-h-[400px]">
                {!enrollments || enrollments.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Users className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                    <p>No students enrolled</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b sticky top-0 bg-white z-10">
                      <tr>
                        <th className="text-left p-3 font-medium bg-white">CMS ID</th>
                        <th className="text-left p-3 font-medium bg-white">Status</th>
                        <th className="text-left p-3 font-medium bg-white">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.map((enrollment: any) => {
                        const log = attendanceLogs?.find((l) => l.student_id === enrollment.student_id);
                        const isPresent = log?.verification_status === 'SUCCESS';

                        return (
                          <tr key={enrollment.id} className="border-b hover:bg-slate-50">
                            <td className="p-3 font-medium">
                              {enrollment.profiles?.cms_id || enrollment.student_id}
                            </td>
                            <td className="p-3">
                              {log ? (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${isPresent
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                    }`}
                                >
                                  {isPresent ? (
                                    <><CheckCircle className="h-3 w-3" /> Present</>
                                  ) : (
                                    <><XCircle className="h-3 w-3" /> {log.verification_status}</>
                                  )}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                  <Clock className="h-3 w-3" /> Waiting
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-slate-600 text-xs">
                              {log ? new Date(log.timestamp).toLocaleTimeString() : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manual Attendance</CardTitle>
              <CardDescription>Mark attendance manually by CMS ID</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleManualMark} className="flex gap-2">
                <Input
                  placeholder="Enter CMS ID"
                  value={manualCmsId}
                  onChange={(e) => setManualCmsId(e.target.value)}
                />
                <Button type="submit" disabled={markManual.isPending}>Mark</Button>
              </form>
            </CardContent>
          </Card>

          {recentUpdates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest attendance updates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentUpdates.slice(0, 5).map((update, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded bg-slate-50">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${update.status === 'SUCCESS' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="font-medium truncate">{update.student_cms_id}</span>
                      <span className="text-xs text-slate-500 ml-auto">
                        {new Date(update.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {attendanceLogs && attendanceLogs.some((l) => l.verification_status !== 'SUCCESS') && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Security Alerts
            </CardTitle>
            <CardDescription className="text-red-600">
              Flagged verification attempts requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-red-200">
                    <th className="p-2 font-medium text-red-900">Time</th>
                    <th className="p-2 font-medium text-red-900">Student ID</th>
                    <th className="p-2 font-medium text-red-900">Failure Reason</th>
                    <th className="p-2 font-medium text-red-900">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceLogs
                    .filter((l) => l.verification_status !== 'SUCCESS')
                    .map((log: any) => {
                      const enrollment = enrollments?.find((e: any) => e.student_id === log.student_id);
                      const name = enrollment?.profiles?.cms_id || log.student_id;
                      return (
                        <tr key={log.id} className="border-b border-red-100 hover:bg-red-100">
                          <td className="p-2 text-red-900">{new Date(log.timestamp).toLocaleTimeString()}</td>
                          <td className="p-2 font-medium text-red-900">{name}</td>
                          <td className="p-2 text-red-800 font-mono text-xs">{log.verification_status}</td>
                          <td className="p-2 text-red-700 text-xs truncate max-w-xs">
                            {log.failure_reason || (log.raw_verification_data ? JSON.stringify(log.raw_verification_data) : '-')}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
