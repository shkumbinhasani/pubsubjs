#  🕊️ PubSubJS - The universal publish subscribe solution

![A drawing of white pigeon flying](https://i.imgur.com/lIqyWco.png)

## Introduction 
This is a Javascript library written in Typescript that handles publish/subscribe event pattern, and uses Zod for data validation. This library is designed to be adaptable with different adapters such as AWS SNS, Kafka, React, etc., which makes it a versatile choice for various use cases in development.

## Installation

You can install this library using npm:
```
npm install @pubsubjs/core
```

## Core Usage
This library provides a simple interface for working with publish/subscribe event pattern.
```typescript
import {EventType, generatePublishers, generateSubscriber} from "@pubsubjs/core";
import {z} from "zod";

// define your events
const testEvent = {
    name: 'test',
    schema: z.object({
        message: z.string()
    })
} as const satisfies EventType;

const events = [testEvent];

// generate the publisher and subscriber
const subscriberApp = generateSubscriber(events);
const publisherApp = generatePublishers(events, (event, data) => {
    console.log(event, data);
});

// subscribe to an event
subscriberApp.onTest((data) => {
    console.log('New user registered: '+data.message);
    console.log(data);
});

// publish an event
publisherApp.publishTest({message: 'Hello world!'});
```

## Adapters
This library currently supports the following adapters:

1. [x] AWS SNS [docs](./serverless-adapter/README.md)
2. [ ] Kafka [docs](./kafka-adapter/README.md)
3. [x] React [docs](./react/README.md)

Each adapter has its own set of options and methods, but they all provide the same interface for working with publish/subscribe event pattern.

To use an adapter, you simply need to import it and initialize it with the required options. Once the adapter is initialized, you can use its subscribe and publish methods to handle events.

## Data Validation
This library uses Zod for data validation. You can define the schema for your events using Zod, and the library will automatically validate the received events against the defined schema.

If an invalid event is received, the library will throw a ZodError with detailed information about the validation error.

## Contributing
Contributions to this library are welcome. If you would like to contribute, please fork this repository, make your changes, and submit a pull request.
