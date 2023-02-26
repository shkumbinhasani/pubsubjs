#  🕊️ PubSubJS - The KafkaJS publish subscribe solution

![A drawing of white pigeon flying](https://i.imgur.com/lIqyWco.png)

## Introduction
This is a Javascript library written in Typescript that handles publish/subscribe event pattern, and uses Zod for data validation. This library is designed to be adaptable with different adapters such as AWS SNS, Kafka, React, etc., which makes it a versatile choice for various use cases in development.

## Installation

You can install this library using npm:
```
npm install @pubsubjs/core
npm install @pubsubjs/kafka-adapter
```

Here's an example of how you can use it with KafkaJS adapter:

### The Subscriber

```typescript
import {generateSubscriber} from "@pubsubjs/core";
import events from "./events";

const subscriber = generateSubscriber(events);

subscriber.onHmm((data) => {
    console.log(data.name);
});

export default subscriber;

```

### The Publisher

```typescript
import {Kafka} from "kafkajs";
import {generatePublishers} from "@pubsubjs/core";
import {kafkaPublisherFunction} from "@pubsubjs/kafka-adapter";
import events from "./index";

const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['127.0.0.1:9092'],
    logLevel: 0
})

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: 'test-group' });
export const publisher = generatePublishers(events, kafkaPublisherFunction(producer));
```

### The usage

```typescript
import {pubSubJSKafkaAdapter} from "@pubsubjs/kafka-adapter";
import {consumer, producer, publisher} from "./events/publisher";
import subscriber from "./pubSubApp";

pubSubJSKafkaAdapter(consumer, subscriber).then(() => console.log("Listening"));

(async () => {
    await consumer.connect()
    await producer.connect()

    await publisher.publishHmm({name: 'hmm'});
})()
```
