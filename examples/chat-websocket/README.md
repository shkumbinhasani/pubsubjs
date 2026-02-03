# Real-time Chat Application with WebSocket

A production-ready real-time chat application demonstrating the PubSub library's WebSocket transport capabilities.

## Features

### Core Features
- **Room Management**: Create, join, leave, and list chat rooms
- **User Authentication**: Simple username-based authentication
- **Message Persistence**: In-memory message storage with history
- **Typing Indicators**: Real-time typing status with debouncing
- **User Presence**: Online/away/dnd/offline status tracking
- **Rate Limiting**: Prevent spam with configurable limits
- **Auto-reconnection**: Automatic reconnection on connection loss
- **Error Handling**: Comprehensive error messages and recovery

### Technical Features
- **WebSocket Transport**: Full-duplex communication
- **Type Safety**: Full TypeScript support with Zod schemas
- **Event-Driven Architecture**: Clean separation of concerns
- **Scalable Design**: Easy to extend with additional features

## Project Structure

```
examples/chat-websocket/
├── events.ts              # Shared event definitions
├── server.ts              # WebSocket server implementation
├── client.ts              # CLI chat client
├── events.test.ts         # Event definition tests
├── integration.test.ts    # Integration tests
└── README.md              # This file
```

## Quick Start

### 1. Install Dependencies

From the project root:

```bash
bun install
```

### 2. Start the Server

```bash
bun examples/chat-websocket/server.ts
```

The server will start on port 3000 and display:

```
╔═══════════════════════════════════════════════════╗
║         Chat Server Running on Port 3000          ║
╠═══════════════════════════════════════════════════╣
║  WebSocket URL: ws://localhost:3000/ws             ║
║                                                   ║
║  Features:                                        ║
║  • Room management (create, join, leave, list)    ║
║  • User authentication                            ║
║  • Message persistence                            ║
║  • Typing indicators                              ║
║  • User presence (online/away/dnd/offline)        ║
║  • Message history                                ║
║  • Rate limiting                                  ║
╚═══════════════════════════════════════════════════╝
```

### 3. Connect Clients

Open one or more terminal windows and run:

```bash
# Default username and room
bun examples/chat-websocket/client.ts

# Custom username
bun examples/chat-websocket/client.ts Alice

# Custom username and room
bun examples/chat-websocket/client.ts Alice general
bun examples/chat-websocket/client.ts Bob general
```

## Client Commands

Once connected, you can use the following commands:

### General Commands
- `/help` - Show all available commands
- `/quit` or `/exit` - Leave the chat and exit
- `/clear` - Clear the screen

### Room Commands
- `/rooms` - List all available rooms
- `/create <name> [description]` - Create a new room
  - Example: `/create dev-chat "Discussion about development"`
- `/join <room>` - Join a different room
  - Example: `/join dev-chat`
- `/leave` - Leave the current room
- `/users` - Show users in the current room

### Message Commands
- `/history [limit]` - Load message history (default: 50)
  - Example: `/history 100`

### Presence Commands
- `/online` - Set status to online
- `/away` - Set status to away
- `/dnd` - Set status to do not disturb

### Sending Messages

Simply type your message and press Enter:

```
Hello everyone!
```

## Event Definitions

### Client → Server Events

| Event | Description | Payload |
|-------|-------------|---------|
| `auth.login` | Authenticate user | `{ username: string, password?: string }` |
| `auth.logout` | Logout user | `{}` |
| `room.create` | Create a new room | `{ roomId: string, description?: string }` |
| `room.list` | List all rooms | `{}` |
| `room.join` | Join a room | `{ roomId: string, username: string }` |
| `room.leave` | Leave a room | `{ roomId: string }` |
| `message.send` | Send a message | `{ text: string, roomId: string }` |
| `message.history` | Request message history | `{ roomId: string, limit?: number, before?: number }` |
| `typing.start` | Start typing | `{ roomId: string }` |
| `typing.stop` | Stop typing | `{ roomId: string }` |
| `presence.update` | Update presence | `{ status: "online" \| "away" \| "dnd" }` |

### Server → Client Events

| Event | Description | Payload |
|-------|-------------|---------|
| `auth.success` | Authentication successful | `{ username: string, userId: string }` |
| `auth.error` | Authentication failed | `{ code: string, message: string }` |
| `room.created` | Room created | `{ roomId: string, description?: string, createdBy: string }` |
| `room.list` | Room list | `{ rooms: RoomInfo[] }` |
| `room.joined` | Joined room | `{ roomId: string, users: string[], recentMessages: Message[] }` |
| `room.userJoined` | User joined room | `{ roomId: string, username: string }` |
| `room.userLeft` | User left room | `{ roomId: string, username: string }` |
| `message.received` | Message received | `{ id: string, text: string, roomId: string, username: string, timestamp: number }` |
| `message.history` | Message history | `{ roomId: string, messages: Message[], hasMore: boolean }` |
| `typing.update` | Typing update | `{ roomId: string, usersTyping: string[] }` |
| `presence.update` | Presence update | `{ username: string, status: string, lastSeen?: number }` |
| `rateLimit.warning` | Rate limit warning | `{ remaining: number, resetTime: number, message: string }` |
| `error` | Error occurred | `{ code: string, message: string }` |

## Configuration

### Server Configuration

Edit `server.ts` to customize:

```typescript
const CONFIG = {
  PORT: 3000,                          // Server port
  MAX_MESSAGES_PER_ROOM: 1000,         // Max messages to store per room
  RECENT_MESSAGES_COUNT: 50,           // Messages to send on join
  RATE_LIMIT: {
    MAX_REQUESTS: 30,                  // Max requests per window
    WINDOW_MS: 60000,                  // Rate limit window (1 minute)
  },
  TYPING_TIMEOUT_MS: 3000,             // Typing indicator timeout
  PRESENCE_TIMEOUT_MS: 300000,         // Away status timeout (5 minutes)
  HEARTBEAT_INTERVAL_MS: 30000,        // Cleanup interval
};
```

### Client Configuration

Edit `client.ts` to customize:

```typescript
const CONFIG = {
  SERVER_URL: "ws://localhost:3000/ws",  // Server WebSocket URL
  TYPING_DEBOUNCE_MS: 2000,              // Typing debounce time
  RECONNECT_DELAY_MS: 3000,              // Reconnection delay
  MAX_RECONNECT_ATTEMPTS: 5,             // Max reconnection attempts
};
```

## Running Tests

```bash
# Run all tests in this example
bun test examples/chat-websocket

# Run with watch mode
bun test --watch examples/chat-websocket
```

## Architecture

### Server Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Server                              │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Transport  │  │   Publisher  │  │  Subscriber  │      │
│  │  (WebSocket) │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
├─────────────────────────────────────────────────────────────┤
│  State Management:                                          │
│  • rooms: Map<string, Room>                                 │
│  • users: Map<string, User>                                 │
│  • rateLimits: Map<string, RateLimitEntry>                  │
│  • typingTimeouts: Map<string, Timeout>                     │
├─────────────────────────────────────────────────────────────┤
│  Features:                                                  │
│  • Room Management (create, join, leave, list)              │
│  • User Authentication                                      │
│  • Message Persistence                                      │
│  • Typing Indicators with auto-timeout                      │
│  • User Presence (online/away/dnd/offline)                  │
│  • Rate Limiting (30 req/min per connection)                │
│  • Heartbeat & Cleanup                                      │
└─────────────────────────────────────────────────────────────┘
```

### Client Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                              │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   Transport  │  │    PubSub    │                        │
│  │  (WebSocket) │  │              │                        │
│  └──────────────┘  └──────────────┘                        │
├─────────────────────────────────────────────────────────────┤
│  State:                                                     │
│  • isConnected, isAuthenticated                             │
│  • currentRoom, usersInRoom                                 │
│  • typingUsers, isTyping                                    │
│  • messageHistory                                           │
├─────────────────────────────────────────────────────────────┤
│  Features:                                                  │
│  • Interactive CLI with readline                            │
│  • Command parser (/help, /join, etc.)                      │
│  • Typing detection with debouncing                         │
│  • Auto-reconnection with exponential backoff               │
│  • Graceful shutdown handling                               │
└─────────────────────────────────────────────────────────────┘
```

## Extending the Application

### Adding a New Feature

1. **Define the event** in `events.ts`:

```typescript
// Client → Server
{
  name: "feature.action",
  schema: z.object({
    data: z.string(),
  }),
}

// Server → Client
{
  name: "feature.update",
  schema: z.object({
    result: z.string(),
  }),
}
```

2. **Add server handler** in `server.ts`:

```typescript
subscriber.on("feature.action", async (payload, { ctx, publisher }) => {
  // Handle the action
  await publisher.publish("feature.update", { result: "success" }, {
    targetIds: [ctx.connectionId],
  });
});
```

3. **Add client handler** in `client.ts`:

```typescript
chat.on("feature.update", (payload) => {
  console.log("Feature result:", payload.result);
});
```

4. **Add a command** in `client.ts`:

```typescript
commands.feature = async (args) => {
  await chat.publish("feature.action", { data: args[0] });
};
```

## Production Considerations

### Security
- Implement proper authentication (JWT, OAuth)
- Add message encryption for sensitive data
- Validate all inputs server-side
- Implement room access controls

### Scalability
- Use Redis for message persistence across server instances
- Implement horizontal scaling with load balancing
- Add database persistence for message history
- Use message queuing for high-throughput scenarios

### Monitoring
- Add logging middleware
- Implement metrics collection
- Set up health checks
- Monitor connection counts and message rates

## Troubleshooting

### Connection Issues
- Ensure the server is running on the correct port
- Check firewall settings for WebSocket connections
- Verify the WebSocket URL is correct

### Rate Limiting
- If you see rate limit warnings, slow down your message rate
- Default limit: 30 requests per minute per connection

### Message Not Sending
- Ensure you've joined a room first
- Check that you're authenticated
- Verify the room still exists

## License

MIT
