import type {
  Transport,
  TransportMessage,
  EventRegistry,
  EventNames,
  EventPayload,
  UnsubscribeFn,
} from "@pubsubjs/core";

/**
 * Handler function for subscription events
 */
export type SubscriptionHandler<T> = (payload: T) => void;

/**
 * Manages shared subscriptions with reference counting
 * Multiple handlers can subscribe to the same event, but only one
 * transport subscription is created per event
 */
export class SubscriptionManager<TEvents extends EventRegistry> {
  private readonly transport: Transport;
  private readonly handlers = new Map<
    string,
    Set<SubscriptionHandler<unknown>>
  >();
  private readonly transportSubscriptions = new Map<string, UnsubscribeFn>();
  private connectionPromise: Promise<void> | null = null;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /**
   * Subscribe a handler to an event
   * Returns unsubscribe function
   */
  subscribe<TEventName extends EventNames<TEvents>>(
    eventName: TEventName,
    handler: SubscriptionHandler<EventPayload<TEvents, TEventName>>
  ): UnsubscribeFn {
    let eventHandlers = this.handlers.get(eventName);

    if (!eventHandlers) {
      eventHandlers = new Set();
      this.handlers.set(eventName, eventHandlers);

      // First handler for this event - create transport subscription
      this.createTransportSubscription(eventName);
    }

    eventHandlers.add(handler as SubscriptionHandler<unknown>);

    // Return unsubscribe function
    return () => {
      eventHandlers!.delete(handler as SubscriptionHandler<unknown>);

      if (eventHandlers!.size === 0) {
        this.handlers.delete(eventName);
        this.removeTransportSubscription(eventName);
      }
    };
  }

  private async createTransportSubscription(eventName: string): Promise<void> {
    // Ensure connected
    if (!this.connectionPromise) {
      this.connectionPromise = this.transport.connect();
    }
    await this.connectionPromise;

    // Subscribe to transport
    const unsubscribe = await this.transport.subscribe(
      eventName,
      (message: TransportMessage) => {
        const handlers = this.handlers.get(eventName);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(message.payload);
            } catch (error) {
              console.error(`Error in subscription handler for ${eventName}:`, error);
            }
          }
        }
      }
    );

    this.transportSubscriptions.set(eventName, unsubscribe);
  }

  private async removeTransportSubscription(eventName: string): Promise<void> {
    const unsubscribe = this.transportSubscriptions.get(eventName);
    if (unsubscribe) {
      await unsubscribe();
      this.transportSubscriptions.delete(eventName);
    }

    // Disconnect if no more subscriptions
    if (this.transportSubscriptions.size === 0) {
      await this.transport.disconnect();
      this.connectionPromise = null;
    }
  }

  /**
   * Get handler count for an event (for testing)
   */
  getHandlerCount(eventName: string): number {
    return this.handlers.get(eventName)?.size ?? 0;
  }

  /**
   * Check if transport is subscribed to an event
   */
  hasTransportSubscription(eventName: string): boolean {
    return this.transportSubscriptions.has(eventName);
  }

  /**
   * Disconnect and clean up all subscriptions
   */
  async dispose(): Promise<void> {
    for (const unsubscribe of this.transportSubscriptions.values()) {
      await unsubscribe();
    }
    this.transportSubscriptions.clear();
    this.handlers.clear();

    if (this.transport.state === "connected") {
      await this.transport.disconnect();
    }
    this.connectionPromise = null;
  }
}
