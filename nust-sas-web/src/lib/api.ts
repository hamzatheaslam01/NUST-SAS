import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Token management
const TOKEN_KEY = 'nust_sas_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);

apiClient.interceptors.request.use(
  async (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout');
    } else if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
      if (error.response.status === 401) {
        // Auto logout on 401
        removeToken();
        // Optional: Redirect to login if not already there
        if (window.location.pathname !== '/login') {
           window.location.href = '/login';
        }
      }
    } else if (error.request) {
      console.error('Network Error: No response received');
    } else {
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export interface ClassData {
  id?: string;
  course_code: string;
  course_name: string;
  section?: string;
  room_id?: string;
  schedule?: Record<string, any>;
  default_latitude?: number;
  default_longitude?: number;
  is_active?: boolean;
  teacher_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SessionData {
  id?: string;
  class_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  radius?: number;
  duration_minutes?: number;
  start_time?: string;
  end_time?: string;
  teacher_location?: {
    lat: number;
    lon: number;
    accuracy?: number;
  };
  geofence_radius_meters?: number;
  is_active?: boolean;
  created_at?: string;
}

export interface AttendanceLog {
  id: string;
  session_id: string;
  student_id: string;
  timestamp: string;
  verification_status: string;
  location_data: any;
  device_fingerprint: any;
  liveness_data?: any;
  face_similarity_score?: number;
  distance_from_center?: number;
  failure_reason?: string;
  profiles?: {
    cms_id: string;
  };
}

export interface EnrollmentData {
  student_cms_id: string;
}

export interface Teacher {
  id: string;
  cms_id: string;
  is_active: boolean;
  created_at: string;
}

export const authApi = {
  async login(email: string, password: string) {
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      if (response.data.access_token) {
        setToken(response.data.access_token);
      }
      return { data: response.data, error: null };
    } catch (error: any) {
      return { 
        data: null, 
        error: error.response?.data?.detail || error.message || 'Login failed' 
      };
    }
  },
  
  async logout() {
    removeToken();
    return { error: null };
  },
  
  async getProfile() {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },
};

export const classApi = {
  async list() {
    const response = await apiClient.get<ClassData[]>('/classes');
    return response.data;
  },
  
  async get(id: string) {
    const response = await apiClient.get<ClassData>(`/classes/${id}`);
    return response.data;
  },
  
  async create(data: ClassData) {
    const response = await apiClient.post<ClassData>('/classes', data);
    return response.data;
  },
  
  async update(id: string, data: Partial<ClassData>) {
    const response = await apiClient.put<ClassData>(`/classes/${id}`, data);
    return response.data;
  },
  
  async delete(id: string) {
    await apiClient.delete(`/classes/${id}`);
  },
  
  async listEnrollments(classId: string) {
    const response = await apiClient.get(`/classes/${classId}/enrollments`);
    return response.data;
  },
  
  async enrollStudent(classId: string, data: EnrollmentData) {
    const response = await apiClient.post(`/classes/${classId}/enroll`, data);
    return response.data;
  },
  
  async bulkEnroll(classId: string, studentCmsIds: string[]) {
    const response = await apiClient.post(`/classes/${classId}/enroll/bulk`, {
      student_cms_ids: studentCmsIds,
    });
    return response.data;
  },
  
  async removeEnrollment(classId: string, enrollmentId: string) {
    await apiClient.delete(`/classes/${classId}/enrollments/${enrollmentId}`);
  },
};

export const sessionApi = {
  async create(data: SessionData) {
    const response = await apiClient.post('/instructor/sessions', data);
    return response.data;
  },
  
  async list() {
    const response = await apiClient.get('/instructor/sessions');
    return response.data;
  },
  
  async get(id: string) {
    const response = await apiClient.get(`/instructor/sessions/${id}`);
    return response.data;
  },
  
  async end(id: string) {
    const response = await apiClient.post(`/instructor/sessions/${id}/end`);
    return response.data;
  },
  
  async generateQR(sessionId: string) {
    const response = await apiClient.post(`/instructor/sessions/${sessionId}/generate-qr`);
    return response.data;
  },
  
  async getAttendance(sessionId: string) {
    const response = await apiClient.get<AttendanceLog[]>(`/instructor/sessions/${sessionId}/attendance`);
    return response.data;
  },
  
  async markAttendanceManual(sessionId: string, studentCmsId: string) {
    const response = await apiClient.post(`/instructor/sessions/${sessionId}/mark-attendance`, {
      student_cms_id: studentCmsId,
    });
    return response.data;
  },
};

export const adminApi = {
  async listPendingTeachers() {
    const response = await apiClient.get<Teacher[]>('/admin/teachers/pending');
    return response.data;
  },
  
  async listAllTeachers(activeOnly = true) {
    const response = await apiClient.get<Teacher[]>('/admin/teachers', {
      params: { active_only: activeOnly },
    });
    return response.data;
  },
  
  async approveTeacher(teacherId: string) {
    const response = await apiClient.put(`/admin/teachers/${teacherId}/approve`);
    return response.data;
  },
  
  async revokeTeacher(teacherId: string) {
    const response = await apiClient.put(`/admin/teachers/${teacherId}/revoke`);
    return response.data;
  },
  
  async getStatistics() {
    const response = await apiClient.get('/admin/statistics');
    return response.data;
  },
  
  async listAttendanceLogs(params?: {
    session_id?: string;
    student_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await apiClient.get<AttendanceLog[]>('/admin/attendance-logs', { params });
    return response.data;
  },
};

export function getWebSocketUrl(sessionId: string): string {
  const wsProtocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
  const wsBaseUrl = API_BASE_URL.replace(/^https?:/, wsProtocol);
  return `${wsBaseUrl}/ws/session/${sessionId}`;
}

export default apiClient;
