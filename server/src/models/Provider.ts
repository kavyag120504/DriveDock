import mongoose, { Schema, Types } from 'mongoose';

export type ProviderStatus = 'pending' | 'approved' | 'suspended';

export interface IProvider {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  businessName: string;
  serviceTypes: string[];
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  address: string;
  workingHours: string;
  rating: number;
  status: ProviderStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const ProviderSchema = new Schema<IProvider>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    businessName: { type: String, required: true, trim: true },
    serviceTypes: {
      type: [String],
      required: true,
      default: ['puc', 'fitness', 'insurance']
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
        required: true
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    },
    address: { type: String, required: true },
    workingHours: { type: String, default: '09:00 AM - 07:00 PM' },
    rating: { type: Number, default: 4.8 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'suspended'],
      default: 'pending',
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

ProviderSchema.index({ location: '2dsphere' });

export const Provider = mongoose.model<IProvider>('Provider', ProviderSchema);
