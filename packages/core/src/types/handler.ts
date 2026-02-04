import type { BaseContext } from "./context";
import type { EventRegistry, EventNames, EventPayload, EventAttributesType } from "./schema";
import type { EventAttributes } from "./filter";

/**
 * Publisher interface that handlers can use to publish events
 */
export interface PublisherInterface<TEvents extends EventRegistry> {
  publish<TEventName extends EventNames<TEvents>>(
    eventName: TEventName,
    payload: EventPayload<TEvents, TEventName>,
    options?: PublishOptions<EventAttributesType<TEvents, TEventName>>
  ): Promise<void>;
}

/**
 * Options for publishing events
 * @template TAttributes - Type of attributes (inferred from event's attributesSchema)
 */
export interface PublishOptions<TAttributes = EventAttributes> {
  /** Target specific connection IDs (if transport supports) */
  readonly targetIds?: readonly string[];
  /** Custom channel override */
  readonly channel?: string;
  /** Additional metadata to include */
  readonly metadata?: Record<string, unknown>;
  /** Event attributes for filtering (type-safe when event has attributesSchema) */
  readonly attributes?: TAttributes extends undefined ? EventAttributes : TAttributes;
}

/**
 * Context passed to event handlers
 */
export interface HandlerContext<
  TContext extends BaseContext,
  TPublisher extends PublisherInterface<EventRegistry> | undefined = undefined,
> {
  /** The context with request-specific data */
  readonly ctx: TContext;
  /** Publisher for reply patterns (only available when configured) */
  readonly publisher: TPublisher;
}

/**
 * Event handler function signature
 */
export type EventHandler<
  TPayload,
  TContext extends BaseContext = BaseContext,
  TPublisher extends PublisherInterface<EventRegistry> | undefined = undefined,
> = (
  payload: TPayload,
  context: HandlerContext<TContext, TPublisher>
) => void | Promise<void>;

/**
 * Handler map for subscribing to multiple events
 */
export type HandlerMap<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
  TPublisher extends PublisherInterface<EventRegistry> | undefined = undefined,
> = {
  [K in EventNames<TEvents>]?: EventHandler<
    EventPayload<TEvents, K>,
    TContext,
    TPublisher
  >;
};

/**
 * Unsubscribe function returned when subscribing
 */
export type UnsubscribeFn = () => void | Promise<void>;

/**
 * Middleware function for subscribe operations
 */
export type SubscribeMiddleware<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
> = (
  eventName: EventNames<TEvents>,
  payload: unknown,
  context: TContext,
  next: () => Promise<void>
) => Promise<void>;
