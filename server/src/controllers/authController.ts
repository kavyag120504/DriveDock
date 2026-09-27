import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, UserRole } from '../models/User';
import { Provider } from '../models/Provider';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../services/tokenService';

export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone, password, role, address, businessName, serviceTypes, coordinates } = req.body;

    if (!name || !email || !phone || !password) {
      res.status(400).json({ success: false, message: 'Name, email, phone, and password are required' });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      res.status(409).json({ success: false, message: 'Email already registered' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userRole: UserRole = role || 'owner';

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
        status: 'pending' // Admin must approve before active
      });
    }

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

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
    const refreshToken = generateRefreshToken(tokenPayload);

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

    const payload = verifyRefreshToken(refreshToken);
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

    const newAccessToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

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
