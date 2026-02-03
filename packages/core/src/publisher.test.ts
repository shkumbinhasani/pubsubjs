import { test, expect, describe, mock, beforeEach } from "bun:test";
import { Publisher, createLoggingMiddleware } from "./publisher";
import { defineEvent, type StandardSchema } from "./types/schema";
import type {
  Transport,
  TransportCapabilities,
  ConnectionState,
  TransportMessageHandler,
  TransportPublishOptions,
} from "./transport/interface";

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

// Mock transport
function createMockTransport(): Transport & {
  publishedMessages: Array<{
    channel: string;
    payload: unknown;
    options?: TransportPublishOptions;
  }>;
  _state: ConnectionState;
} {
  const transport = {
    id: "mock-transport",
    _state: "disconnected" as ConnectionState,
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
    publishedMessages: [] as Array<{
      channel: string;
      payload: unknown;
      options?: TransportPublishOptions;
    }>,
    connect: mock(async function (this: typeof transport) {
      this._state = "connected";
    }),
    disconnect: mock(async function (this: typeof transport) {
      this._state = "disconnected";
    }),
    subscribe: mock(async (_channel: string, _handler: TransportMessageHandler) => {
      return () => {};
    }),
    publish: mock(async function (
      this: typeof transport,
      channel: string,
      payload: unknown,
      options?: TransportPublishOptions
    ) {
      this.publishedMessages.push({ channel, payload, options });
    }),
    on: mock(() => {}),
    off: mock(() => {}),
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

describe("Publisher", () => {
  let transport: ReturnType<typeof createMockTransport>;
  let publisher: Publisher<typeof events>;

  beforeEach(() => {
    transport = createMockTransport();
    publisher = new Publisher({
      events,
      transport,
    });
  });

  test("publishes event with valid payload", async () => {
    await publisher.publish("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    expect(transport.publishedMessages.length).toBe(1);
    expect(transport.publishedMessages[0]?.channel).toBe("user.created");
    expect(transport.publishedMessages[0]?.payload).toEqual({
      userId: "123",
      email: "test@example.com",
    });
  });

  test("connects lazily on first publish", async () => {
    expect(transport.state).toBe("disconnected");

    await publisher.publish("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    expect(transport.state).toBe("connected");
    expect(transport.connect).toHaveBeenCalled();
  });

  test("rejects invalid payload", async () => {
    await expect(
      publisher.publish("user.created", { invalid: "data" } as never)
    ).rejects.toThrow();
  });

  test("skips validation when configured", async () => {
    const noValidationPublisher = new Publisher({
      events,
      transport,
      skipValidation: true,
    });

    // This would normally fail validation
    await noValidationPublisher.publish("user.created", {
      userId: 123,
      email: null,
    } as never);

    expect(transport.publishedMessages.length).toBe(1);
  });

  test("uses custom channel strategy", async () => {
    const customPublisher = new Publisher({
      events,
      transport,
      channelStrategy: (name) => `custom:${name}`,
    });

    await customPublisher.publish("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    expect(transport.publishedMessages[0]?.channel).toBe("custom:user.created");
  });

  test("allows channel override in options", async () => {
    await publisher.publish(
      "user.created",
      { userId: "123", email: "test@example.com" },
      { channel: "override-channel" }
    );

    expect(transport.publishedMessages[0]?.channel).toBe("override-channel");
  });

  test("executes middleware", async () => {
    const middlewareCalls: string[] = [];

    const middlewarePublisher = new Publisher({
      events,
      transport,
      middleware: [
        async (eventName, _payload, _options, next) => {
          middlewareCalls.push(`before:${eventName}`);
          await next();
          middlewareCalls.push(`after:${eventName}`);
        },
      ],
    });

    await middlewarePublisher.publish("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    expect(middlewareCalls).toEqual(["before:user.created", "after:user.created"]);
  });

  test("middleware can intercept and prevent publish", async () => {
    const blockingPublisher = new Publisher({
      events,
      transport,
      middleware: [
        async (_eventName, _payload, _options, _next) => {
          // Don't call next() - blocks the publish
        },
      ],
    });

    await blockingPublisher.publish("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    expect(transport.publishedMessages.length).toBe(0);
  });

  test("provides state and isConnected getters", async () => {
    expect(publisher.state).toBe("disconnected");
    expect(publisher.isConnected).toBe(false);

    await publisher.connect();

    expect(publisher.state).toBe("connected");
    expect(publisher.isConnected).toBe(true);
  });

  test("disconnect works", async () => {
    await publisher.connect();
    expect(publisher.isConnected).toBe(true);

    await publisher.disconnect();
    expect(publisher.isConnected).toBe(false);
  });
});

describe("createLoggingMiddleware", () => {
  test("logs publish events", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));

    const transport = createMockTransport();
    const publisher = new Publisher({
      events,
      transport,
      middleware: [createLoggingMiddleware()],
    });

    await publisher.publish("user.created", {
      userId: "123",
      email: "test@example.com",
    });

    console.log = originalLog;

    expect(logs.some((log) => log.includes("Publishing user.created"))).toBe(true);
    expect(logs.some((log) => log.includes("Published user.created"))).toBe(true);
  });
});
