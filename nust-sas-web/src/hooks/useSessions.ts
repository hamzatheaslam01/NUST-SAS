import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionApi, type SessionData } from '../lib/api';

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: sessionApi.list,
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ['sessions', id],
    queryFn: () => sessionApi.get(id),
    enabled: !!id,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: SessionData) => sessionApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => sessionApi.end(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', id] });
    },
  });
}

export function useGenerateQR() {
  return useMutation({
    mutationFn: (sessionId: string) => sessionApi.generateQR(sessionId),
  });
}

export function useSessionAttendance(sessionId: string, refreshInterval?: number) {
  return useQuery({
    queryKey: ['sessions', sessionId, 'attendance'],
    queryFn: () => sessionApi.getAttendance(sessionId),
    enabled: !!sessionId,
    refetchInterval: refreshInterval || false,
    refetchOnWindowFocus: true,
  });
}

export function useMarkAttendanceManual() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ sessionId, studentCmsId }: { sessionId: string; studentCmsId: string }) =>
      sessionApi.markAttendanceManual(sessionId, studentCmsId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', variables.sessionId, 'attendance'] });
    },
  });
}
