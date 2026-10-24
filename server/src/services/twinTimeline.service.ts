import { Types } from 'mongoose';
import { DocumentModel } from '../models/Document';
import { Booking } from '../models/Booking';
import { Violation } from '../models/Violation';
import { Challan } from '../models/Challan';
import { OwnershipTransfer } from '../models/OwnershipTransfer';

export interface TimelineItem {
  type: 'document' | 'service' | 'violation' | 'challan' | 'ownership';
  title: string;
  date: Date;
  detail: string;
}

/**
 * Builds a unified timeline for a vehicle by reading existing collections.
 * No changes to any existing data; read-only aggregation.
 * Past owners are shown as "Owner N" — never by name or contact details.
 */
export const buildTimeline = async (vehicleId: string | Types.ObjectId): Promise<TimelineItem[]> => {
  const vid = vehicleId.toString();
  const items: TimelineItem[] = [];

  // Verified documents
  const docs = await DocumentModel.find({ vehicleId: vid, verified: true }).populate('issuedByProviderId', 'businessName');
  for (const d of docs) {
    items.push({
      type: 'document',
      title: `${d.type.toUpperCase()} Verified`,
      date: d.updatedAt ?? d.createdAt!,
      detail: `Certified by ${(d.issuedByProviderId as any)?.businessName ?? 'Approved Provider'}. Valid until ${new Date(d.expiryDate).toLocaleDateString('en-IN')}`
    });
  }

  // Completed bookings
  const bookings = await Booking.find({ vehicleId: vid, status: 'completed' }).populate('providerId', 'businessName');
  for (const b of bookings) {
    items.push({
      type: 'service',
      title: `${b.documentType.toUpperCase()} Service Completed`,
      date: b.updatedAt ?? b.createdAt!,
      detail: `At ${(b.providerId as any)?.businessName ?? 'Approved Station'}`
    });
  }

  // Violations
  const violations = await Violation.find({ vehicleId: vid });
  for (const v of violations) {
    items.push({
      type: 'violation',
      title: 'Traffic Violation Recorded',
      date: v.createdAt!,
      detail: `Location: ${v.location}. Docs: ${v.documentTypeExpired.join(', ')}`
    });
  }

  // Challans
  const challans = await Challan.find({ vehicleId: vid });
  for (const c of challans) {
    items.push({
      type: 'challan',
      title: `e-Challan ${c.status === 'paid' ? 'Paid' : 'Issued'}`,
      date: c.issuedAt,
      detail: `₹${c.amount} — ${c.reason}`
    });
  }

  // Ownership transfers — no names, no contact details
  const transfers = await OwnershipTransfer.find({ vehicleId: vid, status: 'accepted' }).sort({ acceptedAt: 1 });
  transfers.forEach((t, i) => {
    items.push({
      type: 'ownership',
      title: 'Ownership Transfer',
      date: t.acceptedAt!,
      detail: `Owner ${i + 1} transferred to Owner ${i + 2}. Twin Score at transfer: ${t.snapshot.score}`
    });
  });

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return items;
};
