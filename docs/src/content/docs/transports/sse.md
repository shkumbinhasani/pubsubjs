---
title: SSE Transport
description: Server-Sent Events for server-to-client streaming
---

The SSE (Server-Sent Events) transport enables efficient server-to-client streaming over HTTP.

## Installation

```bash
bun add @pubsubjs/transport-sse
```

## What is SSE?

Server-Sent Events is a standard for pushing updates from server to client over HTTP:

- **Unidirectional**: Server → Client only
- **Auto-reconnect**: Built-in reconnection handling
- **Simple**: Works over standard HTTP
- **Firewall-friendly**: Uses regular HTTP port

PubSubJS provides a client transport only. You can use it with any SSE server that emits events in one of these formats:

```json
{ "channel": "notification", "payload": { "message": "hi" } }
```

or as SSE event types, where the event name is the channel and the data is either the payload or `{ "payload": ..., "attributes": ... }`.

## Client Transport

### Browser Usage

```typescript
import { SSEClientTransport } from "@pubsubjs/transport-sse";
import { Subscriber } from "@pubsubjs/core";
import { events } from "./events";

const transport = new SSEClientTransport({
  url: "http://localhost:3000/events",
});

const subscriber = new Subscriber({ events, transport });

subscriber.on("notification", (payload) => {
  showNotification(payload.message);
});

await subscriber.subscribe();
```

### Client Options

```typescript
const transport = new SSEClientTransport({
  // SSE endpoint URL
  url: "https://api.example.com/events",

  // Include cookies with the request
  withCredentials: true,

  // Reconnection
  autoReconnect: true,

  // Custom headers via query params (SSE doesn't support custom headers)
  queryParams: {
    token,
  },
});
```

### React Integration

```typescript
import { useEffect, useState } from "react";
import { SSEClientTransport } from "@pubsubjs/transport-sse";
import { Subscriber } from "@pubsubjs/core";

function useSSENotifications() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const transport = new SSEClientTransport({
      url: "/api/events",
    });

    const subscriber = new Subscriber({ events, transport });

    subscriber.on("notification", (payload) => {
      setNotifications((prev) => [...prev, payload]);
    });

    subscriber.subscribe();

    return () => subscriber.unsubscribe();
  }, []);

  return notifications;
}
```

## Use Cases

### Live Notifications

```typescript
const transport = new SSEClientTransport({
  url: "https://api.example.com/events",
});

const subscriber = new Subscriber({ events, transport });

subscriber.on("notification", (payload) => {
  toast.show(payload.message);
});

await subscriber.subscribe();
```

### Real-time Dashboard

```typescript
const transport = new SSEClientTransport({
  url: "https://api.example.com/events",
});

const subscriber = new Subscriber({ events, transport });

subscriber.on("metrics.update", (payload) => {
  updateChart(payload.cpu, payload.memory);
  updateTable(payload.requests);
});

await subscriber.subscribe();
```

### Live Feed

```typescript
const transport = new SSEClientTransport({
  url: "https://api.example.com/events",
});

const subscriber = new Subscriber({ events, transport });

subscriber.on("feed.update", (payload) => {
  if (payload.type === "new_post") {
    prependToFeed(payload.post);
  }
});

await subscriber.subscribe();
```

## Authentication

### Token in URL

```typescript
// Client
const transport = new SSEClientTransport({
  url: `https://api.example.com/events?token=${token}`,
});
```

### Cookie-based

```typescript
// Client (cookies sent automatically)
const transport = new SSEClientTransport({
  url: "https://api.example.com/events",
  withCredentials: true,
});
```

## SSE vs WebSocket

| Feature | SSE | WebSocket |
|---------|-----|-----------|
| Direction | Server → Client | Bidirectional |
| Protocol | HTTP | WebSocket |
| Reconnection | Built-in | Manual |
| Binary data | No (text only) | Yes |
| Browser support | All modern | All modern |
| Proxy/firewall | Usually works | May be blocked |

**Use SSE when:**
- You only need server-to-client communication
- Firewalls block WebSocket
- You want simpler infrastructure

**Use WebSocket when:**
- You need bidirectional communication
- You're sending binary data
- You need lower latency

## Best Practices

### Connection Limits

Browsers limit SSE connections per domain (usually 6). Use a single connection with channel multiplexing:

```typescript
// Client subscribes to one endpoint, receives multiple event types
subscriber.on("notification", handleNotification);
subscriber.on("metrics", handleMetrics);
subscriber.on("feed", handleFeed);
```

### Graceful Degradation

```typescript
// Fall back to polling if SSE not supported
if (typeof EventSource === "undefined") {
  startPolling();
} else {
  startSSE();
}
```

## Next Steps

- [WebSocket Transport](/transports/websocket/) - Bidirectional communication
- [Redis Transport](/transports/redis/) - Distributed systems
- [React Integration](/react/setup/) - Use with React
