import API from './api';
import { activityHeartbeat } from './activityHeartbeat';

export interface UserSession {
  id: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'TEACHER' | 'STUDENT' | 'PARENT' | 'PRINCIPAL' | 'DEAN' | 'FACULTY' | 'CYBERADMIN';
  name: string;
  profileImage: string;
  mustChangePassword?: boolean;
  system?: 'ERP' | 'ADMISSION';
  firstName?: string;
  lastName?: string;
  phone?: string;
  employeeId?: string;
  designation?: string;
  department?: {
    id: string;
    name: string;
    code: string;
    type?: 'STANDARD' | 'SEMESTER_HANDLING';
    handlingSemesters?: number[];
  };
  isHod?: boolean;
  isFaculty?: boolean;
  workspaces?: string[];
}

export interface LoginResponse {
  success: boolean;
  requiresDailyOtp?: boolean;
  email?: string;
  role?: string;
  message?: string;
  data?: {
    token: string;
    user: UserSession;
  };
}

class AuthService {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await API.post('/auth/login', { email, password });
    if (response.data?.data?.token) {
      const { token, user } = response.data.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      activityHeartbeat.start();
    }
    return response.data;
  }

  async verifyDailyOtp(email: string, otp: string): Promise<UserSession> {
    const response = await API.post('/auth/verify-daily-otp', { email, otp });
    const { token, user } = response.data.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    activityHeartbeat.start();
    return user;
  }

  async resendDailyOtp(email: string, password?: string): Promise<any> {
    const response = await API.post('/auth/resend-daily-otp', { email, password });
    return response.data;
  }

  async sendRegistrationOtp(data: { firstName: string; lastName: string; email: string; phone?: string }): Promise<any> {
    return await API.post('/auth/send-registration-otp', data);
  }

  async verifyRegistrationOtp(email: string, otp: string): Promise<any> {
    return await API.post('/auth/verify-registration-otp', { email, otp });
  }

  async register(data: any): Promise<any> {
    return await API.post('/auth/register', data);
  }

  async sendForgotPasswordOtp(email: string, role?: string): Promise<any> {
    return await API.post('/auth/send-forgot-password-otp', { email, role });
  }

  async verifyForgotPasswordOtp(email: string, otp: string): Promise<any> {
    return await API.post('/auth/verify-forgot-password-otp', { email, otp });
  }

  async resetPassword(email: string, newPassword: string, confirmPassword?: string): Promise<any> {
    return await API.post('/auth/reset-password', { email, newPassword, confirmPassword });
  }

  async checkPhone(phone: string): Promise<any> {
    return await API.post('/auth/check-phone', { phone });
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<UserSession> {
    const response = await API.post('/auth/change-password', { oldPassword, newPassword });
    const { token, user } = response.data.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    activityHeartbeat.start();
    return user;
  }

  async logout(): Promise<void> {
    try {
      activityHeartbeat.stop();
      await API.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }

  getCurrentUser(): UserSession | null {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr) as UserSession;
    } catch {
      return null;
    }
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  async getUserWorkspaces(): Promise<any> {
    const response = await API.get('/auth/workspaces');
    return response.data?.data || response.data;
  }
}

export default new AuthService();
