import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './features/auth/LoginPage';
import DashboardPage from './features/dashboard/DashboardPage';
import AttendancePage from './features/attendance/AttendancePage';
import ClassesPage from './features/classes/ClassesPage';
import CreateClassPage from './features/classes/CreateClassPage';
import ClassDetailPage from './features/classes/ClassDetailPage';
import CreateSessionPage from './features/sessions/CreateSessionPage';
import LiveSessionPage from './features/sessions/LiveSessionPage';
import AdminPage from './features/admin/AdminPage';
import { useAuth } from './hooks/useAuth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && profile?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }>
            <Route index element={<DashboardPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="classes/create" element={<CreateClassPage />} />
            <Route path="classes/:id" element={<ClassDetailPage />} />
            <Route path="sessions/create" element={<CreateSessionPage />} />
            <Route path="sessions/:id" element={<LiveSessionPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="admin" element={
              <ProtectedRoute requireAdmin>
                <AdminPage />
              </ProtectedRoute>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
