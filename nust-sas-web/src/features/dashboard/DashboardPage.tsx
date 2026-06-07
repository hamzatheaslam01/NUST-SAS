import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Users, BookOpen, Clock, Plus, PlayCircle } from 'lucide-react';
import { useClasses } from '../../hooks/useClasses';
import { useSessions } from '../../hooks/useSessions';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: classes } = useClasses();
  const { data: sessions } = useSessions();

  const activeSessions = sessions?.filter((s: any) => s.is_active) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <Button onClick={() => navigate('/sessions/create')}>
          <Plus className="h-4 w-4 mr-2" />
          Start Session
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Classes</CardTitle>
            <BookOpen className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{classes?.length || 0}</div>
            <Button
              variant="link"
              className="p-0 h-auto text-xs text-slate-500 hover:text-slate-900"
              onClick={() => navigate('/classes')}
            >
              View all classes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Clock className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSessions.length}</div>
            <p className="text-xs text-slate-500 mt-1">
              {activeSessions.length > 0 ? 'Sessions in progress' : 'No active sessions'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessions?.length || 0}</div>
            <Button
              variant="link"
              className="p-0 h-auto text-xs text-slate-500 hover:text-slate-900"
              onClick={() => navigate('/attendance')}
            >
              View attendance logs
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Active Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {activeSessions.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Clock className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No active sessions</p>
                <Button className="mt-4" size="sm" onClick={() => navigate('/sessions/create')}>
                  Start a session
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeSessions.map((session: any) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 cursor-pointer"
                    onClick={() => navigate(`/sessions/${session.id}`)}
                  >
                    <div>
                      <p className="font-medium">Session {session.id.slice(0, 8)}</p>
                      <p className="text-sm text-slate-500">
                        Started: {new Date(session.start_time).toLocaleTimeString()}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Live
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Classes</CardTitle>
          </CardHeader>
          <CardContent>
            {!classes || classes.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <BookOpen className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No classes yet</p>
                <Button className="mt-4" size="sm" onClick={() => navigate('/classes/create')}>
                  Create a class
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {classes.slice(0, 5).map((classData: any) => (
                  <div
                    key={classData.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 cursor-pointer"
                    onClick={() => navigate(`/classes/${classData.id}`)}
                  >
                    <div>
                      <p className="font-medium">{classData.course_code}</p>
                      <p className="text-sm text-slate-500">{classData.course_name}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/sessions/create?classId=${classData.id}`);
                      }}
                    >
                      <PlayCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b">
                  <th className="p-3 font-medium text-slate-500">Class</th>
                  <th className="p-3 font-medium text-slate-500">Date</th>
                  <th className="p-3 font-medium text-slate-500">Duration</th>
                  <th className="p-3 font-medium text-slate-500">Status</th>
                  <th className="p-3 text-right font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions
                  ?.filter((sString: any) => !sString.is_active)
                  .sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                  .slice(0, 5)
                  .map((session: any) => {
                    const classData = classes?.find((c: any) => c.id === session.class_id);
                    return (
                      <tr key={session.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-medium">
                          {classData?.course_code} - {classData?.course_name}
                        </td>
                        <td className="p-3 text-slate-600">
                          {new Date(session.start_time).toLocaleDateString()} {new Date(session.start_time).toLocaleTimeString()}
                        </td>
                        <td className="p-3 text-slate-600">
                          {Math.round((new Date(session.end_time || Date.now()).getTime() - new Date(session.start_time).getTime()) / 60000)} mins
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            Completed
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/sessions/${session.id}`)}>
                            View Report
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                {sessions?.filter((s: any) => !s.is_active).length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-500">No past sessions found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
