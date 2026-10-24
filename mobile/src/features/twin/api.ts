import { apiClient } from '../../api/client';

export const TwinAPI = {
  // Score + ownership chain for a vehicle the caller owns
  getScore: (vehicleId: string) =>
    apiClient.get(`/twin/vehicles/${vehicleId}/score`),

  // Unified timeline for a vehicle the caller owns
  getTimeline: (vehicleId: string) =>
    apiClient.get(`/twin/vehicles/${vehicleId}/timeline`),

  // Initiate a transfer (returns a signed token to render as QR)
  createTransfer: (vehicleId: string) =>
    apiClient.post('/twin/transfers', { vehicleId }),

  // Authenticated preview before accepting (buyer calls this)
  previewTransfer: (token: string) =>
    apiClient.get(`/twin/transfers/preview?token=${encodeURIComponent(token)}`),

  // Accept a pending transfer (buyer)
  acceptTransfer: (token: string) =>
    apiClient.post('/twin/transfers/accept', { token }),

  // Cancel a pending transfer (seller)
  cancelTransfer: (transferId: string) =>
    apiClient.post(`/twin/transfers/${transferId}/cancel`),

  // List incoming and outgoing transfers for the current user
  listTransfers: () =>
    apiClient.get('/twin/transfers'),

  // Create a 7-day read-only share link
  createShare: (vehicleId: string) =>
    apiClient.post(`/twin/vehicles/${vehicleId}/share`),

  // List active shares for a vehicle
  listShares: (vehicleId: string) =>
    apiClient.get(`/twin/vehicles/${vehicleId}/shares`),

  // Revoke a share
  revokeShare: (shareId: string) =>
    apiClient.delete(`/twin/shares/${shareId}`),

  // Public (no auth): view a shared twin summary
  publicView: (token: string) =>
    apiClient.get(`/public/twin?token=${encodeURIComponent(token)}`)
};
