import mongoose, { Schema, Types } from 'mongoose';

export interface ISeedRegistry {
  collectionName: string;
  docId: Types.ObjectId;
  runId: string;
  createdAt: Date;
}

const SeedRegistrySchema = new Schema<ISeedRegistry>({
  collectionName: { type: String, required: true, index: true },
  docId:          { type: Schema.Types.ObjectId, required: true },
  runId:          { type: String, required: true, index: true },
  createdAt:      { type: Date, default: Date.now }
});

SeedRegistrySchema.index({ collectionName: 1, docId: 1 }, { unique: true });

export const SeedRegistry = mongoose.model<ISeedRegistry>('SeedRegistry', SeedRegistrySchema);
