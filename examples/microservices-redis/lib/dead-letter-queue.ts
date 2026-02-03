/**
 * Dead Letter Queue (DLQ) Implementation
 * Handles failed events with retry logic
 */

export interface DLQMessage {
  id: string;
  originalEvent: string;
  originalPayload: Record<string, unknown>;
  error: string;
  serviceName: string;
  retryCount: number;
  maxRetries: number;
  receivedAt: number;
  lastRetryAt?: number;
}

export interface DLQOptions {
  maxRetries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  backoffMultiplier?: number;
  deadLetterTtl?: number;
}

export type DLQHandler = (message: DLQMessage) => Promise<void>;

export class DeadLetterQueue {
  private messages = new Map<string, DLQMessage>();
  private handlers = new Set<DLQHandler>();
  private retryTimers = new Map<string, Timer>();
  private readonly options: Required<DLQOptions>;

  constructor(options: DLQOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 5000,
      maxRetryDelay: options.maxRetryDelay ?? 300000,
      backoffMultiplier: options.backoffMultiplier ?? 2,
      deadLetterTtl: options.deadLetterTtl ?? 86400000, // 24 hours
    };
  }

  /**
   * Add a message to the DLQ
   */
  async addMessage(
    originalEvent: string,
    originalPayload: Record<string, unknown>,
    error: string,
    serviceName: string
  ): Promise<void> {
    const id = `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const message: DLQMessage = {
      id,
      originalEvent,
      originalPayload,
      error,
      serviceName,
      retryCount: 0,
      maxRetries: this.options.maxRetries,
      receivedAt: Date.now(),
    };

    this.messages.set(id, message);

    console.log(`[DLQ] Message ${id} added for ${originalEvent}: ${error}`);

    // Schedule first retry
    this.scheduleRetry(id);
  }

  /**
   * Register a handler for retrying messages
   */
  onRetry(handler: DLQHandler): void {
    this.handlers.add(handler);
  }

  /**
   * Remove a retry handler
   */
  offRetry(handler: DLQHandler): void {
    this.handlers.delete(handler);
  }

  /**
   * Schedule a retry for a message
   */
  private scheduleRetry(messageId: string): void {
    const message = this.messages.get(messageId);
    if (!message) return;

    if (message.retryCount >= this.options.maxRetries) {
      console.log(`[DLQ] Message ${messageId} exceeded max retries, archiving`);
      this.archiveMessage(messageId);
      return;
    }

    const delay = Math.min(
      this.options.retryDelay * Math.pow(this.options.backoffMultiplier, message.retryCount),
      this.options.maxRetryDelay
    );

    console.log(`[DLQ] Scheduling retry ${message.retryCount + 1}/${this.options.maxRetries} for ${messageId} in ${delay}ms`);

    const timer = setTimeout(async () => {
      await this.executeRetry(messageId);
    }, delay);

    this.retryTimers.set(messageId, timer);
  }

  /**
   * Execute a retry for a message
   */
  private async executeRetry(messageId: string): Promise<void> {
    const message = this.messages.get(messageId);
    if (!message) return;

    message.retryCount++;
    message.lastRetryAt = Date.now();

    console.log(`[DLQ] Executing retry ${message.retryCount}/${message.maxRetries} for ${messageId}`);

    try {
      // Notify all handlers
      const promises = Array.from(this.handlers).map(handler => handler(message));
      await Promise.all(promises);

      // If successful, remove from DLQ
      console.log(`[DLQ] Message ${messageId} retry successful`);
      this.messages.delete(messageId);
      this.retryTimers.delete(messageId);
    } catch (error) {
      console.error(`[DLQ] Message ${messageId} retry failed:`, error);
      
      // Schedule next retry
      this.scheduleRetry(messageId);
    }
  }

  /**
   * Archive a message that exceeded max retries
   */
  private archiveMessage(messageId: string): void {
    const message = this.messages.get(messageId);
    if (!message) return;

    // In a real implementation, this would move to persistent storage
    console.log(`[DLQ] Archiving message ${messageId}:`, {
      event: message.originalEvent,
      retries: message.retryCount,
      error: message.error,
    });

    // Clean up
    this.messages.delete(messageId);
    this.retryTimers.delete(messageId);
  }

  /**
   * Get all messages in the DLQ
   */
  getMessages(): DLQMessage[] {
    return Array.from(this.messages.values());
  }

  /**
   * Get message by ID
   */
  getMessage(id: string): DLQMessage | undefined {
    return this.messages.get(id);
  }

  /**
   * Manually retry a message
   */
  async retryMessage(id: string): Promise<boolean> {
    const message = this.messages.get(id);
    if (!message) return false;

    // Clear existing timer
    const timer = this.retryTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(id);
    }

    await this.executeRetry(id);
    return true;
  }

  /**
   * Remove a message from the DLQ
   */
  removeMessage(id: string): boolean {
    const timer = this.retryTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(id);
    }
    return this.messages.delete(id);
  }

  /**
   * Get DLQ statistics
   */
  getStats(): {
    totalMessages: number;
    messagesByEvent: Record<string, number>;
    messagesByService: Record<string, number>;
  } {
    const messagesByEvent: Record<string, number> = {};
    const messagesByService: Record<string, number> = {};

    for (const message of this.messages.values()) {
      messagesByEvent[message.originalEvent] = (messagesByEvent[message.originalEvent] || 0) + 1;
      messagesByService[message.serviceName] = (messagesByService[message.serviceName] || 0) + 1;
    }

    return {
      totalMessages: this.messages.size,
      messagesByEvent,
      messagesByService,
    };
  }

  /**
   * Shutdown the DLQ
   */
  shutdown(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    this.messages.clear();
    this.handlers.clear();
  }
}
