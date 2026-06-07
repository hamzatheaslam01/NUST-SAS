import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useClass, useClassEnrollments, useEnrollStudent, useBulkEnroll, useRemoveEnrollment } from '../../hooks/useClasses';
import { ArrowLeft, Plus, Trash2, Users, Upload } from 'lucide-react';

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: classData, isLoading: classLoading } = useClass(id!);
  const { data: enrollments, isLoading: enrollmentsLoading } = useClassEnrollments(id!);
  const enrollStudent = useEnrollStudent();
  const bulkEnroll = useBulkEnroll();
  const removeEnrollment = useRemoveEnrollment();

  const [studentCmsId, setStudentCmsId] = useState('');
  const [bulkCmsIds, setBulkCmsIds] = useState('');
  const [showBulkEnroll, setShowBulkEnroll] = useState(false);

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !studentCmsId.trim()) return;

    try {
      await enrollStudent.mutateAsync({
        classId: id,
        data: { student_cms_id: studentCmsId.trim() },
      });
      setStudentCmsId('');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to enroll student');
    }
  };

  const handleBulkEnroll = async () => {
    if (!id || !bulkCmsIds.trim()) return;

    const cmsIds = bulkCmsIds
      .split(/[\n,]/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (cmsIds.length === 0) return;

    try {
      const result = await bulkEnroll.mutateAsync({
        classId: id,
        studentCmsIds: cmsIds,
      });
      alert(`Enrolled: ${result.enrolled_count}, Failed: ${result.failed_count}`);
      setBulkCmsIds('');
      setShowBulkEnroll(false);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to bulk enroll students');
    }
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    if (!id || !confirm('Remove this student from the class?')) return;

    try {
      await removeEnrollment.mutateAsync({ classId: id, enrollmentId });
    } catch (error) {
      alert('Failed to remove student');
    }
  };

  if (classLoading || enrollmentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-slate-500 mb-4">Class not found</p>
        <Button onClick={() => navigate('/classes')}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/classes')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {classData.course_code} - {classData.course_name}
          </h2>
          <p className="text-slate-500">Section {classData.section}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Enrolled Students</CardTitle>
                <CardDescription>
                  {enrollments?.length || 0} student{enrollments?.length !== 1 ? 's' : ''} enrolled
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowBulkEnroll(!showBulkEnroll)}>
                <Upload className="h-4 w-4 mr-2" />
                Bulk Enroll
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showBulkEnroll && (
              <div className="mb-6 p-4 border rounded-lg bg-slate-50">
                <label className="text-sm font-medium mb-2 block">
                  Enter CMS IDs (one per line or comma-separated)
                </label>
                <textarea
                  className="w-full p-2 border rounded-md min-h-[100px] mb-2"
                  placeholder="123456&#10;234567&#10;345678"
                  value={bulkCmsIds}
                  onChange={(e) => setBulkCmsIds(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleBulkEnroll} disabled={bulkEnroll.isPending}>
                    {bulkEnroll.isPending ? 'Enrolling...' : 'Enroll All'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowBulkEnroll(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="relative w-full overflow-auto max-h-96">
              {!enrollments || enrollments.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Users className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                  <p>No students enrolled yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left p-3 font-medium">CMS ID</th>
                      <th className="text-left p-3 font-medium">Enrolled At</th>
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((enrollment: any) => (
                      <tr key={enrollment.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-medium">{enrollment.profiles?.cms_id || enrollment.student_id}</td>
                        <td className="p-3 text-slate-600">
                          {new Date(enrollment.enrolled_at).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemoveEnrollment(enrollment.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enroll Student</CardTitle>
            <CardDescription>Add a student by CMS ID</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEnrollStudent} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Student CMS ID</label>
                <Input
                  placeholder="e.g., 123456"
                  value={studentCmsId}
                  onChange={(e) => setStudentCmsId(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={enrollStudent.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                {enrollStudent.isPending ? 'Adding...' : 'Add Student'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
