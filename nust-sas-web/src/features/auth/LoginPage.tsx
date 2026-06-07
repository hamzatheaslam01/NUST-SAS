import { useState } from 'react';
import { authApi } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, UserPlus } from 'lucide-react';
import apiClient from '../../lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [showDebugRegister, setShowDebugRegister] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCmsId, setRegCmsId] = useState('');
  const [regRole, setRegRole] = useState<'admin' | 'teacher'>('teacher');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await authApi.login(email, password);

    if (error) {
      setError(error);
      setLoading(false);
    } else {
      navigate('/');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLoading(true);
    setRegError(null);
    setRegSuccess(null);

    try {
      await apiClient.post('/auth/register', {
        email: regEmail,
        password: regPassword,
        cms_id: regCmsId,
        role: regRole
      });
      
      setRegSuccess(`${regRole === 'admin' ? 'Admin' : 'Teacher'} registered successfully!`);
      setRegEmail('');
      setRegPassword('');
      setRegCmsId('');
    } catch (err: any) {
      setRegError(err.response?.data?.detail || err.message || 'Registration failed');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-slate-900 rounded-full">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">NUST-SAS</CardTitle>
          <CardDescription className="text-center">
            Secure Attendance System - Instructor Portal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowDebugRegister(!showDebugRegister)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {showDebugRegister ? 'Back to Login' : 'Debug: Register Account'}
            </Button>
          </div>

          {!showDebugRegister ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Email</label>
                <Input
                  id="email"
                  type="email"
                  placeholder="instructor@nust.edu.pk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Password</label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="text-sm text-red-500 font-medium">
                  {error}
                </div>
              )}
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="reg-role" className="text-sm font-medium leading-none">Role</label>
                <select
                  id="reg-role"
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value as 'admin' | 'teacher')}
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="reg-cms-id" className="text-sm font-medium leading-none">CMS ID</label>
                <Input
                  id="reg-cms-id"
                  type="text"
                  placeholder="123456"
                  value={regCmsId}
                  onChange={(e) => setRegCmsId(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="reg-email" className="text-sm font-medium leading-none">Email</label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="user@nust.edu.pk"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="reg-password" className="text-sm font-medium leading-none">Password</label>
                <Input
                  id="reg-password"
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {regError && (
                <div className="text-sm text-red-500 font-medium">
                  {regError}
                </div>
              )}
              {regSuccess && (
                <div className="text-sm text-green-600 font-medium">
                  {regSuccess}
                </div>
              )}
              <Button className="w-full" type="submit" disabled={regLoading}>
                {regLoading ? 'Registering...' : `Register ${regRole === 'admin' ? 'Admin' : 'Teacher'}`}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
