/**
 * RegistryProvider — licensed vehicle-RC verification (Section 4 of the brief).
 *
 * The adapter returns ONLY the normalised, PII-free shape below. Owner name,
 * father's name, mobile, address and every other personal field from the vendor
 * response MUST be dropped inside the adapter and never stored or logged.
 *
 * The real implementation is intentionally not wired yet — the team chooses a
 * vendor (Cashfree / Surepass / Gridlines / Perfios) in Phase 3. Until then the
 * sandbox provides deterministic data so downstream work (claim flow, expiry
 * cross-check, verified:true marking) can be built and tested.
 */

import crypto from 'crypto';
import { AdapterError, AdapterMode, CircuitBreaker, UsageMeter, withResilience } from './types';

/** The ONLY data the rest of the system is ever allowed to see from the registry. */
export interface RegistryVehicle {
  registrationNumber: string;
  status: 'active' | 'suspended' | 'scrapped' | 'unknown';
  makeModel: string;
  fuelType: 'petrol' | 'diesel' | 'ev' | 'cng' | 'unknown';
  registrationDate: string | null; // ISO date
  rcValidUpto: string | null;
  insuranceValidUpto: string | null;
  pucValidUpto: string | null;
  fitnessValidUpto: string | null;
  challansPending: boolean;
}

export interface RegistryProvider {
  readonly mode: AdapterMode;
  /** Look up a vehicle by registration number. Never returns personal data. */
  lookup(registrationNumber: string): Promise<RegistryVehicle>;
  /**
   * Ownership proof: compare the last 5 chars of the chassis (and/or engine) number
   * the owner typed against the registry's record, server-side, case-insensitive.
   * The full values are never returned, stored or logged.
   */
  verifyOwnership(registrationNumber: string, chassisLast5: string): Promise<boolean>;
  status(): { provider: string; used: number; budget: number | null };
}

const hashInt = (s: string): number =>
  parseInt(crypto.createHash('sha256').update(s.toUpperCase()).digest('hex').slice(0, 8), 16);

const addDays = (base: Date, days: number): string => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Deterministic local stand-in for the vendor sandbox. Same registration number
 * always yields the same record. Produces NO personal data by construction.
 */
export class SandboxRegistryProvider implements RegistryProvider {
  readonly mode: AdapterMode = 'sandbox';
  private meter = new UsageMeter('registry', 1000);
  private breaker = new CircuitBreaker('registry');

  async lookup(registrationNumber: string): Promise<RegistryVehicle> {
    return withResilience(
      async () => {
        const reg = registrationNumber.toUpperCase().trim();
        if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/.test(reg)) {
          throw new AdapterError('registry', 'Malformed registration number', undefined, false);
        }
        const seed = hashInt(reg);
        const base = new Date('2022-01-01T00:00:00Z');
        const fuels: RegistryVehicle['fuelType'][] = ['petrol', 'diesel', 'ev', 'cng'];
        const makes = ['Maruti Swift', 'Hyundai i20', 'Honda City', 'Tata Nexon', 'Toyota Innova'];
        return {
          registrationNumber: reg,
          status: 'active',
          makeModel: makes[seed % makes.length],
          fuelType: fuels[seed % fuels.length],
          registrationDate: addDays(base, seed % 365),
          rcValidUpto: addDays(base, 3650 + (seed % 100)),
          insuranceValidUpto: addDays(base, 365 + (seed % 200)),
          pucValidUpto: addDays(base, 180 + (seed % 120)),
          fitnessValidUpto: addDays(base, 1825 + (seed % 90)),
          challansPending: seed % 5 === 0
        };
      },
      { provider: 'registry', meter: this.meter, breaker: this.breaker }
    );
  }

  async verifyOwnership(registrationNumber: string, chassisLast5: string): Promise<boolean> {
    // The sandbox derives a deterministic "chassis last 5" from the reg number.
    const reg = registrationNumber.toUpperCase().trim();
    const derived = crypto.createHash('sha256').update(`chassis:${reg}`).digest('hex').slice(0, 5).toUpperCase();
    return derived === chassisLast5.toUpperCase().trim();
  }

  /** Test-only: the value an owner would need to type to pass verifyOwnership. */
  expectedChassisLast5(registrationNumber: string): string {
    const reg = registrationNumber.toUpperCase().trim();
    return crypto.createHash('sha256').update(`chassis:${reg}`).digest('hex').slice(0, 5).toUpperCase();
  }

  status() {
    return this.meter.snapshot();
  }
}

/** Placeholder for the real, licensed vendor. Wired in Phase 3 once a vendor is chosen. */
export class UnconfiguredRegistryProvider implements RegistryProvider {
  readonly mode: AdapterMode = 'real';
  private fail(): never {
    throw new AdapterError('registry', 'Real registry provider is not configured yet (Phase 3)', undefined, false);
  }
  async lookup(): Promise<RegistryVehicle> {
    this.fail();
  }
  async verifyOwnership(): Promise<boolean> {
    this.fail();
  }
  status() {
    return { provider: 'registry', used: 0, budget: null };
  }
}
