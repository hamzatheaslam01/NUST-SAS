import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../lib/api';

export function usePendingTeachers() {
  return useQuery({
    queryKey: ['admin', 'teachers', 'pending'],
    queryFn: adminApi.listPendingTeachers,
  });
}

export function useAllTeachers(activeOnly = true) {
  return useQuery({
    queryKey: ['admin', 'teachers', activeOnly ? 'active' : 'all'],
    queryFn: () => adminApi.listAllTeachers(activeOnly),
  });
}

export function useApproveTeacher() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (teacherId: string) => adminApi.approveTeacher(teacherId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'teachers'] });
    },
  });
}

export function useRevokeTeacher() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (teacherId: string) => adminApi.revokeTeacher(teacherId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'teachers'] });
    },
  });
}

export function useAdminStatistics() {
  return useQuery({
    queryKey: ['admin', 'statistics'],
    queryFn: adminApi.getStatistics,
    refetchInterval: 30000,
  });
}

export function useAttendanceLogs(params?: {
  session_id?: string;
  student_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['admin', 'attendance-logs', params],
    queryFn: () => adminApi.listAttendanceLogs(params),
  });
}
