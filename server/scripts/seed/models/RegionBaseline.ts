import mongoose, { Schema } from 'mongoose';

export interface IRegionBaseline {
  state: string;
  rto: string;
  fuelType: string;
  vehicleClass: string;
  registrations: number;
  periodFrom: Date;
  periodTo: Date;
  source: string;
}

const RegionBaselineSchema = new Schema<IRegionBaseline>({
  state:         { type: String, required: true, index: true },
  rto:           { type: String, required: true },
  fuelType:      { type: String, required: true },
  vehicleClass:  { type: String, required: true },
  registrations: { type: Number, required: true },
  periodFrom:    { type: Date,   required: true },
  periodTo:      { type: Date,   required: true },
  source:        { type: String, default: 'VAHAN open data (India Data Portal)' }
});

RegionBaselineSchema.index({ state: 1, rto: 1 });

export const RegionBaseline = mongoose.model<IRegionBaseline>('RegionBaseline', RegionBaselineSchema);
