import { Request, Response } from 'express';
import { DocumentModel, DocumentType, DocumentStatus } from '../models/Document';
import { Vehicle } from '../models/Vehicle';
import { Reminder } from '../models/Reminder';
import { processUploadedFile, discardUploadedFile } from '../services/uploadService';
import { ownerScope } from '../services/accessService';

const calculateStatus = (expiryDate: Date): DocumentStatus => {
  const now = new Date();
  const diffTime = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring_soon';
  return 'valid';
};

const scheduleDocumentReminders = async (
  documentId: string,
  vehicleId: string,
  ownerId: string,
  expiryDate: Date,
  docType: DocumentType
) => {
  // Clear any existing pending reminders for this document
  await Reminder.deleteMany({ documentId, sent: false });

  const thresholds = [30, 7, 1]; // days before expiry
  const newReminders = [];

  for (const days of thresholds) {
    const scheduledDate = new Date(expiryDate.getTime() - days * 24 * 60 * 60 * 1000);
    newReminders.push({
      documentId,
      vehicleId,
      ownerId,
      scheduledFor: scheduledDate,
      thresholdDays: days,
      channel: 'push',
      message: `Your vehicle's ${docType.toUpperCase()} document is expiring in ${days} day(s). Tap to book a renewal slot.`,
      sent: false
    });
  }

  if (newReminders.length > 0) {
    await Reminder.insertMany(newReminders);
  }
};

export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vehicleId } = req.params;
    const { type, issueDate, expiryDate } = req.body;

    if (!req.file) {
      res.status(400).json({ success: false, message: 'Document file is required' });
      return;
    }

    if (!type || !issueDate || !expiryDate) {
      res.status(400).json({ success: false, message: 'Document type, issueDate, and expiryDate are required' });
      return;
    }

    const vehicle = await Vehicle.findOne({ _id: vehicleId, ...ownerScope(req.user!) });
    if (!vehicle) {
      discardUploadedFile(req.file);
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    // Process file upload (S3 or local disk fallback) and get sha256 hash
    const host = req.get('host') || 'localhost:5000';
    const { fileUrl, fileHash } = await processUploadedFile(req.file, host);

    const parsedExpiry = new Date(expiryDate);
    const parsedIssue = new Date(issueDate);
    const status = calculateStatus(parsedExpiry);

    // CRITICAL TRUST RULE 1:
    // A document uploaded by an owner for personal tracking defaults strictly to verified: false!
    // It can ONLY become verified: true when an approved provider confirms a completed service.
    let document = await DocumentModel.findOne({ vehicleId, type });

    if (document) {
      document.fileUrl = fileUrl;
      document.fileHash = fileHash;
      document.issueDate = parsedIssue;
      document.expiryDate = parsedExpiry;
      document.status = status;
      document.lastUpdatedBy = 'owner';
      document.verified = false; // Reset to unverified on manual owner re-upload
      document.issuedByProviderId = null;
      await document.save();
    } else {
      document = await DocumentModel.create({
        vehicleId,
        type,
        fileUrl,
        fileHash,
        issueDate: parsedIssue,
        expiryDate: parsedExpiry,
        status,
        lastUpdatedBy: 'owner',
        verified: false, // Strictly unverified
        issuedByProviderId: null
      });
    }

    // Schedule idempotent reminders (Trust Rule 7)
    await scheduleDocumentReminders(
      document._id.toString(),
      vehicle._id.toString(),
      vehicle.ownerId.toString(),
      parsedExpiry,
      type as DocumentType
    );

    res.status(201).json({
      success: true,
      message: 'Document uploaded for personal tracking. Status is unverified until certified by an approved provider.',
      data: document
    });
  } catch (error: any) {
    console.error('[DocumentController.uploadDocument] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getVehicleDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vehicleId } = req.params;

    const vehicle = await Vehicle.findOne({ _id: vehicleId, ...ownerScope(req.user!) });
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    const documents = await DocumentModel.find({ vehicleId })
      .populate('issuedByProviderId', 'businessName address rating')
      .sort({ expiryDate: 1 });

    res.status(200).json({ success: true, data: documents });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { issueDate, expiryDate } = req.body;

    const document = await DocumentModel.findById(id);
    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    // Only the vehicle's owner (or admin) can edit its documents
    const vehicle = await Vehicle.findOne({ _id: document.vehicleId, ...ownerScope(req.user!) });
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Document not found or unauthorized' });
      return;
    }

    if (issueDate) document.issueDate = new Date(issueDate);
    if (expiryDate) {
      document.expiryDate = new Date(expiryDate);
      document.status = calculateStatus(document.expiryDate);
    }

    // A manual edit always resets the verified flag: only a completed booking can verify a document
    document.verified = false;
    document.lastUpdatedBy = 'owner';

    await document.save();

    res.status(200).json({ success: true, data: document });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
