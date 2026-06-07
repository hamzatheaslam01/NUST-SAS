import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { ShieldCheck, LayoutDashboard, BookOpen, FileText, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../lib/api';
import { Button } from '../components/ui/Button';

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'My Classes', href: '/classes', icon: BookOpen },
    { name: 'Attendance Logs', href: '/attendance', icon: FileText },
  ];

  if (profile?.role === 'admin') {
    navigation.push({ name: 'Admin Panel', href: '/admin', icon: Settings });
  }

  const handleLogout = async () => {
    await authApi.logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex h-screen">
        <aside className="w-64 bg-slate-900 text-white flex flex-col">
          <div className="flex items-center gap-2 p-6 border-b border-slate-700">
            <ShieldCheck className="h-6 w-6" />
            <span className="text-xl font-bold">NUST-SAS</span>
          </div>
          
          <nav className="p-4 space-y-2 flex-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-700">
            <div className="mb-3 px-4">
              <p className="text-xs text-slate-400">Logged in as</p>
              <p className="text-sm font-medium">{profile?.cms_id}</p>
              <p className="text-xs text-slate-400 capitalize">{profile?.role}</p>
            </div>
            <Button
              variant="outline"
              className="w-full bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
