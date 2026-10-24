import mongoose from 'mongoose';
import { DocumentModel, IDocument } from '../../../src/models/Document';
import { IVehicle } from '../../../src/models/Vehicle';
import { IUser } from '../../../src/models/User';
import { generateSampleDocument } from '../lib/image';
import { SeededRng } from '../lib/rng';
import { registerMany } from '../lib/registry';

// Document mix (must sum to 1.0):
//   50% verified + valid
//   15% verified + expiring_soon (expiry 5-25 days out)
//   15% expired (could be verified or unverified, half each)
//   20% unverified (owner-uploaded, verified:false, status valid)
type DocCategory = 'verified_valid' | 'verified_expiring' | 'verified_expired' | 'unverified_expired' | 'unverified_valid';

function pickCategory(rng: SeededRng): DocCategory {
  const r = rng.next();
  if (r < 0.50) return 'verified_valid';
  if (r < 0.65) return 'verified_expiring';
  if (r < 0.725) return 'verified_expired';
  if (r < 0.80) return 'unverified_expired';
  return 'unverified_valid';
}

const MS = {
  day:  86400000,
  year: 365 * 86400000,
};

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * MS.day);
}

export interface DocumentSeedResult {
  documentIds:         mongoose.Types.ObjectId[];
  expiredVehicleIds:   Set<string>;
  expiringSoonDocInfo: Array<{ docId: mongoose.Types.ObjectId; vehicleId: mongoose.Types.ObjectId; ownerId: mongoose.Types.ObjectId }>;
}

export async function seedSyntheticDocuments(
  runId:       string,
  vehicles:    (IVehicle & { _id: mongoose.Types.ObjectId })[],
  owners:      (IUser & { _id: mongoose.Types.ObjectId })[],
  providerIds: mongoose.Types.ObjectId[],
  rng:         SeededRng,
  dryRun:      boolean
): Promise<DocumentSeedResult> {

  if (dryRun) {
    let count = 0;
    for (const v of vehicles) count += v.fuelType === 'ev' ? 2 : 3;
    console.log(`[DRY-RUN] Would create ~${count} documents`);
    return { documentIds: [], expiredVehicleIds: new Set(), expiringSoonDocInfo: [] };
  }

  const documentIds: mongoose.Types.ObjectId[]  = [];
  const expiredVehicleIds   = new Set<string>();
  const expiringSoonDocInfo: Array<{ docId: mongoose.Types.ObjectId; vehicleId: mongoose.Types.ObjectId; ownerId: mongoose.Types.ObjectId }> = [];

  // Find an owner for each vehicle (by ownerId)
  const ownerById = new Map(owners.map((o) => [o._id.toString(), o]));

  for (const vehicle of vehicles) {
    const docTypes: Array<'rc' | 'insurance' | 'puc'> =
      vehicle.fuelType === 'ev' ? ['rc', 'insurance'] : ['rc', 'insurance', 'puc'];

    const owner = ownerById.get(vehicle.ownerId.toString()) || owners[0];

    for (const docType of docTypes) {
      const category = pickCategory(rng);
      let issueDate:  Date;
      let expiryDate: Date;
      let status:     'valid' | 'expiring_soon' | 'expired';
      let verified:   boolean;
      let issuedByProviderId: mongoose.Types.ObjectId | null = null;
      let lastUpdatedBy: 'owner' | 'provider';

      switch (category) {
        case 'verified_valid':
          issueDate  = daysFromNow(-rng.nextInt(60, 365));
          expiryDate = daysFromNow(rng.nextInt(30, 730));
          status     = 'valid';
          verified   = true;
          lastUpdatedBy = 'provider';
          issuedByProviderId = providerIds.length > 0 ? rng.pick(providerIds) : null;
          break;

        case 'verified_expiring':
          issueDate  = daysFromNow(-rng.nextInt(180, 365));
          expiryDate = daysFromNow(rng.nextInt(5, 25));
          status     = 'expiring_soon';
          verified   = true;
          lastUpdatedBy = 'provider';
          issuedByProviderId = providerIds.length > 0 ? rng.pick(providerIds) : null;
          break;

        case 'verified_expired':
          issueDate  = daysFromNow(-rng.nextInt(400, 730));
          expiryDate = daysFromNow(-rng.nextInt(5, 120));
          status     = 'expired';
          verified   = true;
          lastUpdatedBy = 'provider';
          issuedByProviderId = providerIds.length > 0 ? rng.pick(providerIds) : null;
          expiredVehicleIds.add(vehicle._id.toString());
          break;

        case 'unverified_expired':
          issueDate  = daysFromNow(-rng.nextInt(400, 730));
          expiryDate = daysFromNow(-rng.nextInt(5, 120));
          status     = 'expired';
          verified   = false;
          lastUpdatedBy = 'owner';
          expiredVehicleIds.add(vehicle._id.toString());
          break;

        case 'unverified_valid':
        default:
          issueDate  = daysFromNow(-rng.nextInt(30, 180));
          expiryDate = daysFromNow(rng.nextInt(60, 730));
          status     = 'valid';
          verified   = false;
          lastUpdatedBy = 'owner';
          break;
      }

      const img = await generateSampleDocument(
        docType,
        vehicle.regNumber,
        owner.name,
        issueDate,
        expiryDate
      );

      const doc = await DocumentModel.create({
        vehicleId:        vehicle._id,
        type:             docType,
        fileUrl:          img.fileUrl,
        fileHash:         img.fileHash,
        issueDate,
        expiryDate,
        status,
        lastUpdatedBy,
        verified,
        issuedByProviderId,
      });

      const docId = doc._id as mongoose.Types.ObjectId;
      documentIds.push(docId);

      if (status === 'expiring_soon' && verified) {
        expiringSoonDocInfo.push({
          docId,
          vehicleId: vehicle._id,
          ownerId:   vehicle.ownerId as mongoose.Types.ObjectId,
        });
      }
    }
  }

  await registerMany(runId, 'documents', documentIds);
  console.log(`[Documents] Created ${documentIds.length} documents`);
  console.log(`  Expired vehicles: ${expiredVehicleIds.size}, Expiring-soon docs: ${expiringSoonDocInfo.length}`);

  return { documentIds, expiredVehicleIds, expiringSoonDocInfo };
}
