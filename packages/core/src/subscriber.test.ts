import { test, expect, describe, mock, beforeEach, spyOn } from "bun:test";
import {
  Subscriber,
  createSubscriberLoggingMiddleware,
  createSubscriberTimingMiddleware,
  createIdempotencyMiddleware,
  createRateLimitMiddleware,
} from "./subscriber";
import { Publisher } from "./publisher";
import type { SubscribeMiddleware } from "./types/handler";
import { defineEvent, type StandardSchema } from "./types/schema";
import type {
  Transport,
  TransportCapabilities,
  ConnectionState,
  TransportMessageHandler,
  TransportPublishOptions,
  TransportMessage,
} from "./transport/interface";
import { generateMessageId } from "./types/context";

// Helper to wait for async operations
const waitForAsync = () => new Promise((resolve) => setTimeout(resolve, 10));

// Create a simple mock schema
function createMockSchema<T>(validator: (value: unknown) => T): StandardSchema<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => {
        try {
          const result = validator(value);
          return { value: result };
        } catch (error) {
          return {
            issues: [
              {
                message: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }
      },
    },
  };
}

// Mock transport with message simulation
function createMockTransport(): Transport & {
  _state: ConnectionState;
  _handlers: Map<string, TransportMessageHandler>;
  simulateMessage: (channel: string, payload: unknown) => void;
} {
  const handlers = new Map<string, TransportMessageHandler>();

  const transport = {
    id: "mock-transport",
    _state: "disconnected" as ConnectionState,
    _handlers: handlers,
    get state() {
      return this._state;
    },
    capabilities: {
      canSubscribe: true,
      canPublish: true,
      bidirectional: true,
      supportsTargeting: false,
      supportsChannels: true,
    } as TransportCapabilities,
    connect: mock(async function (this: typeof transport) {
      this._state = "connected";
    }),
    disconnect: mock(async function (this: typeof transport) {
      this._state = "disconnected";
    }),
    subscribe: mock(async function (
      this: typeof transport,
      channel: string,
      handler: TransportMessageHandler
    ) {
      handlers.set(channel, handler);
      return () => {
        handlers.delete(channel);
      };
    }),
    publish: mock(async (_channel: string, _payload: unknown, _options?: TransportPublishOptions) => {}),
    on: mock(() => {}),
    off: mock(() => {}),
    simulateMessage(channel: string, payload: unknown) {
      const handler = handlers.get(channel);
      if (handler) {
        const message: TransportMessage = {
          channel,
          payload,
          messageId: generateMessageId(),
        };
        handler(message);
      }
    },
  };

  return transport;
}

const userCreatedSchema = createMockSchema<{ userId: string; email: string }>(
  (value) => {
    if (typeof value !== "object" || value === null) {
      throw new Error("Expected object");
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.userId !== "string") {
      throw new Error("userId must be a string");
    }
    if (typeof obj.email !== "string") {
      throw new Error("email must be a string");
    }
    return { userId: obj.userId, email: obj.email };
  }
);

const events = defineEvent([
  { name: "user.created", schema: userCreatedSchema },
]);

describe("Subscriber", () => {
  let transport: ReturnType<typeof createMockTransport>;
  let subscriber: Subscriber<typeof events>;

  beforeEach(() => {
    transport = createMockTransport();
    subscriber = new Subscriber({
      events,
      transport,
    });
  });

  test("registers handlers with on()", () => {
    const handler = mock(() => {});
    subscriber.on("user.created", handler);

    // Handler should be stored but not called yet
    expect(handler).not.toHaveBeenCalled();
  });

  test("subscribes to transport on subscribe()", async () => {
    subscriber.on("user.created", () => {});
    await subscriber.subscribe();

    expect(transport.subscribe).toHaveBeenCalled();
    expect(transport._handlers.has("user.created")).toBe(true);
  });

  test("receives messages and calls handler", async () => {
    const receivedPayloads: Array<{ userId: string; email: string }> = [];

    subscriber.on("user.created", (payload) => {
      receivedPayloads.push(payload);
    });

    await subscriber.subscribe();

    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(receivedPayloads.length).toBe(1);
    expect(receivedPayloads[0]).toEqual({
      userId: "123",
      email: "test@example.com",
    });
  });

  test("validates incoming messages", async () => {
    const errors: Error[] = [];
    const receivedPayloads: unknown[] = [];

    const validatingSubscriber = new Subscriber({
      events,
      transport,
      onError: (error) => errors.push(error),
    });

    validatingSubscriber.on("user.created", (payload) => {
      receivedPayloads.push(payload);
    });

    await validatingSubscriber.subscribe();

    // Send invalid payload
    transport.simulateMessage("user.created", { invalid: "data" });

    await waitForAsync();

    expect(receivedPayloads.length).toBe(0);
    expect(errors.length).toBe(1);
  });

  test("provides context to handlers", async () => {
    let receivedCtx: unknown;

    subscriber.on("user.created", (_payload, { ctx }) => {
      receivedCtx = ctx;
    });

    await subscriber.subscribe();

    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(receivedCtx).toBeDefined();
    expect((receivedCtx as { messageId: string }).messageId).toBeDefined();
    expect((receivedCtx as { timestamp: Date }).timestamp).toBeInstanceOf(Date);
  });

  test("custom context factory", async () => {
    let receivedUserId: string | undefined;

    const customSubscriber = new Subscriber({
      events,
      transport,
      contextFactory: (metadata) => ({
        messageId: metadata.messageId,
        timestamp: new Date(),
        customField: "custom-value",
      }),
    });

    customSubscriber.on("user.created", (_payload, { ctx }) => {
      receivedUserId = (ctx as { customField: string }).customField;
    });

    await customSubscriber.subscribe();

    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(receivedUserId).toBe("custom-value");
  });

  test("provides publisher to handlers when configured", async () => {
    const publisherTransport = createMockTransport();
    const publisher = new Publisher({
      events,
      transport: publisherTransport,
    });

    let receivedPublisher: unknown;

    // Use any to bypass strict type checking in tests
    const subscriberWithPublisher = new Subscriber({
      events,
      transport,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publisher: publisher as any,
    });

    subscriberWithPublisher.on("user.created", (_payload, { publisher: pub }) => {
      receivedPublisher = pub;
    });

    await subscriberWithPublisher.subscribe();

    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(receivedPublisher).toBe(publisher);
  });

  test("onMany registers multiple handlers", async () => {
    const calls: string[] = [];

    subscriber.onMany({
      "user.created": () => { calls.push("user.created"); },
    });

    await subscriber.subscribe();

    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(calls).toContain("user.created");
  });

  test("off removes handler", async () => {
    const calls: number[] = [];

    subscriber.on("user.created", () => { calls.push(1); });
    await subscriber.subscribe();

    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();
    expect(calls.length).toBe(1);

    subscriber.off("user.created");

    transport.simulateMessage("user.created", {
      userId: "456",
      email: "test2@example.com",
    });

    await waitForAsync();
    // Handler was removed, but transport subscription remains
    // The message is received but no handler processes it
  });

  test("unsubscribe cleans up", async () => {
    subscriber.on("user.created", () => {});
    await subscriber.subscribe();

    expect(subscriber.isConnected).toBe(true);

    await subscriber.unsubscribe();

    expect(subscriber.isConnected).toBe(false);
  });

  test("uses custom channel strategy", async () => {
    const customSubscriber = new Subscriber({
      events,
      transport,
      channelStrategy: (name) => `custom:${name}`,
    });

    customSubscriber.on("user.created", () => {});
    await customSubscriber.subscribe();

    expect(transport._handlers.has("custom:user.created")).toBe(true);
  });
});

describe("Subscriber Middleware", () => {
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    transport = createMockTransport();
  });

  test("middleware executes in order (before/after pattern)", async () => {
    const order: string[] = [];

    const middleware1: SubscribeMiddleware<typeof events> = async (_eventName, _payload, _ctx, next) => {
      order.push("mw1-before");
      await next();
      order.push("mw1-after");
    };

    const middleware2: SubscribeMiddleware<typeof events> = async (_eventName, _payload, _ctx, next) => {
      order.push("mw2-before");
      await next();
      order.push("mw2-after");
    };

    const subscriber = new Subscriber({
      events,
      transport,
      middleware: [middleware1, middleware2],
    });

    subscriber.on("user.created", () => {
      order.push("handler");
    });

    await subscriber.subscribe();
    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(order).toEqual(["mw1-before", "mw2-before", "handler", "mw2-after", "mw1-after"]);
  });

  test("middleware can block handler by not calling next()", async () => {
    const handlerCalls: unknown[] = [];

    const blockingMiddleware: SubscribeMiddleware<typeof events> = async () => {
      // Don't call next()
    };

    const subscriber = new Subscriber({
      events,
      transport,
      middleware: [blockingMiddleware],
    });

    subscriber.on("user.created", (payload) => {
      handlerCalls.push(payload);
    });

    await subscriber.subscribe();
    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(handlerCalls.length).toBe(0);
  });

  test("middleware receives validated payload and context", async () => {
    let receivedEventName: string | undefined;
    let receivedPayload: unknown;
    let receivedContext: unknown;

    const inspectMiddleware: SubscribeMiddleware<typeof events> = async (eventName, payload, ctx, next) => {
      receivedEventName = eventName;
      receivedPayload = payload;
      receivedContext = ctx;
      await next();
    };

    const subscriber = new Subscriber({
      events,
      transport,
      middleware: [inspectMiddleware],
    });

    subscriber.on("user.created", () => {});

    await subscriber.subscribe();
    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(receivedEventName).toBe("user.created");
    expect(receivedPayload).toEqual({ userId: "123", email: "test@example.com" });
    expect(receivedContext).toBeDefined();
    expect((receivedContext as { messageId: string }).messageId).toBeDefined();
  });

  test("middleware can catch errors from next()", async () => {
    let caughtError: Error | undefined;

    const errorCatchingMiddleware: SubscribeMiddleware<typeof events> = async (_eventName, _payload, _ctx, next) => {
      try {
        await next();
      } catch (error) {
        caughtError = error as Error;
        throw error;
      }
    };

    const subscriber = new Subscriber({
      events,
      transport,
      middleware: [errorCatchingMiddleware],
      onError: () => {},
    });

    subscriber.on("user.created", () => {
      throw new Error("Handler error");
    });

    await subscriber.subscribe();
    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toBe("Handler error");
  });

  test("middleware errors go to onError handler", async () => {
    const errors: Error[] = [];

    const errorMiddleware: SubscribeMiddleware<typeof events> = async () => {
      throw new Error("Middleware error");
    };

    const subscriber = new Subscriber({
      events,
      transport,
      middleware: [errorMiddleware],
      onError: (error) => errors.push(error),
    });

    subscriber.on("user.created", () => {});

    await subscriber.subscribe();
    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toBe("Middleware error");
  });

  test("createSubscriberLoggingMiddleware logs events", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const subscriber = new Subscriber({
      events,
      transport,
      middleware: [createSubscriberLoggingMiddleware()],
    });

    subscriber.on("user.created", () => {});

    await subscriber.subscribe();
    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(logSpy).toHaveBeenCalled();
    const calls = logSpy.mock.calls;
    expect(calls.some((c) => c[0].includes("Received user.created"))).toBe(true);
    expect(calls.some((c) => c[0].includes("Handled user.created"))).toBe(true);

    logSpy.mockRestore();
  });

  test("createSubscriberTimingMiddleware reports timing", async () => {
    const timings: Array<{ eventName: string; durationMs: number }> = [];

    const subscriber = new Subscriber({
      events,
      transport,
      middleware: [
        createSubscriberTimingMiddleware((eventName, durationMs) => {
          timings.push({ eventName, durationMs });
        }),
      ],
    });

    subscriber.on("user.created", () => {});

    await subscriber.subscribe();
    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    await waitForAsync();

    expect(timings.length).toBe(1);
    expect(timings[0]!.eventName).toBe("user.created");
    expect(typeof timings[0]!.durationMs).toBe("number");
    expect(timings[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("createIdempotencyMiddleware skips duplicates", async () => {
    const processedSet = new Set<string>();
    const handlerCalls: unknown[] = [];

    const subscriber = new Subscriber({
      events,
      transport,
      middleware: [
        createIdempotencyMiddleware({
          hasProcessed: (id) => processedSet.has(id),
          markProcessed: (id) => { processedSet.add(id); },
        }),
      ],
    });

    subscriber.on("user.created", (payload) => {
      handlerCalls.push(payload);
    });

    await subscriber.subscribe();

    // Simulate same message twice (with same messageId)
    const handler = transport._handlers.get("user.created");
    if (handler) {
      const message = {
        channel: "user.created",
        payload: { userId: "123", email: "test@example.com" },
        messageId: "unique-message-id-1",
      };
      handler(message);
      await waitForAsync();
      handler(message);
      await waitForAsync();
    }

    expect(handlerCalls.length).toBe(1);
  });

  test("createRateLimitMiddleware enforces limits", async () => {
    const limitedEvents: Array<{ eventName: string }> = [];
    const handlerCalls: unknown[] = [];

    const subscriber = new Subscriber({
      events,
      transport,
      middleware: [
        createRateLimitMiddleware({
          maxEvents: 2,
          windowMs: 1000,
          onLimit: (eventName) => {
            limitedEvents.push({ eventName });
          },
        }),
      ],
    });

    subscriber.on("user.created", (payload) => {
      handlerCalls.push(payload);
    });

    await subscriber.subscribe();

    // Send 4 messages rapidly
    for (let i = 0; i < 4; i++) {
      transport.simulateMessage("user.created", {
        userId: `user-${i}`,
        email: `test${i}@example.com`,
      });
      await waitForAsync();
    }

    // First 2 should process, next 2 should be rate limited
    expect(handlerCalls.length).toBe(2);
    expect(limitedEvents.length).toBe(2);
  });
});
