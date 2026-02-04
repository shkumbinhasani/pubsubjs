// Types
export type {
  StandardSchema,
  StandardSchemaResult,
  StandardSchemaIssue,
  InferOutput,
  EventDefinition,
  EventOptions,
  EventRegistry,
  EventNames,
  EventPayload,
  EventAttributesType,
  HasAttributesSchema,
} from "./types/schema";

export type {
  BaseContext,
  AuthContext,
  ConnectionContext,
  ContextFactory,
  TransportMetadata,
} from "./types/context";

export type {
  PublisherInterface,
  PublishOptions,
  HandlerContext,
  EventHandler,
  HandlerMap,
  UnsubscribeFn,
  SubscribeMiddleware,
} from "./types/handler";

export type {
  AttributeValue,
  EventAttributes,
  FilterCondition,
  FilterPolicy,
  TypedFilterPolicy,
  StringFilterCondition,
  NumberFilterCondition,
  BooleanFilterCondition,
  FilterConditionFor,
} from "./types/filter";

export type {
  Transport,
  TransportCapabilities,
  TransportMessage,
  TransportMessageHandler,
  TransportPublishOptions,
  TransportSubscribeOptions,
  TransportEvent,
  TransportEventHandler,
  ConnectionState,
} from "./transport/interface";

// Functions
export { defineEvent, validatePayload, ValidationError } from "./types/schema";
export { defaultContextFactory, generateMessageId } from "./types/context";

// Transport
export { BaseTransport, generateTransportId } from "./transport/base";
export { TransportCapabilityError } from "./transport/interface";

// Connection Manager
export {
  ConnectionManager,
  type ConnectionManagerOptions,
} from "./connection/manager";

// Publisher
export {
  Publisher,
  type PublisherOptions,
  type PublishMiddleware,
  createLoggingMiddleware,
} from "./publisher";

// Subscriber
export {
  Subscriber,
  type SubscriberOptions,
  type SubscriberErrorHandler,
  type SubscribeOptions,
  type IdempotencyOptions,
  type RateLimitOptions,
  createSubscriberLoggingMiddleware,
  createSubscriberTimingMiddleware,
  createIdempotencyMiddleware,
  createRateLimitMiddleware,
} from "./subscriber";

// Filter
export { matchesFilter, toSNSFilterPolicy } from "./filter/matcher";

// PubSub
export { PubSub, type PubSubOptions } from "./pubsub";

// Errors
export {
  InvalidStateError,
  UnknownEventError,
  ConnectionError,
} from "./errors";

// Schema utilities
export {
  tryExtractJsonSchema,
  generateEventCatalog,
  generateAsyncAPIDocument,
  type JSONSchema,
  type EventCatalogEntry,
  type AsyncAPIDocument,
} from "./schema/json-schema";
