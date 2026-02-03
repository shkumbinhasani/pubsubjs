# Microservices with Redis Pub/Sub - Enterprise Reference Implementation

A comprehensive, production-ready microservices architecture example demonstrating event-driven patterns with the @pubsub library. This implementation showcases best practices for building resilient, scalable distributed systems.

**New in this version:** Subscriber Middleware support for idempotency, logging, timing, and rate limiting.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                               │
│                    (HTTP API + Load Balancer)                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Redis Pub/Sub                               │
│              (Message Broker + Service Discovery)                │
└──────────────────────┬──────────────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┬───────────────┐
       ▼               ▼               ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Order     │ │  Inventory  │ │   Payment   │ │  Shipping   │
│  Service    │ │  Service    │ │  Service    │ │  Service    │
│  (Saga      │ │  (Stock     │ │  (Payment   │ │  (Delivery  │
│  Orchestrator│ │   Mgmt)     │ │   Gateway)  │ │   Mgmt)     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
       │               │               │               │
       └───────────────┴───────────────┴───────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              Supporting Services                                 │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  User Service   │ Notification    │   Service Discovery         │
│  (User Mgmt)    │ Service         │   & Health Checks           │
│                 │ (Email/Push/SMS)│                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

## Key Features

### 1. Saga Pattern for Distributed Transactions
The order flow implements the Saga pattern to maintain data consistency across services:

```
Order Flow Saga:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Place     │───▶│   Reserve   │───▶│   Process   │───▶│   Prepare   │
│   Order     │    │  Inventory  │    │   Payment   │    │  Shipment   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │                  │
       │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼
  order.placed    inventory.reserved   payment.processed  order.completed
```

If any step fails, compensation events are triggered:
- `order.compensation.inventory.release` - Release reserved inventory
- `order.compensation.payment.refund` - Refund processed payment
- `order.compensation.shipment.cancel` - Cancel prepared shipment

### 2. Circuit Breaker Pattern
Each service implements circuit breakers to prevent cascading failures:

```typescript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,      // Open after 5 failures
  successThreshold: 3,      // Close after 3 successes in half-open
  timeout: 30000,           // 30s before attempting half-open
});
```

States: `CLOSED` → `OPEN` → `HALF-OPEN` → `CLOSED`

### 3. Service Discovery & Health Checks
Automatic service registration and health monitoring:

- Services register themselves on startup
- Heartbeats every 30 seconds
- Health checks every 60 seconds
- Automatic deregistration on failure

### 4. Event Sourcing
Order lifecycle is captured as an immutable event stream:

```
order.event.created
order.event.status.changed (pending → reserved)
order.event.status.changed (reserved → paid)
order.event.status.changed (paid → shipped)
order.event.status.changed (shipped → delivered)
```

### 5. Subscriber Middleware
Powerful middleware stack for intercepting and processing incoming events:

```typescript
import {
  Subscriber,
  createSubscriberLoggingMiddleware,
  createSubscriberTimingMiddleware,
  createIdempotencyMiddleware,
  createRateLimitMiddleware,
} from "@pubsubjs/core";

// Track processed messages (use Redis in production)
const processedMessages = new Set<string>();

const subscriber = new Subscriber({
  events: MyEvents,
  transport,
  middleware: [
    // Log all incoming events with timing
    createSubscriberLoggingMiddleware(),

    // Prevent duplicate processing of redelivered messages
    createIdempotencyMiddleware({
      hasProcessed: async (messageId) => processedMessages.has(messageId),
      markProcessed: async (messageId) => {
        processedMessages.add(messageId);
      },
    }),

    // Collect processing time metrics
    createSubscriberTimingMiddleware((eventName, durationMs) => {
      console.log(`${eventName} processed in ${durationMs}ms`);
    }),

    // Optional: Rate limiting for throughput control
    createRateLimitMiddleware({
      maxEvents: 100,
      windowMs: 1000,
      onLimit: (eventName) => console.warn(`Rate limited: ${eventName}`),
    }),
  ],
});
```

**Available Middleware:**
- `createSubscriberLoggingMiddleware()` - Logs events with timing for distributed tracing
- `createIdempotencyMiddleware({ hasProcessed, markProcessed })` - Skips already-processed messages
- `createSubscriberTimingMiddleware(onTiming)` - Reports handler duration for metrics
- `createRateLimitMiddleware({ maxEvents, windowMs, onLimit })` - Enforces throughput limits

### 6. Legacy Idempotency Keys
For publisher-side idempotency:

```typescript
const idempotencyKey = generateIdempotencyKey("order.placed", payload);
// Same key = same result, even if event is processed multiple times
```

### 7. Dead Letter Queue (DLQ)
Failed events are captured and retried:

- Automatic retry with exponential backoff
- Max 3 retries before archiving
- Manual retry capability
- Event audit trail

### 8. Metrics & Monitoring
Comprehensive metrics collection:

- Event processing times
- Circuit breaker state changes
- Saga completion rates
- Service health status

## Project Structure

```
examples/microservices-redis/
├── events.ts                    # Shared event definitions
├── lib/
│   ├── circuit-breaker.ts       # Circuit breaker implementation
│   ├── service-discovery.ts     # Service registry
│   ├── dead-letter-queue.ts     # DLQ management
│   └── idempotency.ts           # Idempotency handling
├── user-service.ts              # User management service
├── order-service.ts             # Order orchestrator (Saga)
├── inventory-service.ts         # Inventory management
├── payment-service.ts           # Payment processing
├── shipping-service.ts          # Shipping management
├── notification-service.ts      # Notification service
├── api-gateway.ts               # HTTP API gateway
├── demo.ts                      # Demo orchestrator
├── docker-compose.yml           # Docker orchestration
├── Dockerfile                   # Container definition
├── events.test.ts               # Event tests
└── README.md                    # This file
```

## Running the System

### Prerequisites

- Docker and Docker Compose
- OR: Bun installed locally + Redis running

### Option 1: Docker Compose (Recommended)

Start all services with a single command:

```bash
cd examples/microservices-redis
docker-compose up --build
```

This starts:
- Redis (port 6379)
- All 7 microservices with health checks
- API Gateway (port 8080)

### Option 2: Local Development

1. Start Redis:
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

2. Install dependencies:
```bash
cd examples/microservices-redis
bun install
```

3. Start services (in separate terminals):
```bash
# Terminal 1 - User Service
bun run user-service.ts

# Terminal 2 - Order Service
bun run order-service.ts

# Terminal 3 - Inventory Service
bun run inventory-service.ts

# Terminal 4 - Payment Service
bun run payment-service.ts

# Terminal 5 - Shipping Service
bun run shipping-service.ts

# Terminal 6 - Notification Service
bun run notification-service.ts

# Terminal 7 - API Gateway
bun run api-gateway.ts
```

### Running the Demo

Once all services are running, execute the demo scenarios:

```bash
bun run demo.ts
```

This demonstrates:
1. User registration
2. Successful order flow (saga completion)
3. Failed order with compensation
4. Order cancellation
5. Idempotency handling

## API Endpoints

The API Gateway exposes the following endpoints:

### Users
- `POST /users` - Create a new user
- `GET /users/:id` - Get user by ID
- `PUT /users/:id` - Update user

### Orders
- `POST /orders` - Place a new order
- `GET /orders/:id` - Get order by ID
- `POST /orders/:id/cancel` - Cancel an order
- `GET /orders/:id/events` - Get order event history

### Inventory
- `GET /inventory/:productId` - Get product stock
- `POST /inventory/:productId/restock` - Restock product

### Health
- `GET /health` - Gateway health check
- `GET /services` - List all registered services
- `GET /services/:name/health` - Service health check

## Event Catalog

### User Events
| Event | Description |
|-------|-------------|
| `user.created` | New user registered |
| `user.updated` | User profile updated |
| `user.deleted` | User account deleted |
| `user.validated` | User validation completed |

### Order Events
| Event | Description |
|-------|-------------|
| `order.placed` | Order created (Saga start) |
| `order.inventory.reserved` | Inventory reserved |
| `order.payment.processed` | Payment completed |
| `order.shipment.prepared` | Shipment ready |
| `order.completed` | Order fulfilled (Saga end) |
| `order.cancelled` | Order cancelled |
| `order.compensation.*` | Compensation events |

### Payment Events
| Event | Description |
|-------|-------------|
| `payment.requested` | Payment initiated |
| `payment.processed` | Payment completed |
| `payment.failed` | Payment failed |
| `payment.refund.requested` | Refund initiated |
| `payment.refunded` | Refund completed |

### Inventory Events
| Event | Description |
|-------|-------------|
| `inventory.reservation.requested` | Reservation requested |
| `inventory.reserved` | Stock reserved |
| `inventory.reservation.failed` | Reservation failed |
| `inventory.released` | Reservation released |
| `inventory.committed` | Stock deducted |
| `inventory.lowStock` | Low stock alert |

### Service Events
| Event | Description |
|-------|-------------|
| `service.registered` | Service joined cluster |
| `service.deregistered` | Service left cluster |
| `service.health.status` | Health check result |
| `service.heartbeat` | Service heartbeat |

## Testing

Run the test suite:

```bash
bun test
```

Tests cover:
- Event schema validation
- Event type safety
- Event registry completeness

## Monitoring

### Health Checks

Check service health:
```bash
curl http://localhost:8080/health
curl http://localhost:8080/services
```

### Metrics

Services publish metrics events:
- `metrics.event.processed` - Event processing stats
- `metrics.circuit.breaker.state` - Circuit breaker changes
- `metrics.saga.completed` - Saga completion stats

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `SERVICE_NAME` | - | Service identifier |
| `SERVICE_PORT` | - | HTTP port for health checks |
| `LOG_LEVEL` | `info` | Logging level |

## Architecture Patterns

### Event-Driven Architecture
Services communicate exclusively through events, enabling:
- Loose coupling
- Independent deployment
- Horizontal scaling
- Eventual consistency

### Saga Pattern
Long-running transactions are broken into steps with compensation:
- **Choreography**: Services react to events
- **Orchestration**: Order service coordinates flow

### CQRS (Command Query Responsibility Segregation)
Commands (write) and queries (read) are separated:
- Event store for writes
- Projections for reads

### Event Sourcing
State is derived from event history:
- Immutable event log
- Temporal queries
- Audit trail

## Production Considerations

### Scalability
- Each service can scale independently
- Redis Cluster for message broker
- Read replicas for query services

### Resilience
- Circuit breakers prevent cascade failures
- DLQ handles poison messages
- Automatic retries with backoff
- Health checks and self-healing

### Observability
- Structured logging
- Distributed tracing
- Metrics collection
- Health endpoints

### Security
- Event payload encryption
- Service-to-service authentication
- Input validation with Zod schemas

## License

MIT - Part of the @pubsub project
