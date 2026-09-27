import { Request, Response } from 'express';
import { Provider } from '../models/Provider';
import { Vehicle } from '../models/Vehicle';
import { DocumentModel } from '../models/Document';
import { Violation } from '../models/Violation';
import { Challan } from '../models/Challan';

/**
 * CRITICAL TRUST RULE 3: Admin Gatekeeping
 * Admin views pending, approved, or suspended providers.
 */
export const getProvidersByAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    const filter: Record<string, any> = {};

    if (status) {
      filter.status = status;
    }

    const providers = await Provider.find(filter)
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: providers.length, data: providers });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CRITICAL TRUST RULE 3:
 * Admin updates provider status (approved, suspended, pending).
 * Only when set to "approved" can this provider accept bookings and issue verified certificates.
 */
export const updateProviderStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'suspended'].includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Invalid status. Must be pending, approved, or suspended'
      });
      return;
    }

    const provider = await Provider.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate('userId', 'name email phone');

    if (!provider) {
      res.status(404).json({ success: false, message: 'Provider not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Provider '${provider.businessName}' status updated to '${status}'.`,
      data: provider
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GOVERNMENT / ADMIN ANALYTICS:
 * Real MongoDB aggregation queries
 */
export const getOverviewStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const totalVehicles = await Vehicle.countDocuments();
    const totalProviders = await Provider.countDocuments();
    const approvedProviders = await Provider.countDocuments({ status: 'approved' });
    const pendingProviders = await Provider.countDocuments({ status: 'pending' });

    // Document breakdown
    const totalDocuments = await DocumentModel.countDocuments();
    const verifiedDocuments = await DocumentModel.countDocuments({ verified: true, status: 'valid' });
    const unverifiedDocuments = await DocumentModel.countDocuments({ verified: false });
    const expiredDocuments = await DocumentModel.countDocuments({ status: 'expired' });

    // Violations and Challans
    const totalViolations = await Violation.countDocuments();
    const challanAgg = await Challan.aggregate([
      {
        $group: {
          _id: null,
          totalIssued: { $sum: '$amount' },
          totalCollected: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] }
          },
          paidCount: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          }
        }
      }
    ]);

    const challanData = challanAgg[0] || {
      totalIssued: 0,
      totalCollected: 0,
      paidCount: 0,
      pendingCount: 0
    };

    // Calculate vehicle compliance rate
    const vehicles = await Vehicle.find();
    let fullyCompliantCount = 0;

    for (const v of vehicles) {
      const docs = await DocumentModel.find({ vehicleId: v._id });
      const reqTypes = ['rc', 'insurance', 'puc', 'license', 'fitness'];
      const hasAllValidVerified = reqTypes.every((t) =>
        docs.some((d) => d.type === t && d.status === 'valid' && d.verified)
      );
      if (hasAllValidVerified) {
        fullyCompliantCount++;
      }
    }

    const complianceRate = totalVehicles > 0
      ? Math.round((fullyCompliantCount / totalVehicles) * 100)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        totalVehicles,
        fullyCompliantCount,
        complianceRate,
        documents: {
          total: totalDocuments,
          verified: verifiedDocuments,
          unverified: unverifiedDocuments,
          expired: expiredDocuments
        },
        providers: {
          total: totalProviders,
          approved: approvedProviders,
          pending: pendingProviders
        },
        enforcement: {
          totalViolations,
          challanTotalIssued: challanData.totalIssued,
          challanTotalCollected: challanData.totalCollected,
          challansPaid: challanData.paidCount,
          challansPending: challanData.pendingCount
        }
      }
    });
  } catch (error: any) {
    console.error('[AdminController.getOverviewStats] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getStatsByRegion = async (_req: Request, res: Response): Promise<void> => {
  try {
    const regionStats = await Vehicle.aggregate([
      {
        $group: {
          _id: { state: '$region.state', district: '$region.district' },
          count: { $sum: 1 },
          vehicleIds: { $push: '$_id' }
        }
      },
      {
        $lookup: {
          from: 'documents',
          localField: 'vehicleIds',
          foreignField: 'vehicleId',
          as: 'docs'
        }
      },
      {
        $project: {
          _id: 0,
          state: '$_id.state',
          district: '$_id.district',
          vehicleCount: '$count',
          totalDocuments: { $size: '$docs' },
          verifiedDocsCount: {
            $size: {
              $filter: {
                input: '$docs',
                as: 'd',
                cond: { $and: [{ $eq: ['$$d.verified', true] }, { $eq: ['$$d.status', 'valid'] }] }
              }
            }
          },
          expiredDocsCount: {
            $size: {
              $filter: {
                input: '$docs',
                as: 'd',
                cond: { $eq: ['$$d.status', 'expired'] }
              }
            }
          }
        }
      },
      { $sort: { vehicleCount: -1 } }
    ]);

    res.status(200).json({ success: true, data: regionStats });
  } catch (error: any) {
    console.error('[AdminController.getStatsByRegion] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDocumentTrends = async (_req: Request, res: Response): Promise<void> => {
  try {
    const trends = await DocumentModel.aggregate([
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          verifiedValid: {
            $sum: { $cond: [{ $and: [{ $eq: ['$verified', true] }, { $eq: ['$status', 'valid'] }] }, 1, 0] }
          },
          unverified: {
            $sum: { $cond: [{ $eq: ['$verified', false] }, 1, 0] }
          },
          expired: {
            $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({ success: true, data: trends });
  } catch (error: any) {
    console.error('[AdminController.getDocumentTrends] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
