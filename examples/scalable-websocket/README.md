# Scalable WebSocket Chat Example

A real-time chat application demonstrating horizontal scaling using **@pubsubjs/core** with WebSocket and Redis transports.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Architecture                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐                           ┌──────────┐           │
│   │  Client  │◄─────WebSocket──────────►│  Server  │           │
│   │ (React)  │                           │  (Bun)   │           │
│   └──────────┘                           └────┬─────┘           │
│                                               │                  │
│                                          Redis Pub/Sub           │
│                                               │                  │
│   ┌──────────┐                           ┌────┴─────┐           │
│   │  Client  │◄─────WebSocket──────────►│  Server  │           │
│   │ (React)  │                           │  (Bun)   │           │
│   └──────────┘                           └──────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Two PubSub Layers

1. **Client ↔ Server (WebSocket)**
   - Real-time bidirectional communication
   - Message sending, notifications, connection status

2. **Server ↔ Server (Redis)**
   - Cross-instance message broadcasting
   - User join/leave events propagation
   - Enables horizontal scaling

## Project Structure

```
src/
├── shared/                    # Shared types and events
│   └── events/
│       ├── client-to-server.ts   # Events from client to server
│       ├── server-to-client.ts   # Events from server to client
│       └── redis.ts              # Inter-server events via Redis
│
├── server/                    # Bun server
│   ├── lib/
│   │   ├── config.ts            # Server configuration
│   │   └── users.ts             # Connected users store
│   ├── transports/
│   │   ├── websocket.ts         # WebSocket pub/sub setup
│   │   └── redis.ts             # Redis pub/sub setup
│   ├── handlers/
│   │   ├── client-events.ts     # Handle client messages
│   │   ├── redis-events.ts      # Handle inter-server messages
│   │   └── connection.ts        # WebSocket connection handling
│   ├── routes.ts                # HTTP routes
│   └── index.ts                 # Server entry point
│
└── client/                    # React frontend
    ├── lib/
    │   ├── pubsub.ts            # WebSocket pub/sub setup
    │   └── types.ts             # TypeScript types
    ├── hooks/
    │   ├── index.ts             # Hook exports
    │   ├── useConnection.ts     # Connection status hook
    │   ├── useMessages.ts       # Chat messages hook
    │   ├── useNotifications.ts  # Toast notifications hook
    │   └── useUserEvents.ts     # User join/leave events hook
    ├── components/
    │   ├── index.ts             # Component exports
    │   ├── ConnectionStatus.tsx # Connection indicator
    │   ├── Notifications.tsx    # Toast notifications
    │   ├── UsernameForm.tsx     # Username input form
    │   ├── MessageList.tsx      # Chat message list
    │   ├── MessageInput.tsx     # Message input field
    │   ├── UserEventLog.tsx     # User activity log
    │   └── Sidebar.tsx          # Sidebar layout
    ├── styles/
    │   └── index.css            # Application styles
    ├── App.tsx                  # Main React component
    ├── index.tsx                # React entry point
    └── index.html               # HTML template

```

## Prerequisites

- [Bun](https://bun.sh) runtime
- [Redis](https://redis.io) server running locally (or configure `REDIS_URL`)

## Setup

```bash
# Install dependencies
bun install

# Start Redis (if not running)
redis-server

# Start the server
bun run src/server/index.ts
```

## Running Multiple Instances

To test horizontal scaling, run multiple server instances on different ports:

```bash
# Terminal 1
PORT=3000 bun run src/server/index.ts

# Terminal 2
PORT=3001 bun run src/server/index.ts

# Terminal 3
PORT=3002 bun run src/server/index.ts
```

Open multiple browser tabs connecting to different ports. Messages will be synchronized across all instances via Redis.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP/WebSocket server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |

## Features Demonstrated

### Client-Side
- WebSocket connection with auto-reconnect
- Real-time message updates
- Toast notifications for user events
- Connection status indicator
- Server instance identification

### Server-Side
- Multiple transport types (WebSocket + Redis)
- Message validation with Zod schemas
- Broadcast to all connected clients
- Cross-instance communication via Redis pub/sub
- Subscriber middleware for logging

## Event Flow

### Sending a Message

1. Client publishes `client.message` via WebSocket
2. Server receives and validates the message
3. Server publishes to Redis `chat:message` channel
4. All server instances receive the Redis message
5. Each server broadcasts to their connected clients
6. Clients receive `server.message` and update UI

### User Joins

1. Client publishes `client.setUsername` via WebSocket
2. Server stores user info and publishes to Redis `user:joined`
3. All servers receive and broadcast `server.userJoined`
4. All clients see the new user notification

## Code Highlights

### Type-Safe Events

```typescript
// Define events with Zod schemas
export const ClientToServerEvents = defineEvents({
  "client.message": {
    schema: z.object({ message: z.string().min(1).max(1000) }),
  },
  "client.setUsername": {
    schema: z.object({ username: z.string().min(1).max(50) }),
  },
});
```

### Subscriber Middleware

```typescript
const subscriber = new Subscriber({
  events: RedisEvents,
  transport: redisSubscriberTransport,
  middleware: [createSubscriberLoggingMiddleware()],
});
```

### WebSocket Publisher

```typescript
// Send to specific client
wsPublisher.publish("server.message", payload, {
  transport: { ws: clientConnection },
});

// Broadcast to all clients
wsPublisher.publish("server.notification", payload, {
  transport: { broadcast: true },
});
```

## License

MIT
