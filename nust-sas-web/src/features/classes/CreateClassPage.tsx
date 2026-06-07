import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useCreateClass } from '../../hooks/useClasses';
import { ArrowLeft } from 'lucide-react';

export default function CreateClassPage() {
  const navigate = useNavigate();
  const createClass = useCreateClass();
  
  const [formData, setFormData] = useState({
    course_code: '',
    course_name: '',
    section: '',
    room_id: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await createClass.mutateAsync(formData);
      navigate('/classes');
    } catch (error) {
      console.error('Failed to create class:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/classes')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Create New Class</h2>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Class Details</CardTitle>
          <CardDescription>Enter the information for your new class</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Course Code</label>
              <Input
                placeholder="e.g., CS-101"
                value={formData.course_code}
                onChange={(e) => setFormData({ ...formData, course_code: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Course Name</label>
              <Input
                placeholder="e.g., Introduction to Computer Science"
                value={formData.course_name}
                onChange={(e) => setFormData({ ...formData, course_name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Section</label>
              <Input
                placeholder="e.g., A, B, 1, 2"
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Room ID</label>
              <Input
                placeholder="e.g., Room 301"
                value={formData.room_id}
                onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={createClass.isPending}>
                {createClass.isPending ? 'Creating...' : 'Create Class'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/classes')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
