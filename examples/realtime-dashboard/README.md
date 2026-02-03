# Real-time Analytics Dashboard

A fully functional real-time analytics dashboard built with Bun, React, and WebSockets. This example demonstrates how to build a production-ready dashboard with live data updates, multiple chart types, user presence tracking, and an alert system.

**NEW: This example now showcases the `@pubsubjs/core` Subscriber Middleware feature** for:
- **Rate limiting** - Prevents UI overload from too many rapid updates
- **Timing middleware** - Reports handler duration for performance monitoring
- **Idempotency** - Skips duplicate messages by tracking message IDs

## Features

### Real-time Metrics
- **Active Users**: Live count of currently active users
- **Orders Today**: Real-time order tracking
- **Revenue**: Live revenue calculations
- **Error Rate**: System error monitoring
- **Requests/sec**: API request throughput
- **Avg Response Time**: Performance metrics
- **CPU Usage**: System resource monitoring
- **Memory Usage**: Memory consumption tracking

### Chart Types
- **Line Charts**: Real-time data visualization with smooth animations
- **Bar Charts**: Comparative data representation
- **Pie Charts**: User distribution by role

### User Presence
- Visual indicators for online users
- Role-based coloring (Admin, User, Guest)
- Location information
- Real-time join/leave notifications

### Activity Feed
- Real-time activity stream
- Event types: User joins, Orders, System events, Alerts
- Timestamps and metadata
- Auto-scrolling with new events

### Alert System
- Severity levels: Info, Warning, Critical
- Dismissible alerts
- Visual indicators by severity
- Real-time alert triggering

### Time Range Selection
- Last 5 minutes
- Last hour
- Last 24 hours
- Last 7 days

## Architecture

### Server (`server.ts`)
- Bun.serve() with WebSocket support
- Simulated metric generation
- REST API endpoints for historical data
- Real-time data broadcasting

### Frontend (`frontend.tsx`)
- React with hooks for state management
- Custom WebSocket hook for real-time updates
- Canvas-based line charts
- CSS Grid layout

### Events (`events.ts`)
- Zod schemas for type safety
- Event definitions for all dashboard features
- Type exports for TypeScript

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) installed

### Installation

```bash
# Install dependencies
bun install
```

### Running the Dashboard

```bash
# Start the server
bun run examples/realtime-dashboard/server.ts

# Or using the package script
cd examples/realtime-dashboard
bun run start
```

Open http://localhost:3002 in your browser.

### Running Tests

```bash
# Run tests
cd examples/realtime-dashboard
bun test
```

## API Endpoints

- `GET /api/metrics` - Current metrics snapshot
- `GET /api/users` - List of online users
- `GET /api/activities` - Recent activity feed
- `GET /api/alerts` - Active alerts
- `GET /api/charts/:chartId` - Historical chart data
- `WebSocket /` - Real-time updates

## WebSocket Events

### Server → Client
- `metrics.update` - Updated metrics data
- `chart.datapoint` - New chart data point
- `user.online` - User came online
- `user.offline` - User went offline
- `activity.new` - New activity event
- `alert.trigger` - New alert
- `alert.dismiss` - Alert dismissed

### Client → Server
- `alert.dismiss` - Dismiss an alert
- `time.range.change` - Change time range

## Project Structure

```
examples/realtime-dashboard/
├── server.ts          # Bun server with WebSocket
├── frontend.tsx       # React dashboard UI
├── events.ts          # Event definitions and types
├── styles.css         # Dashboard styling
├── index.html         # HTML entry point
├── package.json       # Dependencies
└── events.test.ts     # Event tests
```

## Customization

### Adding New Metrics

1. Update the `MetricData` type in `events.ts`
2. Add the metric to the server state
3. Update the simulation logic
4. Add a `MetricCard` component in the frontend

### Adding New Chart Types

1. Create a new chart component in `frontend.tsx`
2. Add it to the `ChartType` union type
3. Update the `ChartWidget` component

### Styling

The dashboard uses CSS variables for theming. Edit the `:root` section in `styles.css` to customize colors.

## Subscriber Middleware (NEW)

This example demonstrates the new `@pubsubjs/core` subscriber middleware feature:

### Rate Limiting Middleware

Prevents UI overload by limiting the number of events processed per second:

```typescript
import { createRateLimitMiddleware } from "@pubsubjs/core";

const rateLimitMiddleware = createRateLimitMiddleware({
  maxEvents: 50,           // Maximum events per window
  windowMs: 1000,          // Window size in ms
  onLimit: (eventName) => {
    console.log(`Event ${eventName} rate limited`);
  },
});
```

### Timing Middleware

Reports handler duration for performance monitoring:

```typescript
import { createSubscriberTimingMiddleware } from "@pubsubjs/core";

const timingMiddleware = createSubscriberTimingMiddleware((eventName, durationMs) => {
  console.log(`Handler for ${eventName} took ${durationMs}ms`);
});
```

### Idempotency Middleware

Skips duplicate messages by tracking processed message IDs:

```typescript
import { createIdempotencyMiddleware } from "@pubsubjs/core";

const processedSet = new Set<string>();

const idempotencyMiddleware = createIdempotencyMiddleware({
  hasProcessed: (id) => processedSet.has(id),
  markProcessed: (id) => processedSet.add(id),
});
```

### Using Middleware Together

```typescript
import { Subscriber } from "@pubsubjs/core";

const subscriber = new Subscriber({
  events: DashboardEvents,
  transport,
  middleware: [
    countingMiddleware,      // Custom: count total events
    idempotencyMiddleware,   // Skip duplicates
    rateLimitMiddleware,     // Enforce rate limits
    timingMiddleware,        // Report timing
  ],
});
```

The middleware executes in order, so:
1. **Counting** happens first (all events counted)
2. **Idempotency** filters duplicates
3. **Rate limiting** drops excess events
4. **Timing** measures handler duration

See the `PerformanceStatsWidget` in the dashboard UI for real-time middleware statistics.

## Performance Considerations

- Data is downsampled based on time range selection
- Chart data is limited to 60 points for performance
- **Subscriber middleware** prevents UI overload from rapid updates
- Activity feed is limited to 50 events
- Canvas rendering for smooth chart animations

## License

MIT
