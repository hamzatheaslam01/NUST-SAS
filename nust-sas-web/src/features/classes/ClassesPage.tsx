import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Plus, BookOpen, Users, MapPin } from 'lucide-react';
import { useClasses } from '../../hooks/useClasses';
import { useNavigate } from 'react-router-dom';

export default function ClassesPage() {
  const navigate = useNavigate();
  const { data: classes, isLoading } = useClasses();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading classes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">My Classes</h2>
        <Button onClick={() => navigate('/classes/create')}>
          <Plus className="h-4 w-4 mr-2" />
          Create Class
        </Button>
      </div>

      {!classes || classes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-slate-300 mb-4" />
            <p className="text-slate-500 mb-4">No classes yet</p>
            <Button onClick={() => navigate('/classes/create')}>Create your first class</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((classData) => (
            <Card key={classData.id} className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{classData.course_code}</span>
                  <span className="text-xs font-normal text-slate-500">{classData.section}</span>
                </CardTitle>
                <CardDescription>{classData.course_name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center text-sm text-slate-600">
                  <MapPin className="h-4 w-4 mr-2" />
                  {classData.room_id || 'No room assigned'}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate(`/classes/${classData.id}`)}
                  >
                    <Users className="h-4 w-4 mr-1" />
                    Manage
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/sessions/create?classId=${classData.id}`)}
                  >
                    Start Session
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
