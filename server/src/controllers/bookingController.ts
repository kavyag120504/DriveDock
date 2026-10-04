import { Request, Response } from 'express';
import { Booking } from '../models/Booking';
import { Slot } from '../models/Slot';
import { Provider } from '../models/Provider';
import { Vehicle } from '../models/Vehicle';
import { DocumentModel, DocumentType } from '../models/Document';
import { Reminder } from '../models/Reminder';
import { processUploadedFile, discardUploadedFile } from '../services/uploadService';
import { ownerScope, canAccessBooking } from '../services/accessService';

export const createBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vehicleId, providerId, slotId, documentType } = req.body;

    if (!vehicleId || !providerId || !slotId || !documentType) {
      res.status(400).json({ success: false, message: 'vehicleId, providerId, slotId, and documentType are required' });
      return;
    }

    // A booking can only be created for the caller's own vehicle (admin: any vehicle).
    // Checked before the slot is claimed so a refused request never consumes a slot.
    const vehicle = await Vehicle.findOne({ _id: vehicleId, ...ownerScope(req.user!) });
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    // Verify provider is approved (Trust Rule 3)
    const provider = await Provider.findById(providerId);
    if (!provider || provider.status !== 'approved') {
      res.status(400).json({ success: false, message: 'Provider is not approved or not found' });
      return;
    }

    // CRITICAL TRUST RULE 5:
    // Atomic Concurrent Slot Claim:
    // findOneAndUpdate with isBooked: false -> true, checking the result isn't null.
    // This strictly prevents race conditions and double-booking under concurrent requests.
    const slot = await Slot.findOneAndUpdate(
      { _id: slotId, providerId, isBooked: false },
      { $set: { isBooked: true } },
      { new: true }
    );

    if (!slot) {
      res.status(409).json({
        success: false,
        message: 'This slot is already booked or no longer available. Please select another slot.'
      });
      return;
    }

    const booking = await Booking.create({
      ownerId: vehicle.ownerId,
      vehicleId,
      providerId,
      slotId,
      documentType,
      status: 'pending' // pending until payment confirmed
    });

    res.status(201).json({
      success: true,
      message: 'Slot claimed atomically. Proceed to payment verification.',
      data: {
        booking,
        slot
      }
    });
  } catch (error: any) {
    console.error('[BookingController.createBooking] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, userId } = req.user!;
    let query: Record<string, any> = {};

    if (role === 'provider') {
      const provider = await Provider.findOne({ userId });
      if (!provider) {
        res.status(200).json({ success: true, data: [] });
        return;
      }
      query.providerId = provider._id;
    } else {
      // Callers only see their own bookings; admin sees all
      query = ownerScope(req.user!);
    }

    const bookings = await Booking.find(query)
      .populate('vehicleId', 'regNumber make model year fuelType')
      .populate('providerId', 'businessName address phone rating')
      .populate('slotId', 'date startTime endTime')
      .populate('ownerId', 'name email phone')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: bookings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBookingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id);

    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }

    if (!(await canAccessBooking(req.user!, booking))) {
      res.status(403).json({ success: false, message: 'Forbidden: you are not authorized to view this booking' });
      return;
    }

    await booking.populate([
      { path: 'vehicleId' },
      { path: 'providerId' },
      { path: 'slotId' },
      { path: 'ownerId', select: 'name email phone' }
    ]);

    res.status(200).json({ success: true, data: booking });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CRITICAL TRUST RULE 1:
 * Provider completing a booking updates the document to verified: true with issuedByProviderId.
 * A document only becomes "verified" when all of these hold at the moment of completion:
 * - the booking is confirmed (payment verified server-side)
 * - the assigned provider is currently approved
 * - a certificate file is uploaded (its SHA-256 is stored on the document)
 */
export const updateBookingStatus = async (req: Request, res: Response): Promise<void> => {
  // Removes the uploaded file before responding, so refused requests leave nothing in /uploads
  const reject = (statusCode: number, message: string): void => {
    discardUploadedFile(req.file);
    res.status(statusCode).json({ success: false, message });
  };

  try {
    const { id } = req.params;
    const { status, notes, expiryDate } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      reject(404, 'Booking not found');
      return;
    }

    // Verify caller is the assigned provider or admin
    const provider = await Provider.findById(booking.providerId);
    if (!provider) {
      reject(404, 'Assigned provider not found');
      return;
    }

    if (req.user?.role !== 'admin' && provider.userId.toString() !== req.user?.userId) {
      reject(403, 'Forbidden: you are not authorized to update this booking');
      return;
    }

    let newExpiry: Date | null = null;

    if (status) {
      // "confirmed" is only ever set by server-side payment verification, never through this endpoint
      if (status !== 'completed' && status !== 'cancelled') {
        reject(400, 'Invalid status. Only completed or cancelled can be set on a booking');
        return;
      }

      if (booking.status === 'completed' || booking.status === 'cancelled') {
        reject(400, `Booking is already ${booking.status}`);
        return;
      }
    }

    if (status === 'completed') {
      if (booking.status !== 'confirmed') {
        reject(400, 'Booking must be paid and confirmed before it can be completed');
        return;
      }

      if (provider.status !== 'approved') {
        reject(403, 'Forbidden: provider is not approved to issue verified certificates');
        return;
      }

      if (!req.file) {
        reject(400, 'A certificate file is required to complete a booking');
        return;
      }

      // Calculate new expiry date (default 1 year from today if not specified)
      const now = new Date();
      newExpiry = expiryDate ? new Date(expiryDate) : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      if (isNaN(newExpiry.getTime())) {
        reject(400, 'expiryDate is not a valid date');
        return;
      }
    }

    if (status) {
      booking.status = status;
    }
    if (notes) {
      booking.notes = notes;
    }

    // If file certificate is uploaded
    let certificateUrl = booking.certificateUrl;
    let fileHash = '';
    if (req.file) {
      const host = req.get('host') || 'localhost:5000';
      const result = await processUploadedFile(req.file, host);
      certificateUrl = result.fileUrl;
      fileHash = result.fileHash;
      booking.certificateUrl = certificateUrl;
    }

    // When provider completes the job:
    if (status === 'completed' && newExpiry && certificateUrl && fileHash) {
      const now = new Date();

      // Update or create the Document record with verified: true!
      let doc = await DocumentModel.findOne({ vehicleId: booking.vehicleId, type: booking.documentType });

      if (doc) {
        doc.fileUrl = certificateUrl;
        doc.fileHash = fileHash;
        doc.issueDate = now;
        doc.expiryDate = newExpiry;
        doc.status = 'valid';
        doc.lastUpdatedBy = 'provider';
        doc.verified = true; // CRITICAL: Only provider completion sets verified to TRUE!
        doc.issuedByProviderId = provider._id;
        await doc.save();
      } else {
        doc = await DocumentModel.create({
          vehicleId: booking.vehicleId,
          type: booking.documentType,
          fileUrl: certificateUrl,
          fileHash,
          issueDate: now,
          expiryDate: newExpiry,
          status: 'valid',
          lastUpdatedBy: 'provider',
          verified: true, // CRITICAL: Verified is TRUE
          issuedByProviderId: provider._id
        });
      }

      // Schedule fresh reminders for the newly verified document (Trust Rule 7)
      await Reminder.deleteMany({ documentId: doc._id, sent: false });
      const expiryTime = newExpiry.getTime();
      const thresholds = [30, 7, 1];
      const remindersToInsert = thresholds.map((days) => ({
        documentId: doc!._id,
        vehicleId: booking.vehicleId,
        ownerId: booking.ownerId,
        scheduledFor: new Date(expiryTime - days * 24 * 60 * 60 * 1000),
        thresholdDays: days,
        channel: 'push' as const,
        message: `Your vehicle's verified ${booking.documentType.toUpperCase()} certificate will expire in ${days} days.`,
        sent: false
      }));
      await Reminder.insertMany(remindersToInsert);
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: status === 'completed'
        ? 'Booking marked completed. Document certificate issued and marked VERIFIED!'
        : 'Booking updated successfully',
      data: booking
    });
  } catch (error: any) {
    console.error('[BookingController.updateBookingStatus] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
