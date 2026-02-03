/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures in distributed systems
 */

export type CircuitBreakerState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number;        // Number of failures before opening
  successThreshold: number;        // Number of successes in half-open to close
  timeout: number;                 // Time in ms before attempting half-open
  resetTimeout?: number;           // Alternative name for timeout
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private nextAttempt = 0;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      failureThreshold: options.failureThreshold,
      successThreshold: options.successThreshold,
      timeout: options.resetTimeout ?? options.timeout,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitBreakerError(
          `Circuit breaker is OPEN. Retry after ${new Date(this.nextAttempt).toISOString()}`
        );
      }
      this.state = "half-open";
      this.successCount = 0;
    }

    this.totalCalls++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;

    if (this.state === "half-open") {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = "closed";
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.totalFailures++;

    if (this.state === "half-open") {
      this.state = "open";
      this.nextAttempt = Date.now() + this.options.timeout;
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = "open";
      this.nextAttempt = Date.now() + this.options.timeout;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Force circuit breaker to open (for testing)
   */
  forceOpen(): void {
    this.state = "open";
    this.nextAttempt = Date.now() + this.options.timeout;
  }

  /**
   * Force circuit breaker to close (for testing)
   */
  forceClose(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}
