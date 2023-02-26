#  🕊️ PubSubJS - The Serverless AWS publish subscribe solution

![A drawing of white pigeon flying](https://i.imgur.com/lIqyWco.png)

## Introduction
This is a Javascript library written in Typescript that handles publish/subscribe event pattern, and uses Zod for data validation. This library is designed to be adaptable with different adapters such as AWS SNS, Kafka, React, etc., which makes it a versatile choice for various use cases in development.

## Installation

You can install this library using npm:
```
npm install @pubsubjs/core
npm install @pubsubjs/serverless-adapter
```


Here's an example of how you can use it with Serverless AWS SNS adapter:


### The Subscriber

By using the `@pubsubjs/core` library, this code is only using the core functions of the library and is not dependent on any specific message broker implementation. This means that if you want to use a different message broker during local development, you can simply update the implementation of generateSubscriber in the `@pubsubjs/core` library without needing to modify this code.

Overall, this code is a simple example of how to use the `@pubsubjs/core` library to create a subscriber application and subscribe to a specific event.

```typescript
import {generateSubscriber} from "@pubsubjs/core";
import events from "./events";

const subscriberApp = generateSubscriber(events);
subscriberApp.onUserRegistered((data) => {
    console.log('New user registered: '+data.email);
    console.log(data);
});

export default subscriberApp;
```

### Publisher
```typescript
import {generatePublishers} from "@pubsubjs/core";
import {serverlessPublisherFunction} from "@pubsubjs/serverless-adapter";
import AWS from "aws-sdk";
import events from "./events";
const sns = new AWS.SNS();


const publisher = generatePublishers(events, serverlessPublisherFunction({
    sns,
    accountId: process.env.ACCOUNT_ID ?? '',
    region: process.env.REGION ?? '',
}));

const registerUser = () => {
    // Logic to register user

    publisher.publishUserRegistered({
        fullName: 'John Doe',
        email: 'johndoe@gmail.com'
    });
}
```
### Exporting the Adapter

The adapter is the glue between the subscriber and AWS. It is responsible for subscribing to the events and creating them as resources on AWS. In this example, we are using the `@pubsubjs/serverless-adapter` library to create the adapter.

The `pubSubJSServerlessAdapter` function takes in the events and the subscriber application and returns an object with the following properties:

- `getSubscribedEvents` - Returns an array of events that the subscriber is subscribed to.
- `getResources` - Returns an object containing the resources that need to be created on AWS.
- `getOutputFile` - Returns an object containing the outputs that need to be created on AWS.
- `handler` - The handler function that is used by the AWS Lambda function.

```typescript
import events from "./events";
import subscriberApp from "./handler";
import {pubSubJSServerlessAdapter} from "@pubsubjs/serverless-adapter";

const adapter = pubSubJSServerlessAdapter(events, subscriberApp);

export = adapter;
```
### Serverless.yml

In the serverless.yml file, we are using the `getSubscribedEvents` and `getResources` functions to create the resources on AWS. We are also using the `getOutputFile` function to create the outputs on AWS. We are also using the `handler` function to create the handler for the AWS Lambda function.

```yaml
service: serverless-example

provider:
  name: aws
  runtime: nodejs12.x
  region: eu-west-1
  memorySize: 128
  iamRoleStatements:
    - Effect: Allow
      Action: SNS:Publish
      Resource:
        - arn:aws:sns:${self:provider.region}:${aws:accountId}:*
    - Effect: Allow
      Action:
        - sns:*
      Resource: "*"
  environment:
    ACCOUNT_ID: ${aws:accountId}
    REGION: ${self:provider.region}

functions:
  ...
  sub:
    handler: dist/pubsub.handler
    events: ${file(./dist/pubsub.js):getSubscribedEvents}


resources:
  Resources: ${file(./dist/pubsub.js):getResources}
  Outputs: ${file(./dist/pubsub.js):getOutputFile}

```
