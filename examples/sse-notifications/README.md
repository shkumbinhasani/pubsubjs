# Production-Ready Notification System

A comprehensive notification service built with Server-Sent Events (SSE), featuring multi-channel delivery, user preferences, rate limiting, and more.

## Features

### Core Features
- **Multi-Channel Delivery**: Send notifications via in-app, email, push, and SMS
- **User Management**: Create users with customizable preferences
- **Topic Subscriptions**: Subscribe/unsubscribe users to notification topics
- **Notification Persistence**: Store and retrieve notification history
- **Read/Unread Status**: Track notification read status

### Advanced Features
- **Rate Limiting**: Token bucket algorithm prevents notification spam
- **Retry Logic**: Exponential backoff for failed deliveries
- **Notification Templates**: Reusable templates with variable substitution
- **Batch Processing**: Group and process notifications efficiently
- **Priority Levels**: low, medium, high, urgent

### Subscriber Middleware (New!)
The CLI client (`client.ts`) demonstrates the new subscriber middleware feature:
- **Logging Middleware**: Logs all incoming events with timing information for debugging
- **Idempotency Middleware**: Prevents processing duplicate notifications (useful during reconnects)
- **Rate Limiting Middleware**: Protects the client from being overwhelmed by too many notifications

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Web UI        │────▶│  HTTP API        │────▶│  Notification   │
│   (Dashboard)   │     │  (REST)          │     │  Service        │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
         │                                               │
         │                                               ▼
         │                                      ┌─────────────────┐
         │                                      │  User Manager   │
         │                                      │  - Preferences  │
         │                                      │  - Subscriptions│
         │                                      └────────┬────────┘
         │                                               │
         ▼                                               ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  SSE Stream     │◀────│  Rate Limiter    │◀────│  Template Mgr   │
│  (Real-time)    │     │  - Token Bucket  │     │  - Variables    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Quick Start

### Run the Server

```bash
bun run server-new.ts
```

The server will start on `http://localhost:3001`

### Open the Web UI

Navigate to `http://localhost:3001` in your browser to access the Notification Center.

### Run the CLI Client (with Subscriber Middleware)

```bash
# Basic mode (idempotency + rate limiting)
bun run client.ts

# Verbose mode (adds logging middleware)
VERBOSE=true bun run client.ts
```

The CLI client demonstrates the new subscriber middleware feature:
- **Idempotency**: Prevents duplicate notification processing (e.g., during SSE reconnects)
- **Rate Limiting**: Drops notifications if more than 50 arrive within 5 seconds
- **Logging** (verbose mode): Shows detailed timing for each event handler

### Send a Notification via API

```bash
curl -X POST http://localhost:3001/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-1",
    "type": "info",
    "priority": "medium",
    "title": "Hello World",
    "message": "This is a test notification",
    "channels": ["in-app", "email"]
  }'
```

### Broadcast to a Topic

```bash
curl -X POST http://localhost:3001/api/notifications/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "system.announcements",
    "type": "announcement",
    "priority": "high",
    "title": "System Maintenance",
    "message": "Scheduled maintenance tonight"
  }'
```

## API Endpoints

### Notifications
- `POST /api/notifications/send` - Send notification to a user
- `POST /api/notifications/broadcast` - Broadcast to topic subscribers
- `GET /api/users/{userId}/notifications` - Get user notifications
- `POST /api/users/{userId}/notifications/{id}/read` - Mark as read
- `POST /api/users/{userId}/notifications/read-all` - Mark all as read
- `DELETE /api/users/{userId}/notifications/{id}` - Delete notification

### Subscriptions
- `GET /api/users/{userId}/subscriptions` - Get user subscriptions
- `POST /api/subscriptions` - Subscribe to topic
- `DELETE /api/subscriptions` - Unsubscribe from topic

### Users & Preferences
- `GET /api/users` - List all users
- `PUT /api/users/{userId}/preferences` - Update user preferences
- `GET /api/users/{userId}/stats` - Get notification stats

### Templates
- `GET /api/templates` - List all templates

### System
- `GET /api/stats` - System statistics
- `GET /events?userId={id}` - SSE stream for real-time notifications

## Notification Types

- **info**: General information
- **success**: Success messages
- **warning**: Warning alerts
- **error**: Error notifications
- **progress**: Progress updates
- **announcement**: System announcements
- **activity**: User activity notifications

## Channels

- **in-app**: Real-time in-app notifications via SSE
- **email**: Email notifications (simulated)
- **push**: Push notifications (simulated)
- **sms**: SMS notifications (simulated)

## Rate Limiting

Rate limits are enforced per user:
- 10 notifications per second
- 100 notifications per minute
- 1000 notifications per hour

## Templates

Built-in templates include:
- `welcome` - Welcome message for new users
- `password-reset` - Password reset instructions
- `order-confirmation` - Order confirmation
- `security-alert` - Security-related alerts
- `system-maintenance` - Maintenance announcements
- `payment-failed` - Payment failure notification
- `new-follower` - Social activity notification
- `progress-update` - Progress tracking

## Project Structure

```
sse-notifications/
├── server.ts                  # Simple server (original demo)
├── server-new.ts              # Main server entry point (production-ready)
├── client.ts                  # CLI client with subscriber middleware
├── events.ts                  # Event definitions
├── src/
│   ├── types.ts               # TypeScript type definitions
│   ├── user-manager.ts        # User management module
│   ├── notification-service.ts # Core notification logic
│   ├── rate-limiter.ts        # Rate limiting implementation
│   └── template-manager.ts    # Template management
├── notification-system.test.ts # Test suite
├── events.test.ts             # Legacy tests
└── README.md                  # This file
```

## Subscriber Middleware Usage

The CLI client (`client.ts`) showcases how to use subscriber middleware to add cross-cutting concerns to event handling:

```typescript
import {
  Subscriber,
  createSubscriberLoggingMiddleware,
  createIdempotencyMiddleware,
  createRateLimitMiddleware,
} from "@pubsubjs/core";

// Track processed message IDs
const processedMessages = new Set<string>();

const subscriber = new Subscriber({
  events: NotificationEvents,
  transport,
  middleware: [
    // Logging: logs all incoming events with timing
    createSubscriberLoggingMiddleware(),

    // Idempotency: prevents duplicate handling
    createIdempotencyMiddleware({
      hasProcessed: (id) => processedMessages.has(id),
      markProcessed: (id) => processedMessages.add(id),
    }),

    // Rate limiting: prevents notification spam
    createRateLimitMiddleware({
      maxEvents: 50,
      windowMs: 5000,
      onLimit: (eventName) => console.log(`Rate limited: ${eventName}`),
    }),
  ],
});
```

### Middleware Order

Middleware runs in order, so consider:
1. **Logging first** - to see all incoming events
2. **Idempotency second** - to drop duplicates early
3. **Rate limiting third** - to protect against spam

### Use Cases

- **Logging**: Debug event flow, track timing
- **Idempotency**: Handle SSE reconnects, network retries, at-least-once delivery
- **Rate Limiting**: Protect against notification floods, control resource usage

## Testing

Run the test suite:

```bash
bun test
```

## Demo Users

The system comes with 3 demo users:
- **Alice** (user-1): Full preferences, subscribes to announcements and activity
- **Bob** (user-2): Email digest enabled, subscribes to announcements
- **Charlie** (user-3): Minimal preferences, subscribes to activity only

## Production Considerations

### Database
Currently uses in-memory storage. For production:
- Replace with PostgreSQL, MongoDB, or Redis
- Implement proper data persistence
- Add database migrations

### Message Queue
For high-volume scenarios:
- Integrate with Redis, RabbitMQ, or AWS SQS
- Implement background job processing

### External Services
- **Email**: Integrate with SendGrid, AWS SES, or Mailgun
- **Push**: Integrate with Firebase Cloud Messaging (FCM) or APNs
- **SMS**: Integrate with Twilio or AWS SNS

### Scaling
- Deploy multiple server instances behind a load balancer
- Use Redis for shared state (SSE connections, rate limits)
- Implement proper session management

## License

MIT
