---
"@pubsubjs/transport-websocket": minor
---

Add composable mode for integrating WebSocket transport with external Bun.serve()

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
