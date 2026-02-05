---
"@pubsubjs/core": minor
"@pubsubjs/transport-websocket": patch
"@pubsubjs/transport-sse": patch
---

Improve TypeScript types for transport events and WebSocket options

**Breaking change for TypeScript users**: Transport event handlers now receive typed event data objects instead of `unknown`.

### `onUpgrade` type fix
The `onUpgrade` callback in `WebSocketServerTransport` now correctly accepts `Record<string, unknown>` instead of requiring the full `WebSocketData` type. This matches the actual runtime behavior where `connectionId` and `subscriptions` are generated internally.

```typescript
// Before (required type assertion)
const transport = new WebSocketServerTransport({
  onUpgrade: (req) => ({ userId: "123" }) as WebSocketData,
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
