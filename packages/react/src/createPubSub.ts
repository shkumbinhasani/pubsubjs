import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type DependencyList,
} from "react";
import type {
  Transport,
  EventRegistry,
  EventNames,
  EventPayload,
} from "@pubsubjs/core";
import { validatePayload } from "@pubsubjs/core";
import {
  SubscriptionManager,
  type SubscriptionHandler,
} from "./subscriptionManager";

/**
 * Options for creating a PubSub instance
 */
export interface CreatePubSubOptions<TEvents extends EventRegistry> {
  /** Event definitions */
  readonly events: TEvents;
  /** Transport to use */
  readonly transport: Transport;
  /** Skip validation (for performance) */
  readonly skipValidation?: boolean;
}

/**
 * Options for useSubscribe hook
 */
export interface UseSubscribeOptions {
  /** Enable/disable the subscription */
  readonly enabled?: boolean;
}

/**
 * Return type for usePublish hook
 */
export interface UsePublishReturn<TEvents extends EventRegistry> {
  publish: <TEventName extends EventNames<TEvents>>(
    eventName: TEventName,
    payload: EventPayload<TEvents, TEventName>
  ) => void;
}

/**
 * PubSub instance with hooks
 */
export interface PubSubInstance<TEvents extends EventRegistry> {
  /**
   * Hook to subscribe to an event
   * @param eventName - The event to subscribe to
   * @param handler - Handler called when event is received
   * @param deps - Dependency array (like useEffect)
   * @param options - Optional configuration
   */
  useSubscribe: <TEventName extends EventNames<TEvents>>(
    eventName: TEventName,
    handler: SubscriptionHandler<EventPayload<TEvents, TEventName>>,
    deps: DependencyList,
    options?: UseSubscribeOptions
  ) => void;

  /**
   * Hook to get a publish function
   */
  usePublish: () => UsePublishReturn<TEvents>;

  /**
   * Get the publisher for use outside React
   */
  getPublisher: () => UsePublishReturn<TEvents>;

  /**
   * Get the subscription manager (for testing)
   */
  getSubscriptionManager: () => SubscriptionManager<TEvents>;

  /**
   * Dispose the instance and clean up resources
   */
  dispose: () => Promise<void>;
}

/**
 * Create a PubSub instance with React hooks (Zustand-style, no Provider needed)
 */
export function createPubSub<TEvents extends EventRegistry>(
  options: CreatePubSubOptions<TEvents>
): PubSubInstance<TEvents> {
  const { events, transport, skipValidation = false } = options;

  const subscriptionManager = new SubscriptionManager<TEvents>(transport);
  let isDisposed = false;

  /**
   * Hook to subscribe to an event with useEffectEvent-style handler stability
   */
  function useSubscribe<TEventName extends EventNames<TEvents>>(
    eventName: TEventName,
    handler: SubscriptionHandler<EventPayload<TEvents, TEventName>>,
    deps: DependencyList,
    subscribeOptions?: UseSubscribeOptions
  ): void {
    const enabled = subscribeOptions?.enabled ?? true;

    // Store handler in ref, update on every render (useEffectEvent pattern)
    const handlerRef = useRef(handler);
    useLayoutEffect(() => {
      handlerRef.current = handler;
    });

    // Stable wrapper that calls latest handler
    const stableHandler = useCallback(
      (payload: EventPayload<TEvents, TEventName>) => {
        handlerRef.current(payload);
      },
      []
    );

    // Subscribe effect - depends on eventName and enabled
    useEffect(() => {
      if (!enabled || isDisposed) {
        return;
      }

      const unsubscribe = subscriptionManager.subscribe(
        eventName,
        stableHandler
      );

      return () => {
        unsubscribe();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventName, enabled, ...deps]);
  }

  /**
   * Hook to get a publish function
   */
  function usePublish(): UsePublishReturn<TEvents> {
    const publish = useCallback(
      async <TEventName extends EventNames<TEvents>>(
        eventName: TEventName,
        payload: EventPayload<TEvents, TEventName>
      ) => {
        if (isDisposed) {
          console.warn("PubSub instance is disposed, cannot publish");
          return;
        }

        const eventDef = events[eventName];
        if (!eventDef) {
          console.error(`Unknown event: ${eventName}`);
          return;
        }

        // Validate payload
        let validatedPayload: unknown = payload;
        if (!skipValidation) {
          try {
            validatedPayload = await validatePayload(eventDef.schema, payload);
          } catch (error) {
            console.error(`Validation failed for ${eventName}:`, error);
            return;
          }
        }

        // Ensure connected and publish
        if (transport.state !== "connected") {
          await transport.connect();
        }

        const channel = eventDef.options?.channel ?? eventName;
        await transport.publish(channel, validatedPayload, {
          metadata: { eventName },
        });
      },
      []
    );

    return { publish };
  }

  /**
   * Get the publisher for use outside React
   */
  function getPublisher(): UsePublishReturn<TEvents> {
    return {
      publish: async <TEventName extends EventNames<TEvents>>(
        eventName: TEventName,
        payload: EventPayload<TEvents, TEventName>
      ) => {
        if (isDisposed) {
          console.warn("PubSub instance is disposed, cannot publish");
          return;
        }

        const eventDef = events[eventName];
        if (!eventDef) {
          console.error(`Unknown event: ${eventName}`);
          return;
        }

        // Validate payload
        let validatedPayload: unknown = payload;
        if (!skipValidation) {
          validatedPayload = await validatePayload(eventDef.schema, payload);
        }

        // Ensure connected and publish
        if (transport.state !== "connected") {
          await transport.connect();
        }

        const channel = eventDef.options?.channel ?? eventName;
        await transport.publish(channel, validatedPayload, {
          metadata: { eventName },
        });
      },
    };
  }

  /**
   * Get the subscription manager (for testing)
   */
  function getSubscriptionManager(): SubscriptionManager<TEvents> {
    return subscriptionManager;
  }

  /**
   * Dispose the instance
   */
  async function dispose(): Promise<void> {
    isDisposed = true;
    await subscriptionManager.dispose();
  }

  return {
    useSubscribe,
    usePublish,
    getPublisher,
    getSubscriptionManager,
    dispose,
  };
}
