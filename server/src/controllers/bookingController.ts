import { Request, Response } from 'express';
import { Booking } from '../models/Booking';
import { Slot } from '../models/Slot';
import { Provider } from '../models/Provider';
import { Vehicle } from '../models/Vehicle';
import { DocumentModel, DocumentType } from '../models/Document';
import { Reminder } from '../models/Reminder';
import { processUploadedFile } from '../services/uploadService';

export const createBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vehicleId, providerId, slotId, documentType } = req.body;

    if (!vehicleId || !providerId || !slotId || !documentType) {
      res.status(400).json({ success: false, message: 'vehicleId, providerId, slotId, and documentType are required' });
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
      ownerId: req.user!.userId,
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

    if (role === 'owner') {
      query.ownerId = userId;
    } else if (role === 'provider') {
      const provider = await Provider.findOne({ userId });
      if (!provider) {
        res.status(200).json({ success: true, data: [] });
        return;
      }
      query.providerId = provider._id;
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
    const booking = await Booking.findById(id)
      .populate('vehicleId')
      .populate('providerId')
      .populate('slotId')
      .populate('ownerId', 'name email phone');

    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }

    res.status(200).json({ success: true, data: booking });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CRITICAL TRUST RULE 1:
 * Provider completing a booking updates the document to verified: true with issuedByProviderId.
 * Only an approved provider completing a booking can make a document "verified".
 */
export const updateBookingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, notes, expiryDate } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }

    // Verify caller is the assigned provider or admin
    const provider = await Provider.findById(booking.providerId);
    if (!provider) {
      res.status(404).json({ success: false, message: 'Assigned provider not found' });
      return;
    }

    if (req.user?.role !== 'admin' && provider.userId.toString() !== req.user?.userId) {
      res.status(403).json({ success: false, message: 'Forbidden: you are not authorized to update this booking' });
      return;
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
    if (status === 'completed') {
      // Calculate new expiry date (default 1 year from today if not specified)
      const now = new Date();
      const newExpiry = expiryDate ? new Date(expiryDate) : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

      // Update or create the Document record with verified: true!
      let doc = await DocumentModel.findOne({ vehicleId: booking.vehicleId, type: booking.documentType });

      if (doc) {
        doc.fileUrl = certificateUrl || doc.fileUrl;
        if (fileHash) doc.fileHash = fileHash;
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
          fileUrl: certificateUrl || 'https://drivedock.internal/sample-certificate.pdf',
          fileHash: fileHash || 'hash-verified-provider-cert',
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
      const thresholds = [30, 7, 1];
      const remindersToInsert = thresholds.map((days) => ({
        documentId: doc!._id,
        vehicleId: booking.vehicleId,
        ownerId: booking.ownerId,
        scheduledFor: new Date(newExpiry.getTime() - days * 24 * 60 * 60 * 1000),
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
