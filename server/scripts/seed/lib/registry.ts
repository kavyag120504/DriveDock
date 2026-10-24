import mongoose from 'mongoose';
import { SeedRegistry } from '../models/SeedRegistry';

export async function register(
  runId: string,
  collection: string,
  docId: mongoose.Types.ObjectId
): Promise<void> {
  await SeedRegistry.create({ collectionName: collection, docId, runId });
}

export async function registerMany(
  runId: string,
  collection: string,
  docIds: mongoose.Types.ObjectId[]
): Promise<void> {
  if (docIds.length === 0) return;
  await SeedRegistry.insertMany(docIds.map((docId) => ({ collectionName: collection, docId, runId })));
}
