/**
 * Production-Ready PubSub Example
 *
 * This example demonstrates best practices for building event-driven
 * applications using the @pubsubjs/core library.
 *
 * Features demonstrated:
 * - Comprehensive event definitions with Zod schemas
 * - Middleware patterns (logging, metrics, retry logic)
 * - Error handling and recovery strategies
 * - Authentication and authorization patterns
 * - Dead letter queue implementation
 * - Circuit breaker pattern
 * - Event versioning
 *
 * Run with: bun run index.ts
 */

import { z } from "zod";
import {
  defineEvent,
  Publisher,
  Subscriber,
  PubSub,
  createLoggingMiddleware,
  createSubscriberLoggingMiddleware,
  createSubscriberTimingMiddleware,
  createIdempotencyMiddleware,
  createRateLimitMiddleware,
  ValidationError,
  UnknownEventError,
  ConnectionError,
} from "@pubsubjs/core";
import { MemoryTransport } from "@pubsubjs/react";

// =============================================================================
// SECTION 1: EVENT DEFINITIONS
// =============================================================================

/**
 * Best Practice: Define all events in a central registry with:
 * - Clear, descriptive names using dot notation (domain.action)
 * - Comprehensive Zod schemas for validation
 * - Version numbers for backward compatibility
 * - Detailed descriptions for documentation
 */

// Helper schemas for common patterns
const EmailSchema = z.string().email();
const UUIDSchema = z.string().uuid();
const TimestampSchema = z.string(); // ISO 8601 datetime
const IPAddressSchema = z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);

// User authentication events
const AuthEvents = defineEvent([
  {
    name: "auth.login",
    schema: z.object({
      userId: UUIDSchema,
      email: EmailSchema,
      ipAddress: IPAddressSchema,
      userAgent: z.string(),
      timestamp: TimestampSchema,
      metadata: z.object({
        deviceId: z.string().optional(),
        location: z.string().optional(),
        mfaUsed: z.boolean().default(false),
      }),
    }),
    description: "Emitted when a user successfully logs in",
  },
  {
    name: "auth.logout",
    schema: z.object({
      userId: UUIDSchema,
      sessionId: z.string(),
      timestamp: TimestampSchema,
      reason: z.enum(["user_initiated", "timeout", "forced"]),
    }),
    description: "Emitted when a user logs out or session ends",
  },
  {
    name: "auth.login_failed",
    schema: z.object({
      email: EmailSchema,
      ipAddress: IPAddressSchema,
      timestamp: TimestampSchema,
      reason: z.enum(["invalid_credentials", "account_locked", "mfa_failed"]),
      attemptCount: z.number().int().min(1),
    }),
    description: "Emitted when a login attempt fails",
  },
]);

// Password and security events
const SecurityEvents = defineEvent([
  {
    name: "security.password_reset_requested",
    schema: z.object({
      userId: UUIDSchema,
      email: EmailSchema,
      token: z.string(),
      expiresAt: TimestampSchema,
      ipAddress: IPAddressSchema,
      timestamp: TimestampSchema,
    }),
    description: "Emitted when a user requests a password reset",
  },
  {
    name: "security.password_reset_completed",
    schema: z.object({
      userId: UUIDSchema,
      email: EmailSchema,
      timestamp: TimestampSchema,
      ipAddress: IPAddressSchema,
    }),
    description: "Emitted when a password is successfully reset",
  },
  {
    name: "security.email_verification_sent",
    schema: z.object({
      userId: UUIDSchema,
      email: EmailSchema,
      token: z.string(),
      expiresAt: TimestampSchema,
    }),
    description: "Emitted when a verification email is sent",
  },
  {
    name: "security.email_verified",
    schema: z.object({
      userId: UUIDSchema,
      email: EmailSchema,
      timestamp: TimestampSchema,
    }),
    description: "Emitted when an email is successfully verified",
  },
  {
    name: "security.suspicious_activity",
    schema: z.object({
      userId: UUIDSchema.optional(),
      email: EmailSchema.optional(),
      ipAddress: IPAddressSchema,
      activity: z.enum([
        "multiple_failed_logins",
        "unusual_location",
        "rapid_requests",
        "brute_force_attempt",
      ]),
      details: z.object({}).passthrough(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      timestamp: TimestampSchema,
    }),
    description: "Emitted when suspicious activity is detected",
  },
]);

// User lifecycle events
const UserLifecycleEvents = defineEvent([
  {
    name: "user.created",
    schema: z.object({
      userId: UUIDSchema,
      email: EmailSchema,
      name: z.string().min(1).max(100),
      createdAt: TimestampSchema,
      source: z.enum(["web", "mobile", "api", "admin"]),
      metadata: z.object({
        referralCode: z.string().optional(),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
      }),
    }),
    description: "Emitted when a new user account is created",
  },
  {
    name: "user.updated",
    schema: z.object({
      userId: UUIDSchema,
      changes: z.array(
        z.object({
          field: z.string(),
          oldValue: z.unknown().optional(),
          newValue: z.unknown(),
        })
      ),
      updatedAt: TimestampSchema,
      updatedBy: UUIDSchema, // Can be the user themselves or an admin
    }),
    description: "Emitted when user data is updated",
  },
  {
    name: "user.deactivated",
    schema: z.object({
      userId: UUIDSchema,
      reason: z.enum(["user_request", "violation", "inactive", "admin_action"]),
      deactivatedAt: TimestampSchema,
      deactivatedBy: UUIDSchema,
      dataRetentionDays: z.number().int().default(30),
    }),
    description: "Emitted when a user account is deactivated",
  },
]);

// Notification events
const NotificationEvents = defineEvent([
  {
    name: "notification.send_email",
    schema: z.object({
      to: EmailSchema,
      templateId: z.string(),
      subject: z.string(),
      data: z.object({}).passthrough(),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      scheduledFor: TimestampSchema.optional(),
      metadata: z.object({
        userId: UUIDSchema.optional(),
        correlationId: z.string().optional(),
        trackingEnabled: z.boolean().default(true),
      }),
    }),
    description: "Request to send an email notification",
  },
  {
    name: "notification.send_sms",
    schema: z.object({
      to: z.string(), // Phone number
      templateId: z.string(),
      data: z.object({}).passthrough(),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    }),
    description: "Request to send an SMS notification",
  },
  {
    name: "notification.send_push",
    schema: z.object({
      userId: UUIDSchema,
      deviceTokens: z.array(z.string()),
      title: z.string(),
      body: z.string(),
      data: z.object({}).passthrough().optional(),
      priority: z.enum(["normal", "high"]).default("normal"),
    }),
    description: "Request to send a push notification",
  },
]);

// Analytics events
const AnalyticsEvents = defineEvent([
  {
    name: "analytics.event_tracked",
    schema: z.object({
      eventName: z.string(),
      userId: UUIDSchema.optional(),
      anonymousId: z.string().optional(),
      properties: z.object({}).passthrough(),
      timestamp: TimestampSchema,
      context: z.object({
        ip: IPAddressSchema.optional(),
        userAgent: z.string().optional(),
        url: z.string().url().optional(),
        referrer: z.string().url().optional(),
      }),
    }),
    description: "Generic analytics event tracking",
  },
]);

// =============================================================================
// SECTION 2: MIDDLEWARE IMPLEMENTATIONS
// =============================================================================

/**
 * Best Practice: Use middleware for cross-cutting concerns like:
 * - Logging and observability
 * - Metrics and monitoring
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern
 * - Request tracing
 *
 * The library provides two types of middleware:
 *
 * 1. PUBLISHER MIDDLEWARE (PublishMiddleware):
 *    - Intercepts outgoing events before they are sent
 *    - Use for: retry logic, circuit breaker, tracing, metrics
 *    - Custom implementations shown below
 *
 * 2. SUBSCRIBER MIDDLEWARE (SubscribeMiddleware) - NEW:
 *    - Intercepts incoming events before handlers process them
 *    - Built-in middleware available:
 *      - createSubscriberLoggingMiddleware() - logs events with timing
 *      - createSubscriberTimingMiddleware(callback) - reports handler duration
 *      - createIdempotencyMiddleware({ hasProcessed, markProcessed }) - skips duplicates
 *      - createRateLimitMiddleware({ maxEvents, windowMs, onLimit }) - enforces throughput
 *    - See notificationServiceExample() and securityMonitoringExample() for usage
 */

/**
 * Metrics middleware - tracks event publishing metrics
 * In production, send these to your metrics system (Datadog, Prometheus, etc.)
 */
function createMetricsMiddleware<TEvents>() {
  const metrics = {
    eventsPublished: 0,
    eventsFailed: 0,
    totalLatency: 0,
  };

  return {
    middleware: async (
      eventName: string,
      payload: unknown,
      options: unknown,
      next: () => Promise<void>
    ) => {
      const start = Date.now();
      try {
        await next();
        metrics.eventsPublished++;
        metrics.totalLatency += Date.now() - start;
        console.log(`[Metrics] Published ${eventName} in ${Date.now() - start}ms`);
      } catch (error) {
        metrics.eventsFailed++;
        throw error;
      }
    },
    getMetrics: () => ({ ...metrics }),
  };
}

/**
 * Retry middleware - implements exponential backoff for failed publishes
 * Best Practice: Only retry transient errors, not validation errors
 */
function createRetryMiddleware<TEvents>(maxRetries = 3, baseDelay = 100) {
  return async (
    eventName: string,
    payload: unknown,
    options: unknown,
    next: () => Promise<void>
  ) => {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await next();
        if (attempt > 0) {
          console.log(`[Retry] Successfully published ${eventName} after ${attempt} retries`);
        }
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry validation errors - they will always fail
        if (error instanceof ValidationError || error instanceof UnknownEventError) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`[Retry] Attempt ${attempt + 1} failed for ${eventName}, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  };
}

/**
 * Circuit breaker middleware - prevents cascading failures
 * When failure threshold is reached, immediately fail fast
 */
function createCircuitBreakerMiddleware<TEvents>(
  failureThreshold = 5,
  resetTimeout = 30000
) {
  let failures = 0;
  let lastFailureTime: number | null = null;
  let state: "closed" | "open" | "half-open" = "closed";

  return async (
    eventName: string,
    payload: unknown,
    options: unknown,
    next: () => Promise<void>
  ) => {
    // Check if we should transition from open to half-open
    if (state === "open" && lastFailureTime) {
      const timeSinceLastFailure = Date.now() - lastFailureTime;
      if (timeSinceLastFailure > resetTimeout) {
        console.log(`[CircuitBreaker] Entering half-open state for ${eventName}`);
        state = "half-open";
        failures = 0;
      } else {
        throw new Error(
          `Circuit breaker is OPEN for ${eventName}. Try again in ${Math.ceil(
            (resetTimeout - timeSinceLastFailure) / 1000
          )}s`
        );
      }
    }

    try {
      await next();

      // Success in half-open state closes the circuit
      if (state === "half-open") {
        console.log(`[CircuitBreaker] Circuit closed for ${eventName}`);
        state = "closed";
        failures = 0;
      }
    } catch (error) {
      failures++;
      lastFailureTime = Date.now();

      if (failures >= failureThreshold) {
        console.error(`[CircuitBreaker] Circuit opened for ${eventName} after ${failures} failures`);
        state = "open";
      }

      throw error;
    }
  };
}

/**
 * Tracing middleware - adds correlation IDs for distributed tracing
 */
function createTracingMiddleware<TEvents>() {
  return async (
    eventName: string,
    payload: unknown,
    options: { metadata?: Record<string, unknown> } | undefined,
    next: () => Promise<void>
  ) => {
    const correlationId = options?.metadata?.correlationId ?? generateCorrelationId();
    const traceId = options?.metadata?.traceId ?? generateTraceId();

    console.log(`[Trace] Publishing ${eventName} [correlationId=${correlationId}, traceId=${traceId}]`);

    // Add trace context to options
    const enhancedOptions = {
      ...options,
      metadata: {
        ...options?.metadata,
        correlationId,
        traceId,
        timestamp: new Date().toISOString(),
      },
    };

    // Update options for downstream middleware
    if (options) {
      Object.assign(options, enhancedOptions);
    }

    await next();
  };
}

// Helper functions for tracing
function generateCorrelationId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// =============================================================================
// SECTION 3: ERROR HANDLING AND RECOVERY
// =============================================================================

/**
 * Best Practice: Implement comprehensive error handling with:
 * - Structured error types
 * - Dead letter queue for failed events
 * - Graceful degradation
 * - Alerting for critical errors
 */

/**
 * Dead Letter Queue implementation
 * Stores failed events for later processing/analysis
 */
class DeadLetterQueue {
  private failedEvents: Array<{
    eventName: string;
    payload: unknown;
    error: string;
    timestamp: Date;
    retryCount: number;
  }> = [];

  async add(eventName: string, payload: unknown, error: Error, retryCount = 0) {
    const entry = {
      eventName,
      payload,
      error: error.message,
      timestamp: new Date(),
      retryCount,
    };

    this.failedEvents.push(entry);
    console.error(`[DLQ] Event added to dead letter queue: ${eventName}`, entry);

    // In production: persist to database, send alert, etc.
    if (this.failedEvents.length >= 100) {
      console.warn(`[DLQ] Queue size warning: ${this.failedEvents.length} failed events`);
    }
  }

  getFailedEvents() {
    return [...this.failedEvents];
  }

  clear() {
    this.failedEvents = [];
  }
}

// Global DLQ instance
const deadLetterQueue = new DeadLetterQueue();

/**
 * Enhanced error handler with DLQ integration
 */
function createErrorHandler() {
  return (error: Error, eventName: string, payload: unknown) => {
    // Log structured error
    console.error(`[ErrorHandler] Failed to process ${eventName}:`, {
      error: error.message,
      stack: error.stack,
      payload: JSON.stringify(payload).substring(0, 500), // Truncate large payloads
      timestamp: new Date().toISOString(),
    });

    // Add to dead letter queue
    deadLetterQueue.add(eventName, payload, error);

    // In production: send to error tracking service, alert on-call, etc.
    if (error instanceof ConnectionError) {
      console.error(`[ErrorHandler] Connection error - consider checking transport health`);
    } else if (error instanceof ValidationError) {
      console.error(`[ErrorHandler] Validation error - check event schema compatibility`);
    }
  };
}

// =============================================================================
// SECTION 4: PRODUCTION EXAMPLES
// =============================================================================

/**
 * Example 1: Authentication Service
 * Demonstrates publisher-only pattern with middleware
 */
async function authenticationServiceExample() {
  console.log("\n" + "=".repeat(60));
  console.log("EXAMPLE 1: Authentication Service");
  console.log("=".repeat(60));

  const transport = new MemoryTransport();
  const metrics = createMetricsMiddleware<typeof AuthEvents>();

  const publisher = new Publisher({
    events: AuthEvents,
    transport,
    middleware: [
      createTracingMiddleware(),
      createLoggingMiddleware(),
      metrics.middleware,
      createRetryMiddleware(3, 100),
      createCircuitBreakerMiddleware(3, 10000),
    ],
  });

  // Simulate successful login
  console.log("\n--- Simulating user login ---");
  await publisher.publish("auth.login", {
    userId: "550e8400-e29b-41d4-a716-446655440000",
    email: "user@example.com",
    ipAddress: "192.168.1.1",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    timestamp: new Date().toISOString(),
    metadata: {
      deviceId: "device-123",
      location: "New York, USA",
      mfaUsed: true,
    },
  });

  // Simulate failed login
  console.log("\n--- Simulating failed login ---");
  await publisher.publish("auth.login_failed", {
    email: "attacker@example.com",
    ipAddress: "10.0.0.1",
    timestamp: new Date().toISOString(),
    reason: "invalid_credentials",
    attemptCount: 3,
  });

  // Print metrics
  console.log("\n--- Metrics ---");
  console.log(metrics.getMetrics());

  await publisher.disconnect();
}

/**
 * Example 2: Notification Service
 * Demonstrates subscriber-only pattern with error handling
 */
async function notificationServiceExample() {
  console.log("\n" + "=".repeat(60));
  console.log("EXAMPLE 2: Notification Service");
  console.log("=".repeat(60));

  const transport = new MemoryTransport();

  // Create publisher to simulate incoming events
  const notificationPublisher = new Publisher({
    events: NotificationEvents,
    transport,
  });

  const securityPublisher = new Publisher({
    events: SecurityEvents,
    transport,
  });

  // Create subscriber with comprehensive error handling and subscriber middleware
  // Note: Subscriber middleware intercepts incoming events for logging, metrics,
  // rate limiting, authentication, idempotency, and error handling
  const subscriber = new Subscriber({
    events: { ...NotificationEvents, ...SecurityEvents },
    transport,
    onError: createErrorHandler(),
    middleware: [
      // Log all incoming events with timing information
      createSubscriberLoggingMiddleware(),
      // Track handler duration for metrics
      createSubscriberTimingMiddleware((eventName, durationMs) => {
        console.log(`[Subscriber Metrics] ${eventName} handler took ${durationMs}ms`);
      }),
    ],
  });

  // Email handler
  subscriber.on("notification.send_email", (payload, { ctx }) => {
    console.log(`\n[Email Service] Sending email:`);
    console.log(`  To: ${payload.to}`);
    console.log(`  Subject: ${payload.subject}`);
    console.log(`  Template: ${payload.templateId}`);
    console.log(`  Priority: ${payload.priority}`);
    console.log(`  Message ID: ${ctx.messageId}`);

    // Simulate email sending
    if (payload.priority === "urgent") {
      console.log(`  ⚡ Sending via high-priority queue`);
    }
  });

  // SMS handler
  subscriber.on("notification.send_sms", (payload) => {
    console.log(`\n[SMS Service] Sending SMS to ${payload.to}`);
    console.log(`  Template: ${payload.templateId}`);
  });

  // Password reset handler
  subscriber.on("security.password_reset_requested", (payload) => {
    console.log(`\n[Security Service] Password reset requested:`);
    console.log(`  User: ${payload.email}`);
    console.log(`  Token expires: ${payload.expiresAt}`);

    // Trigger email notification
    notificationPublisher.publish("notification.send_email", {
      to: payload.email,
      templateId: "password-reset",
      subject: "Reset your password",
      data: {
        resetToken: payload.token,
        expiresAt: payload.expiresAt,
      },
      priority: "high",
      metadata: {
        userId: payload.userId,
        correlationId: `reset-${payload.userId}`,
      },
    });
  });

  await subscriber.subscribe();

  // Simulate events
  console.log("\n--- Simulating password reset request ---");
  await securityPublisher.publish("security.password_reset_requested", {
    userId: "550e8400-e29b-41d4-a716-446655440000",
    email: "user@example.com",
    token: "reset-token-123",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    ipAddress: "192.168.1.1",
    timestamp: new Date().toISOString(),
  });

  await new Promise((r) => setTimeout(r, 100));

  await subscriber.unsubscribe();
  await notificationPublisher.disconnect();
  await securityPublisher.disconnect();
}

/**
 * Example 3: User Service with PubSub
 * Demonstrates bidirectional pattern
 */
async function userServiceExample() {
  console.log("\n" + "=".repeat(60));
  console.log("EXAMPLE 3: User Service (Bidirectional)");
  console.log("=".repeat(60));

  const transport = new MemoryTransport();

  const pubsub = new PubSub({
    publishEvents: { ...NotificationEvents, ...AnalyticsEvents },
    subscribeEvents: UserLifecycleEvents,
    transport,
    onError: createErrorHandler(),
  });

  // Handle user creation
  pubsub.on("user.created", async (payload, { publisher }) => {
    console.log(`\n[User Service] New user created: ${payload.name} (${payload.email})`);

    // Send welcome email
    await publisher.publish("notification.send_email", {
      to: payload.email,
      templateId: "welcome",
      subject: `Welcome to our platform, ${payload.name}!`,
      data: {
        userName: payload.name,
        signupDate: payload.createdAt,
      },
      priority: "normal",
      metadata: {
        userId: payload.userId,
      },
    });

    // Track analytics
    await publisher.publish("analytics.event_tracked", {
      eventName: "user_signup",
      userId: payload.userId,
      properties: {
        source: payload.source,
        hasReferral: !!payload.metadata.referralCode,
      },
      timestamp: new Date().toISOString(),
      context: {},
    });

    console.log(`  ✓ Welcome email sent`);
    console.log(`  ✓ Analytics tracked`);
  });

  // Handle user updates
  pubsub.on("user.updated", (payload) => {
    console.log(`\n[User Service] User ${payload.userId} updated:`);
    payload.changes.forEach((change) => {
      console.log(`  - ${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
    });
  });

  await pubsub.start();

  // Simulate user creation
  console.log("\n--- Simulating user signup ---");
  const externalPublisher = new Publisher({
    events: UserLifecycleEvents,
    transport,
  });

  await externalPublisher.publish("user.created", {
    userId: "550e8400-e29b-41d4-a716-446655440001",
    email: "jane@example.com",
    name: "Jane Smith",
    createdAt: new Date().toISOString(),
    source: "web",
    metadata: {
      referralCode: "FRIEND20",
      utmSource: "google",
    },
  });

  await new Promise((r) => setTimeout(r, 100));

  // Simulate user update
  console.log("\n--- Simulating profile update ---");
  await externalPublisher.publish("user.updated", {
    userId: "550e8400-e29b-41d4-a716-446655440001",
    changes: [
      { field: "name", oldValue: "Jane Smith", newValue: "Jane Doe" },
      { field: "email", oldValue: "jane@example.com", newValue: "jane.doe@example.com" },
    ],
    updatedAt: new Date().toISOString(),
    updatedBy: "550e8400-e29b-41d4-a716-446655440001",
  });

  await new Promise((r) => setTimeout(r, 100));

  await pubsub.stop();
  await externalPublisher.disconnect();
}

/**
 * Example 4: Security Monitoring Service
 * Demonstrates complex event processing and alerting
 */
async function securityMonitoringExample() {
  console.log("\n" + "=".repeat(60));
  console.log("EXAMPLE 4: Security Monitoring Service");
  console.log("=".repeat(60));

  const transport = new MemoryTransport();

  // Track failed login attempts per IP
  const failedAttempts = new Map<string, number>();

  // Track processed message IDs for idempotency (in production, use Redis or a database)
  const processedMessages = new Set<string>();

  // Create subscriber with idempotency and rate limiting middleware
  // This is particularly important for security monitoring to:
  // - Avoid processing duplicate events (idempotency)
  // - Prevent event flooding during attacks (rate limiting)
  const subscriber = new Subscriber({
    events: AuthEvents,
    transport,
    onError: createErrorHandler(),
    middleware: [
      // Ensure each message is only processed once (important for accurate counts)
      createIdempotencyMiddleware({
        hasProcessed: (messageId) => processedMessages.has(messageId),
        markProcessed: (messageId) => { processedMessages.add(messageId); },
      }),
      // Rate limit to prevent event flooding during attacks (max 100 events/second)
      createRateLimitMiddleware({
        maxEvents: 100,
        windowMs: 1000,
        onLimit: (eventName, _payload) => {
          console.warn(`[Security Monitor] Rate limit exceeded for ${eventName} - event dropped`);
        },
      }),
      // Log all security events
      createSubscriberLoggingMiddleware(),
    ],
  });

  subscriber.on("auth.login_failed", (payload, { publisher }) => {
    const currentAttempts = (failedAttempts.get(payload.ipAddress) || 0) + 1;
    failedAttempts.set(payload.ipAddress, currentAttempts);

    console.log(`\n[Security Monitor] Failed login from ${payload.ipAddress}`);
    console.log(`  Attempt ${currentAttempts} for ${payload.email}`);
    console.log(`  Reason: ${payload.reason}`);

    // Alert on suspicious activity
    if (currentAttempts >= 5) {
      console.log(`  🚨 ALERT: Potential brute force attack detected!`);
      // In production: publish to security.suspicious_activity, block IP, etc.
    }
  });

  subscriber.on("auth.login", (payload) => {
    // Reset counter on successful login
    if (failedAttempts.has(payload.ipAddress)) {
      console.log(`\n[Security Monitor] Successful login from ${payload.ipAddress}, resetting counter`);
      failedAttempts.delete(payload.ipAddress);
    }

    // Log security-relevant info
    if (payload.metadata.mfaUsed) {
      console.log(`  ✓ MFA was used`);
    }
  });

  await subscriber.subscribe();

  // Simulate attack scenario
  console.log("\n--- Simulating brute force attack ---");
  const publisher = new Publisher({ events: AuthEvents, transport });

  // Multiple failed attempts
  for (let i = 1; i <= 6; i++) {
    await publisher.publish("auth.login_failed", {
      email: "victim@example.com",
      ipAddress: "192.168.1.100",
      timestamp: new Date().toISOString(),
      reason: "invalid_credentials",
      attemptCount: i,
    });
    await new Promise((r) => setTimeout(r, 10));
  }

  // Successful login from same IP
  await publisher.publish("auth.login", {
    userId: "550e8400-e29b-41d4-a716-446655440000",
    email: "victim@example.com",
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0",
    timestamp: new Date().toISOString(),
    metadata: { mfaUsed: true },
  });

  await new Promise((r) => setTimeout(r, 100));

  await subscriber.unsubscribe();
  await publisher.disconnect();
}

/**
 * Example 5: Validation and Error Handling
 * Demonstrates schema validation and error recovery
 */
async function validationExample() {
  console.log("\n" + "=".repeat(60));
  console.log("EXAMPLE 5: Validation and Error Handling");
  console.log("=".repeat(60));

  const transport = new MemoryTransport();
  const publisher = new Publisher({
    events: UserLifecycleEvents,
    transport,
  });

  console.log("\n--- Testing validation ---");

  // Valid event
  try {
    await publisher.publish("user.created", {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "valid@example.com",
      name: "John Doe",
      createdAt: new Date().toISOString(),
      source: "web",
      metadata: {},
    });
    console.log("✓ Valid event accepted");
  } catch (error) {
    console.error("✗ Unexpected error:", error);
  }

  // Invalid email
  try {
    await publisher.publish("user.created", {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "not-an-email",
      name: "John Doe",
      createdAt: new Date().toISOString(),
      source: "web",
      metadata: {},
    });
    console.error("✗ Invalid email should have been rejected");
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`✓ Invalid email rejected: ${error.message}`);
    }
  }

  // Empty name
  try {
    await publisher.publish("user.created", {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "valid@example.com",
      name: "",
      createdAt: new Date().toISOString(),
      source: "web",
      metadata: {},
    });
    console.error("✗ Empty name should have been rejected");
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`✓ Empty name rejected: ${error.message}`);
    }
  }

  // Invalid UUID
  try {
    await publisher.publish("user.created", {
      userId: "not-a-uuid",
      email: "valid@example.com",
      name: "John Doe",
      createdAt: new Date().toISOString(),
      source: "web",
      metadata: {},
    });
    console.error("✗ Invalid UUID should have been rejected");
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`✓ Invalid UUID rejected: ${error.message}`);
    }
  }

  await publisher.disconnect();
}

// =============================================================================
// SECTION 5: MAIN EXECUTION
// =============================================================================

async function main() {
  console.log("\n" + "█".repeat(60));
  console.log("  PRODUCTION-READY PUBSUB EXAMPLES");
  console.log("  @pubsubjs/core - Best Practices Demo");
  console.log("█".repeat(60));

  try {
    await authenticationServiceExample();
    await notificationServiceExample();
    await userServiceExample();
    await securityMonitoringExample();
    await validationExample();

    console.log("\n" + "=".repeat(60));
    console.log("ALL EXAMPLES COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));

    // Show DLQ contents
    const failedEvents = deadLetterQueue.getFailedEvents();
    if (failedEvents.length > 0) {
      console.log(`\nDead Letter Queue: ${failedEvents.length} events`);
    }
  } catch (error) {
    console.error("\nFatal error running examples:", error);
    process.exit(1);
  }
}

main();
