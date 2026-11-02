import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, UserRole } from '../models/User';
import { Provider } from '../models/Provider';
import { generateAccessToken, verifyRefreshToken } from '../services/tokenService';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  listActiveSessions,
  RefreshError
} from '../services/refreshTokenService';
import { exportUserData } from '../services/accountData.service';

const PUBLIC_SIGNUP_ROLES: UserRole[] = ['owner', 'provider'];

/** Best-effort device label for the sessions list (client-supplied, else user-agent). */
const deviceOf = (req: Request): string => String(req.body?.device || req.headers['user-agent'] || '');

export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone, password, role, address, businessName, serviceTypes, coordinates } = req.body;

    if (!name || !email || !phone || !password) {
      res.status(400).json({ success: false, message: 'Name, email, phone, and password are required' });
      return;
    }

    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      res.status(400).json({ success: false, message: 'Password must contain at least one letter and one number' });
      return;
    }

    // Public signup may only create owner or provider accounts.
    // Officer, government and admin accounts are created by an admin (POST /admin/users).
    const userRole: UserRole = role === undefined ? 'owner' : role;
    if (!PUBLIC_SIGNUP_ROLES.includes(userRole)) {
      res.status(400).json({ success: false, message: 'Invalid role. Signup is only available for owner or provider accounts' });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      res.status(409).json({ success: false, message: 'Email already registered' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      phone,
      passwordHash,
      role: userRole,
      address: address || { city: '', state: '', pincode: '' }
    });

    // If registering as a provider, create Provider record in "pending" status (Trust Rule 3)
    if (userRole === 'provider') {
      const coords = coordinates && Array.isArray(coordinates) && coordinates.length === 2
        ? coordinates
        : [72.8777, 19.0760]; // Default Mumbai [lng, lat]

      await Provider.create({
        userId: user._id,
        businessName: businessName || `${name} Auto Care`,
        serviceTypes: serviceTypes || ['puc', 'fitness', 'insurance'],
        location: {
          type: 'Point',
          coordinates: coords
        },
        address: address ? `${address.city}, ${address.state}` : 'Mumbai, Maharashtra',
        workingHours: '09:00 AM - 07:00 PM',
        profileCompleted: false, // location/services above are placeholders until the centre profile form is filled in
        status: 'pending' // Admin must approve before active
      });
    }

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await issueRefreshToken(tokenPayload, deviceOf(req));

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          address: user.address
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error: any) {
    console.error('[AuthController.signup] error:', error);
    res.status(500).json({ success: false, message: error.message || 'Signup failed' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    let providerData = null;
    if (user.role === 'provider') {
      providerData = await Provider.findOne({ userId: user._id });
    }

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await issueRefreshToken(tokenPayload, deviceOf(req));

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          address: user.address,
          provider: providerData
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error: any) {
    console.error('[AuthController.login] error:', error);
    res.status(500).json({ success: false, message: error.message || 'Login failed' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'Refresh token is required' });
      return;
    }

    // Step 1: the token must be a well-formed, unexpired JWT signed by us.
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
      return;
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    const newPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    };

    // Step 2: rotate against the server-side store. A reuse of an already-rotated or
    // revoked token revokes the whole family inside the service and lands here.
    let newRefreshToken: string;
    try {
      newRefreshToken = await rotateRefreshToken(refreshToken, newPayload, deviceOf(req));
    } catch (err) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
        code: err instanceof RefreshError && err.reason === 'reuse' ? 'REFRESH_REUSE' : undefined
      });
      return;
    }

    const newAccessToken = generateAccessToken(newPayload);

    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error: any) {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

/** GET /auth/export — DPDP: a machine-readable copy of all data the caller owns. */
export const exportMyData = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthenticated' });
      return;
    }
    const data = await exportUserData(req.user.userId, req.user.role);
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** GET /auth/sessions — the caller's active (non-revoked, non-expired) refresh sessions. */
export const listSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthenticated' });
      return;
    }
    const sessions = await listActiveSessions(req.user.userId);
    res.status(200).json({ success: true, data: sessions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** POST /auth/logout-all — revoke every refresh token for the caller ("log out everywhere"). */
export const logoutAll = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthenticated' });
      return;
    }
    const revoked = await revokeAllForUser(req.user.userId);
    await User.findByIdAndUpdate(req.user.userId, { expoPushToken: '' });
    res.status(200).json({ success: true, message: `Logged out of ${revoked} session(s)`, data: { revoked } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthenticated' });
      return;
    }

    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    let providerData = null;
    if (user.role === 'provider') {
      providerData = await Provider.findOne({ userId: user._id });
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        provider: providerData
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePushToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthenticated' });
      return;
    }

    await User.findByIdAndUpdate(req.user.userId, { expoPushToken: token });
    res.status(200).json({ success: true, message: 'Push token updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    // Revoke the presented refresh token on this device (if the client sent it)...
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    // ...and clear the push token so a logged-out device stops receiving notifications.
    if (req.user) {
      await User.findByIdAndUpdate(req.user.userId, { expoPushToken: '' });
    }
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
