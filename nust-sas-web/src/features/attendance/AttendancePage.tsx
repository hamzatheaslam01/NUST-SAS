import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useAttendanceLogs } from '../../hooks/useAdmin';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';

export default function AttendancePage() {
  const { data: logs, isLoading } = useAttendanceLogs({ limit: 50 });

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Attendance Logs</h2>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Attendance Records</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
              <p>No attendance logs yet</p>
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-slate-100/50">
                    <th className="h-12 px-4 text-left align-middle font-medium text-slate-500">Time</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-slate-500">Student CMS ID</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-slate-500">Status</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-slate-500">Distance</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-slate-500">Face Score</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b transition-colors hover:bg-slate-100/50">
                      <td className="p-4 align-middle">
                        {format(new Date(log.timestamp), 'PPpp')}
                      </td>
                      <td className="p-4 align-middle font-medium">
                        {log.profiles?.cms_id || log.student_id.slice(0, 8)}
                      </td>
                      <td className="p-4 align-middle">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          log.verification_status === 'SUCCESS' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {log.verification_status}
                        </span>
                      </td>
                      <td className="p-4 align-middle">
                        {log.distance_from_center 
                          ? `${Math.round(log.distance_from_center)}m` 
                          : '-'}
                      </td>
                      <td className="p-4 align-middle">
                        {log.face_similarity_score 
                          ? `${(log.face_similarity_score * 100).toFixed(1)}%` 
                          : '-'}
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
