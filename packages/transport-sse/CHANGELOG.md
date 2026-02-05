# @pubsubjs/transport-sse

## 0.4.0

### Patch Changes

- Updated dependencies [61f520c]
  - @pubsubjs/core@0.4.0

## 0.3.0

### Patch Changes

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

- Updated dependencies [7c2d65d]
  - @pubsubjs/core@0.3.0

## 0.2.1

### Patch Changes

- 5893d56: Fix npm publishing to use proper semver ranges instead of workspace:\* protocol
- Updated dependencies [5893d56]
  - @pubsubjs/core@0.2.1

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

### Patch Changes

- Updated dependencies [e32a69b]
  - @pubsubjs/core@0.2.0

## 0.1.2

### Patch Changes

- 10c33d0: Fix release workflow - remove prepublishOnly, mark examples as private
- Updated dependencies [10c33d0]
  - @pubsubjs/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [00be192]
  - @pubsubjs/core@0.1.1
