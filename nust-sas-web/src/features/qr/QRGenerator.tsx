import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { AlertCircle, QrCode } from 'lucide-react';

export default function QRGenerator() {
  const [isActive, setIsActive] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [courseId, setCourseId] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Mock courses - in real app, fetch from DB
  const courses = [
    { value: 'CS-101', label: 'CS-101: Intro to Computing' },
    { value: 'SE-201', label: 'SE-201: Software Engineering' },
    { value: 'IS-301', label: 'IS-301: Information Security' },
  ];

  const fetchToken = async () => {
    try {
      // In a real scenario, this calls the backend to get a signed JWT
      // const { data, error } = await supabase.functions.invoke('generate-qr', { body: { courseId } })
      
      // Mocking the token generation for now
      const mockToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({
        session_id: 'mock-session-id',
        courseId,
        exp: Date.now() / 1000 + 20,
        iat: Date.now() / 1000,
        nonce: Math.random().toString(36).substring(7)
      }))}.signature`;
      
      setToken(mockToken);
      setTimeLeft(15); // Match backend's safe expiry time
      setError(null);
    } catch (err) {
      setError('Failed to generate QR token');
      setIsActive(false);
    }
  };

  useEffect(() => {
    if (isActive && courseId) {
      fetchToken(); // Initial fetch
      
      const interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 3) {
            fetchToken();
            // Don't reset here, fetchToken will reset it
          }
          return prev > 0 ? prev - 1 : 0;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    } else {
      setToken(null);
    }
  }, [isActive, courseId]);

  const toggleSession = () => {
    if (!courseId) {
      setError('Please select a course first');
      return;
    }
    setIsActive(!isActive);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">QR Generator</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Session Configuration</CardTitle>
            <CardDescription>Select a course to start taking attendance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Course</label>
              <Select 
                value={courseId} 
                onChange={(e) => setCourseId(e.target.value)} 
                options={courses} 
                placeholder="Select a course..." 
              />
            </div>
            
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 p-3 rounded-md">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <Button 
              className="w-full" 
              size="lg"
              variant={isActive ? "destructive" : "default"}
              onClick={toggleSession}
            >
              {isActive ? 'Stop Session' : 'Start Session'}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col items-center justify-center min-h-[400px]">
          <CardContent className="flex flex-col items-center justify-center p-6 space-y-6">
            {isActive && token ? (
              <>
                <div className="relative p-4 bg-white rounded-xl shadow-lg border border-slate-100">
                  <QRCode value={token} size={256} />
                  <div className="absolute -bottom-12 left-0 right-0 text-center">
                    <span className="text-sm font-medium text-slate-500">
                      Refreshing in {timeLeft}s
                    </span>
                  </div>
                </div>
                <div className="mt-8 flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-full">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  <span className="text-sm font-medium">Live Session Active</span>
                </div>
              </>
            ) : (
              <div className="text-center space-y-4 text-slate-400">
                <div className="bg-slate-100 p-6 rounded-full inline-flex">
                  <QrCode className="h-12 w-12" />
                </div>
                <p className="text-lg font-medium text-slate-600">Ready to start</p>
                <p className="text-sm">Select a course and click Start Session to generate dynamic QR codes.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
