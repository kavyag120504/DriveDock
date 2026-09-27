import mongoose, { Schema, Types } from 'mongoose';

export type VehicleType = 'car' | 'bike' | 'other';
export type FuelType = 'petrol' | 'diesel' | 'ev';

export interface IVehicle {
  _id?: Types.ObjectId;
  ownerId: Types.ObjectId;
  regNumber: string;
  type: VehicleType;
  fuelType: FuelType;
  make: string;
  model: string;
  year: number;
  qrCodeId: string;
  region: {
    state: string;
    district: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const VehicleSchema = new Schema<IVehicle>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    regNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ['car', 'bike', 'other'], required: true, default: 'car' },
    fuelType: { type: String, enum: ['petrol', 'diesel', 'ev'], required: true, default: 'petrol' },
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    qrCodeId: { type: String, required: true, unique: true, index: true },
    region: {
      state: { type: String, required: true, default: 'Maharashtra' },
      district: { type: String, required: true, default: 'Mumbai' }
    }
  },
  {
    timestamps: true
  }
);

VehicleSchema.index({ ownerId: 1 });

export const Vehicle = mongoose.model<IVehicle>('Vehicle', VehicleSchema);
