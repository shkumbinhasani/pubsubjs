/**
 * Idempotency Key Manager
 * Prevents duplicate event processing
 */

export interface IdempotencyOptions {
  ttl?: number; // Time to live in milliseconds
  maxKeys?: number; // Maximum number of keys to store
}

export interface IdempotencyRecord {
  key: string;
  eventName: string;
  processedAt: number;
  result?: unknown;
}

export class IdempotencyManager {
  private keys = new Map<string, IdempotencyRecord>();
  private readonly options: Required<IdempotencyOptions>;
  private cleanupTimer: Timer | null = null;

  constructor(options: IdempotencyOptions = {}) {
    this.options = {
      ttl: options.ttl ?? 86400000, // 24 hours
      maxKeys: options.maxKeys ?? 10000,
    };

    // Start cleanup timer
    this.startCleanup();
  }

  /**
   * Check if a key has been processed
   */
  isProcessed(key: string): boolean {
    const record = this.keys.get(key);
    if (!record) return false;

    // Check if expired
    if (Date.now() - record.processedAt > this.options.ttl) {
      this.keys.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get the result of a processed key
   */
  getResult(key: string): unknown | undefined {
    const record = this.keys.get(key);
    return record?.result;
  }

  /**
   * Mark a key as processed
   */
  markProcessed(key: string, eventName: string, result?: unknown): void {
    // Clean up old keys if we're at the limit
    if (this.keys.size >= this.options.maxKeys) {
      this.cleanup();
    }

    this.keys.set(key, {
      key,
      eventName,
      processedAt: Date.now(),
      result,
    });
  }

  /**
   * Execute a function only if the key hasn't been processed
   */
  async execute<T>(
    key: string,
    eventName: string,
    fn: () => Promise<T>
  ): Promise<{ executed: boolean; result: T }> {
    if (this.isProcessed(key)) {
      console.log(`[Idempotency] Skipping duplicate ${eventName} with key ${key}`);
      return { executed: false, result: this.getResult(key) as T };
    }

    const result = await fn();
    this.markProcessed(key, eventName, result);
    return { executed: true, result };
  }

  /**
   * Remove a key from the store
   */
  removeKey(key: string): boolean {
    return this.keys.delete(key);
  }

  /**
   * Clean up expired keys
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, record] of this.keys.entries()) {
      if (now - record.processedAt > this.options.ttl) {
        this.keys.delete(key);
        removed++;
      }
    }

    // If still at limit, remove oldest keys
    if (this.keys.size >= this.options.maxKeys) {
      const sorted = Array.from(this.keys.entries()).sort(
        (a, b) => a[1].processedAt - b[1].processedAt
      );
      const toRemove = this.keys.size - this.options.maxKeys + 100; // Remove 100 extra
      
      for (let i = 0; i < toRemove && i < sorted.length; i++) {
        this.keys.delete(sorted[i][0]);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalKeys: number;
    oldestKey: number | null;
    newestKey: number | null;
  } {
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const record of this.keys.values()) {
      if (oldest === null || record.processedAt < oldest) {
        oldest = record.processedAt;
      }
      if (newest === null || record.processedAt > newest) {
        newest = record.processedAt;
      }
    }

    return {
      totalKeys: this.keys.size,
      oldestKey: oldest,
      newestKey: newest,
    };
  }

  /**
   * Start automatic cleanup
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const removed = this.cleanup();
      if (removed > 0) {
        console.log(`[Idempotency] Cleaned up ${removed} expired keys`);
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Shutdown the manager
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.keys.clear();
  }
}

/**
 * Generate an idempotency key from event data
 */
export function generateIdempotencyKey(
  eventName: string,
  payload: Record<string, unknown>,
  uniqueFields: string[] = ["orderId", "userId", "id"]
): string {
  const parts = [eventName];
  
  for (const field of uniqueFields) {
    if (payload[field]) {
      parts.push(String(payload[field]));
    }
  }

  if (parts.length === 1) {
    // No unique fields found, use timestamp and random
    parts.push(Date.now().toString(), Math.random().toString(36).substr(2, 9));
  }

  return parts.join(":");
}
