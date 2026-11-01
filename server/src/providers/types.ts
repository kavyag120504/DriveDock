/**
 * Shared primitives for the adapter layer.
 *
 * Every external dependency (registry, payments, push, storage, sms, email, maps,
 * ocr) is reached ONLY through an adapter implementing one of these interfaces.
 * Each adapter runs in one of three modes:
 *   - 'real'    — talks to the live third party (requires credentials)
 *   - 'sandbox' — talks to the vendor sandbox OR a deterministic local stand-in
 *   - 'mock'    — pure in-memory stub, dev/test only
 *
 * In production, mock/sandbox adapters are forbidden: assertProductionReady()
 * (see ./index) throws at startup if any adapter is not 'real'.
 */

import crypto from 'crypto';

export type AdapterMode = 'real' | 'sandbox' | 'mock';

/** Normalised error so callers never see vendor-specific error shapes. */
export class AdapterError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export class BudgetExceededError extends AdapterError {
  constructor(provider: string, limit: number) {
    super(provider, `Daily call budget of ${limit} exceeded for '${provider}'`, undefined, false);
    this.name = 'BudgetExceededError';
  }
}

export class CircuitOpenError extends AdapterError {
  constructor(provider: string) {
    super(provider, `Circuit breaker is open for '${provider}'; refusing call`, undefined, true);
    this.name = 'CircuitOpenError';
  }
}

/** A short correlation id attached to each adapter call for log tracing. */
export const newRequestId = (): string => crypto.randomUUID();

/** Keys whose values must never be written to logs. */
const REDACT_KEYS = /^(name|email|phone|mobile|address|father|fatherName|chassis|engine|password|owner|aadhaar|dob)$/i;

/** Returns a shallow copy with personal-data fields masked, for safe logging. */
export function redact<T extends Record<string, any>>(obj: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT_KEYS.test(k) ? '[redacted]' : v;
  }
  return out;
}

/**
 * Per-adapter daily call budget + usage counter. Admin-visible via
 * getAdapterStatus() so paid APIs cannot cause a surprise bill.
 */
export class UsageMeter {
  private count = 0;
  private windowStartMs: number;

  constructor(
    public readonly provider: string,
    public readonly dailyBudget: number | null,
    private readonly nowFn: () => number = () => Date.now()
  ) {
    this.windowStartMs = this.nowFn();
  }

  private rollIfNeeded(): void {
    const DAY = 24 * 60 * 60 * 1000;
    if (this.nowFn() - this.windowStartMs >= DAY) {
      this.count = 0;
      this.windowStartMs = this.nowFn();
    }
  }

  record(): void {
    this.rollIfNeeded();
    if (this.dailyBudget !== null && this.count >= this.dailyBudget) {
      throw new BudgetExceededError(this.provider, this.dailyBudget);
    }
    this.count++;
  }

  snapshot(): { provider: string; used: number; budget: number | null } {
    this.rollIfNeeded();
    return { provider: this.provider, used: this.count, budget: this.dailyBudget };
  }
}

/** Minimal circuit breaker: opens after N consecutive failures, half-opens after cooldown. */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    public readonly provider: string,
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000,
    private readonly nowFn: () => number = () => Date.now()
  ) {}

  canPass(): boolean {
    if (this.openedAt === null) return true;
    if (this.nowFn() - this.openedAt >= this.cooldownMs) {
      // half-open: allow a trial call
      this.openedAt = null;
      this.failures = 0;
      return true;
    }
    return false;
  }

  onSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  onFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.openedAt = this.nowFn();
    }
  }

  get isOpen(): boolean {
    return this.openedAt !== null && this.nowFn() - this.openedAt < this.cooldownMs;
  }
}

export interface ResilienceOptions {
  provider: string;
  timeoutMs?: number;
  retries?: number;
  meter?: UsageMeter;
  breaker?: CircuitBreaker;
  /** Jitter seed so retries don't stampede; tests can pass 0 for determinism. */
  jitter?: () => number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wraps an async call with: usage budget, circuit breaker, timeout, and retries
 * with exponential backoff + jitter. Errors are normalised to AdapterError.
 */
export async function withResilience<T>(
  fn: (requestId: string) => Promise<T>,
  opts: ResilienceOptions
): Promise<T> {
  const { provider, timeoutMs = 10_000, retries = 2, meter, breaker } = opts;
  const jitter = opts.jitter ?? Math.random;

  if (breaker && !breaker.canPass()) throw new CircuitOpenError(provider);
  if (meter) meter.record();

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const requestId = newRequestId();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AdapterError(provider, `Timed out after ${timeoutMs}ms`, undefined, true)),
          timeoutMs
        );
      });
      const result = await Promise.race([fn(requestId), timeout]);
      breaker?.onSuccess();
      return result as T;
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof AdapterError ? err.retryable : true;
      if (!retryable || attempt === retries) break;
      const backoff = Math.min(2 ** attempt * 100, 2_000);
      await sleep(backoff + Math.floor(jitter() * 100));
    } finally {
      clearTimeout(timer);
    }
  }

  breaker?.onFailure();
  if (lastErr instanceof AdapterError) throw lastErr;
  throw new AdapterError(provider, (lastErr as Error)?.message || 'Adapter call failed', lastErr, false);
}
