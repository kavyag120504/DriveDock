import mongoose, { Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'owner' | 'provider' | 'officer' | 'government' | 'admin';

export interface IUser {
  _id?: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: UserRole;
  address: {
    city: string;
    state: string;
    pincode: string;
  };
  expoPushToken?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

type UserModel = mongoose.Model<IUser, {}, IUserMethods>;

const UserSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['owner', 'provider', 'officer', 'government', 'admin'],
      required: true,
      default: 'owner'
    },
    address: {
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' }
    },
    expoPushToken: { type: String, default: '' }
  },
  {
    timestamps: true
  }
);

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

export const User = mongoose.model<IUser, UserModel>('User', UserSchema);
