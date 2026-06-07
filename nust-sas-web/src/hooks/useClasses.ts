import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classApi, type ClassData, type EnrollmentData } from '../lib/api';

export function useClasses() {
  return useQuery({
    queryKey: ['classes'],
    queryFn: classApi.list,
  });
}

export function useClass(id: string) {
  return useQuery({
    queryKey: ['classes', id],
    queryFn: () => classApi.get(id),
    enabled: !!id,
  });
}

export function useCreateClass() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: ClassData) => classApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export function useUpdateClass() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ClassData> }) => 
      classApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['classes', variables.id] });
    },
  });
}

export function useDeleteClass() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => classApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export function useClassEnrollments(classId: string) {
  return useQuery({
    queryKey: ['classes', classId, 'enrollments'],
    queryFn: () => classApi.listEnrollments(classId),
    enabled: !!classId,
  });
}

export function useEnrollStudent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ classId, data }: { classId: string; data: EnrollmentData }) =>
      classApi.enrollStudent(classId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['classes', variables.classId, 'enrollments'] });
    },
  });
}

export function useBulkEnroll() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ classId, studentCmsIds }: { classId: string; studentCmsIds: string[] }) =>
      classApi.bulkEnroll(classId, studentCmsIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['classes', variables.classId, 'enrollments'] });
    },
  });
}

export function useRemoveEnrollment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ classId, enrollmentId }: { classId: string; enrollmentId: string }) =>
      classApi.removeEnrollment(classId, enrollmentId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['classes', variables.classId, 'enrollments'] });
    },
  });
}
