import type {
  Transport,
  TransportCapabilities,
  TransportEvent,
  TransportEventHandler,
  TransportMessageHandler,
  TransportPublishOptions,
  ConnectionState,
} from "./interface";
import type { UnsubscribeFn } from "../types/handler";
import { TransportCapabilityError } from "./interface";

/**
 * Abstract base class for transport implementations
 * Provides common functionality like event handling and state management
 */
export abstract class BaseTransport implements Transport {
  abstract readonly id: string;
  abstract readonly capabilities: TransportCapabilities;

  protected _state: ConnectionState = "disconnected";
  private readonly eventHandlers = new Map<
    TransportEvent,
    Set<TransportEventHandler>
  >();

  get state(): ConnectionState {
    return this._state;
  }

  protected setState(state: ConnectionState): void {
    this._state = state;

    if (state === "connected") {
      this.emit("connect");
    } else if (state === "disconnected") {
      this.emit("disconnect");
    } else if (state === "reconnecting") {
      this.emit("reconnecting");
    } else if (state === "error") {
      this.emit("error");
    }
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  async subscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn> {
    if (!this.capabilities.canSubscribe) {
      throw new TransportCapabilityError(this.id, "subscribe");
    }
    return this.doSubscribe(channel, handler);
  }

  async publish(
    channel: string,
    payload: unknown,
    options?: TransportPublishOptions
  ): Promise<void> {
    if (!this.capabilities.canPublish) {
      throw new TransportCapabilityError(this.id, "publish");
    }
    if (options?.targetIds && !this.capabilities.supportsTargeting) {
      throw new TransportCapabilityError(this.id, "targeting specific clients");
    }
    return this.doPublish(channel, payload, options);
  }

  protected abstract doSubscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn>;

  protected abstract doPublish(
    channel: string,
    payload: unknown,
    options?: TransportPublishOptions
  ): Promise<void>;

  on(event: TransportEvent, handler: TransportEventHandler): void {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler);
  }

  off(event: TransportEvent, handler: TransportEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  protected emit(event: TransportEvent, data?: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in transport event handler for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Ensure the transport is connected, connecting if necessary
   */
  protected async ensureConnected(): Promise<void> {
    if (this._state === "connected") {
      return;
    }
    if (this._state === "connecting") {
      return new Promise((resolve, reject) => {
        const onConnect = () => {
          this.off("connect", onConnect);
          this.off("error", onError);
          resolve();
        };
        const onError = (error?: unknown) => {
          this.off("connect", onConnect);
          this.off("error", onError);
          reject(error instanceof Error ? error : new Error("Connection failed"));
        };
        this.on("connect", onConnect);
        this.on("error", onError);
      });
    }
    await this.connect();
  }
}

/**
 * Generate a unique transport ID
 */
export function generateTransportId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
