import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { usePendingTeachers, useAllTeachers, useApproveTeacher, useRevokeTeacher, useAdminStatistics } from '../../hooks/useAdmin';
import { CheckCircle, XCircle, Users, BookOpen, Clock } from 'lucide-react';

export default function AdminPage() {
  const { data: pendingTeachers, isLoading: pendingLoading } = usePendingTeachers();
  const { data: allTeachers, isLoading: teachersLoading } = useAllTeachers();
  const { data: stats } = useAdminStatistics();
  const approveTeacher = useApproveTeacher();
  const revokeTeacher = useRevokeTeacher();

  const handleApprove = async (teacherId: string) => {
    try {
      await approveTeacher.mutateAsync(teacherId);
    } catch (error) {
      alert('Failed to approve teacher');
    }
  };

  const handleRevoke = async (teacherId: string) => {
    if (!confirm('Revoke access for this teacher?')) return;
    
    try {
      await revokeTeacher.mutateAsync(teacherId);
    } catch (error) {
      alert('Failed to revoke teacher');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Students</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <div className="text-2xl font-bold">{stats?.total_students || 0}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active Teachers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              <div className="text-2xl font-bold">{stats?.total_teachers || 0}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Classes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-purple-600" />
              <div className="text-2xl font-bold">{stats?.total_classes || 0}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" />
              <div className="text-2xl font-bold">{stats?.active_sessions || 0}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Teacher Approvals</CardTitle>
          <CardDescription>Review and approve teacher registration requests</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingLoading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : !pendingTeachers || pendingTeachers.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-slate-300" />
              <p>No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingTeachers.map((teacher) => (
                <div key={teacher.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">{teacher.cms_id}</p>
                    <p className="text-sm text-slate-500">
                      Registered: {new Date(teacher.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(teacher.id)}
                    disabled={approveTeacher.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Teachers</CardTitle>
          <CardDescription>Manage teacher accounts</CardDescription>
        </CardHeader>
        <CardContent>
          {teachersLoading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : !allTeachers || allTeachers.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No active teachers</div>
          ) : (
            <div className="relative w-full overflow-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left p-3 font-medium">CMS ID</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Joined</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allTeachers.map((teacher) => (
                    <tr key={teacher.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-medium">{teacher.cms_id}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          Active
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">
                        {new Date(teacher.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRevoke(teacher.id)}
                          disabled={revokeTeacher.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
