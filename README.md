#  🕊️ PubSubJS - The universal publish subscribe solution

![A drawing of white pigeon flying](https://i.imgur.com/lIqyWco.png)

## Introduction 
This is a Javascript library written in Typescript that handles publish/subscribe event pattern, and uses Zod for data validation. This library is designed to be adaptable with different adapters such as AWS SNS, Kafka, React, etc., which makes it a versatile choice for various use cases in development.

## Installation

You can install this library using npm:
```
npm install 
```

## Usage
This library provides a simple interface for working with publish/subscribe event pattern. Here's an example of how you can use it with AWS SNS adapter:

```typescript
import {z} from "zod"

//TODO
```

## Adapters
This library currently supports the following adapters:

1. [ ] AWS SNS
2. [ ] Kafka
3. [ ] React

Each adapter has its own set of options and methods, but they all provide the same interface for working with publish/subscribe event pattern.

To use an adapter, you simply need to import it and initialize it with the required options. Once the adapter is initialized, you can use its subscribe and publish methods to handle events.

## Data Validation
This library uses Zod for data validation. You can define the schema for your events using Zod, and the library will automatically validate the received events against the defined schema.

If an invalid event is received, the library will throw a ZodError with detailed information about the validation error.

## Contributing
Contributions to this library are welcome. If you would like to contribute, please fork this repository, make your changes, and submit a pull request.
