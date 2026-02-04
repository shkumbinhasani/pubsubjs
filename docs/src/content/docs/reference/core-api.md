---
title: Core API
description: API reference for @pubsubjs/core
---

## defineEvent

Creates a type-safe event registry from event definitions.

```typescript
function defineEvent<T extends EventDefinitionInput[]>(
  definitions: T
): EventRegistry<T>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `definitions` | `EventDefinitionInput[]` | Array of event definitions |

### Event Definition

```typescript
interface EventDefinitionInput {
  name: string;
  schema: StandardSchema;
  options?: EventOptions;
}

interface EventOptions {
  channel?: string;
  description?: string;
}
```

### Example

```typescript
import { defineEvent } from "@pubsubjs/core";
import { z } from "zod";

const events = defineEvent([
  {
    name: "user.created",
    schema: z.object({
      userId: z.string(),
      email: z.string().email(),
    }),
    options: {
      channel: "users",
      description: "Emitted when a new user is created",
    },
  },
]);
```

---

## Publisher

Class for publishing type-safe events.

```typescript
class Publisher<TEvents extends EventRegistry>
```

### Constructor

```typescript
new Publisher(options: PublisherOptions<TEvents>)
```

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `events` | `TEvents` | Yes | Event registry |
| `transport` | `Transport` | Yes | Transport to use |
| `middleware` | `PublishMiddleware[]` | No | Middleware chain |
| `channelStrategy` | `(name: string) => string` | No | Channel naming strategy |
| `skipValidation` | `boolean` | No | Skip payload validation |
| `autoReconnect` | `boolean` | No | Enable auto-reconnection |
| `reconnectInterval` | `number` | No | Reconnection interval (ms) |
| `maxReconnectAttempts` | `number` | No | Max reconnection attempts |

### Methods

#### publish

```typescript
async publish<TEventName extends EventNames<TEvents>>(
  eventName: TEventName,
  payload: EventPayload<TEvents, TEventName>,
  options?: PublishOptions
): Promise<void>
```

#### connect

```typescript
async connect(): Promise<void>
```

#### disconnect

```typescript
async disconnect(): Promise<void>
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `state` | `ConnectionState` | Current connection state |
| `isConnected` | `boolean` | Whether connected |

---

## Subscriber

Class for subscribing to events.

```typescript
class Subscriber<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
  TPublisher extends PublisherInterface | undefined = undefined
>
```

### Constructor

```typescript
new Subscriber(options: SubscriberOptions<TEvents, TContext, TPublisher>)
```

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `events` | `TEvents` | Yes | Event registry |
| `transport` | `Transport` | Yes | Transport to use |
| `middleware` | `SubscribeMiddleware[]` | No | Middleware chain |
| `contextFactory` | `ContextFactory<TContext>` | No | Custom context factory |
| `publisher` | `TPublisher` | No | Publisher for reply patterns |
| `onError` | `SubscriberErrorHandler` | No | Error handler |
| `channelStrategy` | `(name: string) => string` | No | Channel naming strategy |
| `skipValidation` | `boolean` | No | Skip payload validation |

### Methods

#### on

```typescript
on<TEventName extends EventNames<TEvents>>(
  eventName: TEventName,
  handler: EventHandler<EventPayload<TEvents, TEventName>, TContext, TPublisher>
): this
```

#### off

```typescript
off<TEventName extends EventNames<TEvents>>(eventName: TEventName): this
```

#### onMany

```typescript
onMany(handlers: HandlerMap<TEvents, TContext, TPublisher>): this
```

#### subscribe

```typescript
async subscribe(): Promise<void>
```

#### unsubscribe

```typescript
async unsubscribe(): Promise<void>
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `state` | `ConnectionState` | Current connection state |
| `isConnected` | `boolean` | Whether connected |

---

## Middleware Factories

### createLoggingMiddleware

Publisher middleware that logs events.

```typescript
function createLoggingMiddleware<TEvents>(): PublishMiddleware<TEvents>
```

### createSubscriberLoggingMiddleware

Subscriber middleware that logs events.

```typescript
function createSubscriberLoggingMiddleware<TEvents, TContext>(): SubscribeMiddleware<TEvents, TContext>
```

### createSubscriberTimingMiddleware

Reports handler duration.

```typescript
function createSubscriberTimingMiddleware<TEvents, TContext>(
  onTiming: (eventName: string, durationMs: number) => void
): SubscribeMiddleware<TEvents, TContext>
```

### createIdempotencyMiddleware

Prevents duplicate message processing.

```typescript
function createIdempotencyMiddleware<TEvents, TContext>(
  options: IdempotencyOptions
): SubscribeMiddleware<TEvents, TContext>

interface IdempotencyOptions {
  hasProcessed: (messageId: string) => boolean | Promise<boolean>;
  markProcessed: (messageId: string) => void | Promise<void>;
}
```

### createRateLimitMiddleware

Limits event processing rate.

```typescript
function createRateLimitMiddleware<TEvents, TContext>(
  options: RateLimitOptions
): SubscribeMiddleware<TEvents, TContext>

interface RateLimitOptions {
  maxEvents: number;
  windowMs: number;
  onLimit?: (eventName: string, payload: unknown) => void;
}
```

---

## Types

### EventNames

Extracts event names as union type.

```typescript
type EventNames<T extends EventRegistry> = keyof T & string
```

### EventPayload

Extracts payload type for an event.

```typescript
type EventPayload<T extends EventRegistry, K extends EventNames<T>> = InferOutput<T[K]["schema"]>
```

### ConnectionState

```typescript
type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting"
```

### PublishMiddleware

```typescript
type PublishMiddleware<TEvents extends EventRegistry> = (
  eventName: EventNames<TEvents>,
  payload: unknown,
  options: PublishOptions | undefined,
  next: () => Promise<void>
) => Promise<void>
```

### SubscribeMiddleware

```typescript
type SubscribeMiddleware<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext
> = (
  eventName: EventNames<TEvents>,
  payload: unknown,
  context: TContext,
  next: () => Promise<void>
) => Promise<void>
```

### BaseContext

```typescript
interface BaseContext {
  messageId: string;
  timestamp: Date;
}
```

---

## Errors

### ValidationError

Thrown when payload validation fails.

```typescript
class ValidationError extends Error {
  issues: StandardSchemaIssue[];
}
```

### UnknownEventError

Thrown when event is not defined.

```typescript
class UnknownEventError extends Error {
  eventName: string;
}
```

### ConnectionError

Thrown when connection fails.

```typescript
class ConnectionError extends Error {}
```
