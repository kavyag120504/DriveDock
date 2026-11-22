import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { ENV } from '../config/env';
import { User } from '../models/User';
import { PasswordReset } from '../models/PasswordReset';
import { providers } from '../providers';
import { revokeAllForUser } from '../services/refreshTokenService';
import { recordAudit } from '../services/auditLog';

const MAX_WRONG_CODES = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

// Same answer whether or not the account exists, so this endpoint cannot be used to find out who has an account.
const GENERIC_SENT = 'If an account matches, we have sent a reset code. It can take a minute to arrive.';

const hashCode = (userId: string, code: string): string =>
  crypto.createHmac('sha256', ENV.JWT_REFRESH_SECRET).update(`pwreset:${userId}:${code}`).digest('hex');

const looksLikeEmail = (value: string): boolean => value.includes('@');

/** Indian mobile numbers are compared on their last 10 digits, so "+91 98765 43210" and "9876543210" match. */
const phoneDigits = (value: string): string => value.replace(/\D/g, '').slice(-10);

const toE164 = (digits: string): string => `+91${digits}`;

async function findAccount(identifier: string) {
  const id = identifier.trim();
  if (looksLikeEmail(id)) return User.findOne({ email: id.toLowerCase() });
  const digits = phoneDigits(id);
  if (digits.length !== 10) return null;
  // Phone numbers are not unique in the schema; sending a code to a number shared by several accounts would be unsafe.
  // Stored numbers may contain spaces, dashes or a +91 prefix, so allow non-digits between the digits.
  const pattern = digits.split('').join('\\D*') + '$';
  const matches = await User.find({ phone: { $regex: pattern } }).limit(2);
  return matches.length === 1 ? matches[0] : null;
}

/** POST /auth/forgot-password: sends a 6-digit code by email or SMS. Always answers 200 with the same text. */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { identifier, channel } = req.body as { identifier: string; channel?: 'email' | 'sms' };
  const reply: { success: true; message: string; devCode?: string } = { success: true, message: GENERIC_SENT };

  try {
    const user = await findAccount(identifier);
    if (user) {
      const userId = String(user._id);
      const recent = await PasswordReset.findOne({ userId: user._id, createdAt: { $gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } });
      if (!recent) {
        const via: 'email' | 'sms' = channel ?? (looksLikeEmail(identifier) ? 'email' : 'sms');
        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
        await PasswordReset.deleteMany({ userId: user._id });
        await PasswordReset.create({
          userId: user._id,
          channel: via,
          codeHash: hashCode(userId, code),
          expiresAt: new Date(Date.now() + ENV.PASSWORD_RESET_TTL_MINUTES * 60 * 1000)
        });

        const minutes = String(ENV.PASSWORD_RESET_TTL_MINUTES);
        if (via === 'email') {
          await providers.email.send(
            user.email,
            'Your DriveDock password reset code',
            `Your DriveDock password reset code is ${code}.\n\nIt expires in ${minutes} minutes. If you did not ask for this, ignore this email; your password has not changed.`
          );
        } else {
          await providers.sms.send(toE164(phoneDigits(user.phone)), 'password_reset', { code, minutes });
        }
        await recordAudit({
          actorId: userId,
          actorRole: user.role,
          action: 'password_reset_requested',
          entityType: 'user',
          entityId: userId,
          metadata: { channel: via }
        });
        if (ENV.RESET_CODE_IN_RESPONSE && ENV.NODE_ENV !== 'production') reply.devCode = code;
      }
    }
  } catch (error) {
    // Never reveal whether the lookup or the send failed; the caller always gets the same answer.
    console.error('[forgotPassword] failed', (error as Error).name);
  }
  res.json(reply);
};

/** POST /auth/reset-password: checks the code, sets the new password and signs the account out everywhere. */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { identifier, code, newPassword } = req.body as { identifier: string; code: string; newPassword: string };
  const invalid = () => res.status(400).json({ success: false, message: 'That code is not valid or has expired. Request a new one.' });

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    return;
  }
  if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    res.status(400).json({ success: false, message: 'Password must contain at least one letter and one number' });
    return;
  }

  const user = await findAccount(identifier);
  if (!user) { invalid(); return; }

  const userId = String(user._id);
  const reset = await PasswordReset.findOne({ userId: user._id, usedAt: null, expiresAt: { $gt: new Date() } });
  if (!reset || reset.attempts >= MAX_WRONG_CODES) { invalid(); return; }

  const given = Buffer.from(hashCode(userId, String(code).trim()));
  const stored = Buffer.from(reset.codeHash);
  const matches = given.length === stored.length && crypto.timingSafeEqual(given, stored);
  if (!matches) {
    await PasswordReset.updateOne({ _id: reset._id }, { $inc: { attempts: 1 } });
    invalid();
    return;
  }

  // Burn the code first so a second request with it cannot win a race.
  const burned = await PasswordReset.updateOne({ _id: reset._id, usedAt: null }, { $set: { usedAt: new Date() } });
  if (burned.modifiedCount !== 1) { invalid(); return; }

  user.passwordHash = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
  await user.save();
  await revokeAllForUser(userId);
  await PasswordReset.deleteMany({ userId: user._id });
  await recordAudit({
    actorId: userId,
    actorRole: user.role,
    action: 'password_reset_completed',
    entityType: 'user',
    entityId: userId
  });

  res.json({ success: true, message: 'Password changed. Sign in with your new password.' });
};
