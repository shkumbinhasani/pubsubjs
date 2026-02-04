# @pubsubjs/transport-websocket

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

- 5b6a4d6: Add composable mode for integrating WebSocket transport with external Bun.serve()

  **Standalone mode** (existing behavior) - creates its own server:

  ```ts
  const transport = new WebSocketServerTransport({ port: 3000 });
  await transport.connect();
  ```

  **Composable mode** (new) - integrates with external server:

  ```ts
  const transport = new WebSocketServerTransport(); // no port
  await transport.connect();

  Bun.serve({
    fetch(req, server) {
      if (req.headers.get("upgrade") === "websocket") {
        return transport.handleUpgrade(req, server);
      }
      return new Response("Hello");
    },
    websocket: transport.websocketHandler,
  });
  ```

  New APIs:

  - `websocketHandler` - WebSocket handler for use with external `Bun.serve()`
  - `handleUpgrade(req, server)` - Handle WebSocket upgrade requests

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
