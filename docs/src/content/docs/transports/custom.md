---
title: Custom Transports
description: Build your own transport for PubSubJS
---

Create custom transports to integrate PubSubJS with any messaging system.

## Transport Interface

All transports must implement the `Transport` interface:

```typescript
import type {
  Transport,
  TransportCapabilities,
  TransportMessage,
  TransportMessageHandler,
  TransportPublishOptions,
  TransportEvent,
  TransportEventHandler,
  ConnectionState,
  UnsubscribeFn,
} from "@pubsubjs/core";

class MyTransport implements Transport {
  readonly id: string;
  readonly capabilities: TransportCapabilities;

  get state(): ConnectionState {
    // Return current connection state
  }

  async connect(): Promise<void> {
    // Establish connection
  }

  async disconnect(): Promise<void> {
    // Close connection
  }

  async publish(
    channel: string,
    payload: unknown,
    options?: TransportPublishOptions
  ): Promise<void> {
    // Send message to channel
  }

  async subscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn> {
    // Subscribe to channel, return unsubscribe function
  }

  on(event: TransportEvent, handler: TransportEventHandler): void {
    // Register event listener
  }

  off(event: TransportEvent, handler: TransportEventHandler): void {
    // Remove event listener
  }
}
```

## Using BaseTransport

Extend `BaseTransport` for common functionality:

```typescript
import { BaseTransport, generateTransportId } from "@pubsubjs/core";

class MyTransport extends BaseTransport {
  constructor() {
    super({
      canPublish: true,
      canSubscribe: true,
      bidirectional: true,
      supportsTargeting: false,
      supportsChannels: true,
    });
  }

  async connect(): Promise<void> {
    this.setState("connecting");
    // ... connection logic
    this.setState("connected");
    this.emit("connected");
  }

  async disconnect(): Promise<void> {
    // ... disconnection logic
    this.setState("disconnected");
    this.emit("disconnected");
  }

  async publish(
    channel: string,
    payload: unknown,
    options?: TransportPublishOptions
  ): Promise<void> {
    // ... publish logic
  }

  async subscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn> {
    // ... subscribe logic
    return () => {
      // ... unsubscribe logic
    };
  }
}
```

## Example: In-Memory Transport

A simple transport for testing:

```typescript
import { BaseTransport } from "@pubsubjs/core";
import type { TransportMessageHandler, TransportPublishOptions, UnsubscribeFn } from "@pubsubjs/core";

export class MemoryTransport extends BaseTransport {
  private handlers = new Map<string, Set<TransportMessageHandler>>();

  constructor() {
    super({
      canPublish: true,
      canSubscribe: true,
      bidirectional: true,
      supportsTargeting: false,
      supportsChannels: true,
    });
  }

  async connect(): Promise<void> {
    this.setState("connected");
    this.emit("connected");
  }

  async disconnect(): Promise<void> {
    this.handlers.clear();
    this.setState("disconnected");
    this.emit("disconnected");
  }

  async publish(
    channel: string,
    payload: unknown,
    options?: TransportPublishOptions
  ): Promise<void> {
    const handlers = this.handlers.get(channel);
    if (!handlers) return;

    const message = {
      channel,
      payload,
      messageId: crypto.randomUUID(),
      metadata: options?.metadata,
    };

    for (const handler of handlers) {
      handler(message);
    }
  }

  async subscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn> {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);

    return () => {
      this.handlers.get(channel)?.delete(handler);
    };
  }
}
```

## Example: MQTT Transport

Integrate with MQTT brokers:

```typescript
import mqtt from "mqtt";
import { BaseTransport, generateTransportId } from "@pubsubjs/core";

export class MQTTTransport extends BaseTransport {
  private client: mqtt.MqttClient | null = null;
  private handlers = new Map<string, Set<TransportMessageHandler>>();

  constructor(private readonly url: string) {
    super({
      canPublish: true,
      canSubscribe: true,
      bidirectional: true,
      supportsTargeting: false,
      supportsChannels: true,
    });
  }

  async connect(): Promise<void> {
    this.setState("connecting");

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.url);

      this.client.on("connect", () => {
        this.setState("connected");
        this.emit("connected");
        resolve();
      });

      this.client.on("error", (error) => {
        this.emit("error", error);
        reject(error);
      });

      this.client.on("message", (topic, message) => {
        const handlers = this.handlers.get(topic);
        if (!handlers) return;

        const payload = JSON.parse(message.toString());
        const msg = {
          channel: topic,
          payload,
          messageId: generateTransportId(),
        };

        for (const handler of handlers) {
          handler(msg);
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.client?.end(false, () => {
        this.setState("disconnected");
        this.emit("disconnected");
        resolve();
      });
    });
  }

  async publish(
    channel: string,
    payload: unknown,
    options?: TransportPublishOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client?.publish(
        channel,
        JSON.stringify(payload),
        { qos: 1 },
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
    });
  }

  async subscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn> {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      await new Promise<void>((resolve, reject) => {
        this.client?.subscribe(channel, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    this.handlers.get(channel)!.add(handler);

    return () => {
      this.handlers.get(channel)?.delete(handler);
      if (this.handlers.get(channel)?.size === 0) {
        this.handlers.delete(channel);
        this.client?.unsubscribe(channel);
      }
    };
  }
}
```

## Example: Kafka Transport

For high-throughput event streaming:

```typescript
import { Kafka, Producer, Consumer } from "kafkajs";
import { BaseTransport } from "@pubsubjs/core";

export class KafkaTransport extends BaseTransport {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private handlers = new Map<string, Set<TransportMessageHandler>>();

  constructor(private readonly config: { brokers: string[]; groupId: string }) {
    super({
      canPublish: true,
      canSubscribe: true,
      bidirectional: true,
      supportsTargeting: false,
      supportsChannels: true,
    });

    this.kafka = new Kafka({
      clientId: "pubsubjs",
      brokers: config.brokers,
    });
  }

  async connect(): Promise<void> {
    this.setState("connecting");

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: this.config.groupId });

    await this.producer.connect();
    await this.consumer.connect();

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const handlers = this.handlers.get(topic);
        if (!handlers) return;

        const payload = JSON.parse(message.value?.toString() || "null");
        const msg = {
          channel: topic,
          payload,
          messageId: message.key?.toString() || generateTransportId(),
        };

        for (const handler of handlers) {
          handler(msg);
        }
      },
    });

    this.setState("connected");
    this.emit("connected");
  }

  async disconnect(): Promise<void> {
    await this.producer?.disconnect();
    await this.consumer?.disconnect();
    this.setState("disconnected");
    this.emit("disconnected");
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    await this.producer?.send({
      topic: channel,
      messages: [{ value: JSON.stringify(payload) }],
    });
  }

  async subscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn> {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      await this.consumer?.subscribe({ topic: channel });
    }

    this.handlers.get(channel)!.add(handler);

    return () => {
      this.handlers.get(channel)?.delete(handler);
    };
  }
}
```

## Testing Custom Transports

```typescript
import { test, expect } from "bun:test";
import { Publisher, Subscriber, defineEvent } from "@pubsubjs/core";
import { z } from "zod";
import { MyTransport } from "./my-transport";

const events = defineEvent([
  { name: "test.event", schema: z.object({ message: z.string() }) },
]);

test("transport publishes and subscribes", async () => {
  const transport = new MyTransport();

  const publisher = new Publisher({ events, transport });
  const subscriber = new Subscriber({ events, transport });

  const received: unknown[] = [];
  subscriber.on("test.event", (payload) => {
    received.push(payload);
  });

  await subscriber.subscribe();
  await publisher.publish("test.event", { message: "hello" });

  // Wait for message delivery
  await new Promise((r) => setTimeout(r, 100));

  expect(received).toEqual([{ message: "hello" }]);
});
```

## Next Steps

- [Transport Overview](/transports/overview/) - Compare built-in transports
- [Middleware](/concepts/middleware/) - Add cross-cutting concerns
- [Testing](/advanced/testing/) - Test your implementation
