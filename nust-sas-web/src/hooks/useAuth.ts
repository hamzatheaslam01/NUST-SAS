import { useState, useEffect } from 'react';
import { authApi, getToken } from '../lib/api';

interface UserProfile {
  id: string;
  cms_id: string;
  role: 'student' | 'teacher' | 'admin';
  is_active: boolean;
}

interface Session {
  access_token: string;
  user: any;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = getToken();
      
      if (token) {
        // Optimistically set session
        setSession({ access_token: token, user: {} });
        
        try {
          const profileData = await authApi.getProfile();
          setProfile(profileData);
        } catch (error) {
          console.error('Failed to fetch profile:', error);
          // If profile fetch fails (e.g. invalid token), clear session
          setSession(null);
          setProfile(null);
        }
      } else {
        setSession(null);
        setProfile(null);
      }
      
      setLoading(false);
    };

    initAuth();
  }, []);

  return { session, profile, loading };
}
