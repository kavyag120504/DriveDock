import { apiClient } from '../../api/client';

export const getBuyerReport = (token: string) =>
  apiClient.get(`/twin/buyer-report?token=${encodeURIComponent(token)}`);
