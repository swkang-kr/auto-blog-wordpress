import { logger } from './logger.js';

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  delayMs = 3000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

/**
 * Circuit Breaker pattern for external API calls.
 * Opens after `failureThreshold` consecutive failures, preventing calls for `resetTimeoutMs`.
 * Half-open state: allows one test call to check if service recovered.
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly name: string,
    private readonly failureThreshold: number = 3,
    private readonly resetTimeoutMs: number = 60_000, // 1 minute
  ) {}

  /** Check if circuit is allowing calls */
  isOpen(): boolean {
    if (this.state === 'open') {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'half-open';
        logger.info(`Circuit [${this.name}]: half-open, allowing test call`);
        return false;
      }
      return true;
    }
    return false;
  }

  /** Record a successful call */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      logger.info(`Circuit [${this.name}]: closed (service recovered)`);
    }
    this.failures = 0;
    this.state = 'closed';
  }

  /** Record a failed call */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      logger.warn(`Circuit [${this.name}]: OPEN after ${this.failures} consecutive failures. Blocking calls for ${this.resetTimeoutMs / 1000}s`);
    }
  }

  /** Execute function with circuit breaker protection */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error(`Circuit [${this.name}] is OPEN — skipping call to prevent cascade failure`);
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}

/** Shared circuit breakers for external services */
export const circuitBreakers = {
  wordpress: new CircuitBreaker('WordPress', 3, 120_000),
  gemini: new CircuitBreaker('Gemini', 3, 60_000),
  claude: new CircuitBreaker('Claude', 5, 120_000),
  ga4: new CircuitBreaker('GA4', 3, 60_000),
  gsc: new CircuitBreaker('GSC', 3, 60_000),
};
