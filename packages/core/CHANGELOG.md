# @pubsubjs/core

## 0.4.0

### Minor Changes

- 61f520c: Add dynamic handler registration with per-handler unsubscribe

  - `on()` now returns an `UnsubscribeFn` to remove a specific handler (breaking: was `this`)
  - `off()` now returns `void` and tears down the transport subscription (breaking: was `this`)
  - `onMany()` now returns an `UnsubscribeFn` to remove all registered handlers (breaking: was `this`)
  - Multiple handlers can be registered for the same event — each receives messages independently
  - Per-handler error isolation: one handler throwing does not affect other handlers on the same event
  - Per-handler filter support: each handler can have its own filter policy via `on()` options
  - Late-binding: handlers registered after `subscribe()` auto-subscribe to the transport
  - Reference counting: transport subscription is removed when the last handler for an event is unsubscribed

## 0.3.0

### Minor Changes

- 7c2d65d: Improve TypeScript types for transport events and WebSocket options

  **Breaking change for TypeScript users**: Transport event handlers now receive typed event data objects instead of `unknown`.

  ### `onUpgrade` type fix

  The `onUpgrade` callback in `WebSocketServerTransport` now correctly accepts `Record<string, unknown>` instead of requiring the full `WebSocketData` type. This matches the actual runtime behavior where `connectionId` and `subscriptions` are generated internally.

  ```typescript
  // Before (required type assertion)
  const transport = new WebSocketServerTransport({
    onUpgrade: (req) => ({ userId: "123" } as WebSocketData),
  });

  // After (no assertion needed)
  const transport = new WebSocketServerTransport({
    onUpgrade: (req) => ({ userId: "123" }),
  });
  ```

  ### Typed transport events

  Transport events now have properly typed handlers via `TransportEventMap`:

  ```typescript
  // Event data is now typed
  transport.on("connect", ({ connectionId }) => {
    console.log(connectionId); // string | undefined
  });

  transport.on("error", ({ error }) => {
    console.error(error); // Error | undefined
  });
  ```

## 0.2.1

### Patch Changes

- 5893d56: Fix npm publishing to use proper semver ranges instead of workspace:\* protocol

## 0.2.0

### Minor Changes

- e32a69b: Add attribute-based event filtering at the transport level

  - Add `FilterPolicy` type with operators: `$in`, `$exists`, `$prefix`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$between`
  - Add `EventAttributes` type for attaching filterable attributes to events
  - Add `matchesFilter()` function for evaluating filter policies
  - Add `toSNSFilterPolicy()` for AWS SNS compatibility
  - Update `PublishOptions` to accept `attributes`
  - Update `Subscriber.on()` to accept filter option
  - Implement client-side filtering in WebSocket, Redis, and SSE transports
  - Support nested attributes via dot notation (e.g., `"user.role"`)

  Filter semantics:

  - Multiple conditions on same key = OR (at least one must match)
  - Multiple keys = AND (all must match)

## 0.1.2

### Patch Changes

- 10c33d0: Fix release workflow - remove prepublishOnly, mark examples as private

## 0.1.1

### Patch Changes

- 00be192: Improve README with documentation and quick start guide
