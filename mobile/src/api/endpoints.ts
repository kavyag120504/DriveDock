import { apiClient } from './client';

export const AuthAPI = {
  login: (data: { email: string; password: string }) => apiClient.post('/auth/login', data),
  signup: (data: any) => apiClient.post('/auth/signup', data),
  getMe: () => apiClient.get('/auth/me'),
  updatePushToken: (token: string) => apiClient.post('/users/push-token', { token })
};

export const VehiclesAPI = {
  list: () => apiClient.get('/vehicles'),
  getById: (id: string) => apiClient.get(`/vehicles/${id}`),
  create: (data: any) => apiClient.post('/vehicles', data),
  update: (id: string, data: any) => apiClient.patch(`/vehicles/${id}`, data),
  delete: (id: string) => apiClient.delete(`/vehicles/${id}`),
  getQRToken: (id: string) => apiClient.get(`/vehicles/${id}/qr-token`)
};

export const DocumentsAPI = {
  upload: (vehicleId: string, formData: FormData) =>
    apiClient.post(`/vehicles/${vehicleId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  getByVehicle: (vehicleId: string) => apiClient.get(`/vehicles/${vehicleId}/documents`),
  update: (id: string, data: any) => apiClient.patch(`/documents/${id}`, data)
};

export const ProvidersAPI = {
  search: (params?: { type?: string; lat?: number; lng?: number; radius?: number }) =>
    apiClient.get('/providers', { params }),
  getProfile: () => apiClient.get('/providers/me'),
  getSlots: (providerId: string, date?: string) =>
    apiClient.get(`/providers/${providerId}/slots`, { params: { date } }),
  createSlots: (providerId: string, slots: any[]) =>
    apiClient.post(`/providers/${providerId}/slots`, { slots })
};

export const BookingsAPI = {
  create: (data: { vehicleId: string; providerId: string; slotId: string; documentType: string }) =>
    apiClient.post('/bookings', data),
  list: () => apiClient.get('/bookings'),
  getById: (id: string) => apiClient.get(`/bookings/${id}`),
  updateStatus: (id: string, formData: FormData | any) => {
    if (formData instanceof FormData) {
      return apiClient.patch(`/bookings/${id}/status`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
    return apiClient.patch(`/bookings/${id}/status`, formData);
  }
};

export const PaymentsAPI = {
  createOrder: (data: { bookingId: string; amount: number }) => apiClient.post('/payments/create-order', data),
  verify: (data: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string; bookingId?: string }) =>
    apiClient.post('/payments/verify', data)
};

export const RemindersAPI = {
  list: () => apiClient.get('/reminders'),
  triggerJob: () => apiClient.post('/reminders/trigger-job')
};

export const VerificationAPI = {
  verifyToken: (token: string) => apiClient.get(`/public/verify?token=${encodeURIComponent(token)}`)
};

export const OfficerAPI = {
  logViolation: (data: { vehicleId: string; documentTypeExpired: string[]; location: string; notes?: string; penaltyAmount?: number }) =>
    apiClient.post('/violations', data),
  getViolations: (vehicleId?: string) =>
    apiClient.get('/violations', { params: { vehicleId } })
};

export const ChallansAPI = {
  getByVehicle: (vehicleId: string) => apiClient.get(`/challans/${vehicleId}`),
  pay: (id: string) => apiClient.patch(`/challans/${id}/pay`)
};

export const AdminAPI = {
  getProviders: (status?: string) => apiClient.get('/admin/providers', { params: { status } }),
  updateProviderStatus: (id: string, status: string) => apiClient.patch(`/admin/providers/${id}/status`, { status }),
  getOverview: () => apiClient.get('/admin/stats/overview'),
  getByRegion: () => apiClient.get('/admin/stats/by-region'),
  getDocumentTrends: () => apiClient.get('/admin/stats/document-trends')
};

export const StationsAPI = {
  nearby: (params: { lat: number; lng: number; radius?: number; type?: string }) =>
    apiClient.get('/stations', { params }),
  getById: (id: string) => apiClient.get(`/stations/${id}`),
  getSlots: (id: string, date: string) => apiClient.get(`/stations/${id}/slots`, { params: { date } })
};
