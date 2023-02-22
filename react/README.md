#  🕊️ PubSubJS - The React publish subscribe solution

![A drawing of white pigeon flying](https://i.imgur.com/lIqyWco.png)

## Introduction
This is a Javascript library written in Typescript that handles publish/subscribe event pattern, and uses Zod for data validation. This library is designed to be adaptable with different adapters such as AWS SNS, Kafka, React, etc., which makes it a versatile choice for various use cases in development.

## Installation

You can install this library using npm:
```
npm install @pubsubjs/core
npm install @pubsubjs/react
```

Here's an example of how you can use it with React adapter:

### The Subscriber

```typescript
import {EventType} from "@pubsubjs/core/types";
import {z} from "zod";
import generateHooks from "@pubsubjs/react";

const nextEvent = {
    name: "nextImage",
    schema: z.null().optional()
} as const satisfies EventType

const previousEvent = {
    name: "previousImage",
    schema: z.null().optional()
} as const satisfies EventType

export const PubSub = generateHooks([nextEvent, previousEvent]);
```

### Component A

```tsx
import {PubSub} from "./PubSub";

const Images = [
    "https://i.imgur.com/1.jpg",
    "https://i.imgur.com/2.jpg",
    "https://i.imgur.com/3.jpg",
    "https://i.imgur.com/4.jpg",
    "https://i.imgur.com/5.jpg",
]

const ComponentA = () => {
    const [image, setImage] = useState(0);
    
    PubSub.useNextImage(() => {
        setImage((image + 1) % Images.length);
    }, []);
    
    PubSub.usePreviousImage(() => {
        setImage((image - 1) % Images.length);
    }, []);
    
    return (
        <div>
            <img src={Images[image]} />
        </div>
    )
}
```

Component A is a simple image carousel. It uses the `useNextImage` and `usePreviousImage` hooks to subscribe to the `nextImage` and `previousImage` events, and it publishes the `nextImage` and `previousImage` events when the user clicks on the next and previous buttons.

### Component B

```tsx
import {PubSub} from "./PubSub";

const ComponentB = () => {
    return (
        <div>
            <button onClick={() => PubSub.publishNextImage()}>Next</button>
            <button onClick={() => PubSub.publishPreviousImage()}>Previous</button>
        </div>
    )
}
```

Component B is a simple button component. It uses the `publishNextImage` and `publishPreviousImage` methods to publish the `nextImage` and `previousImage` events when the user clicks on the next and previous buttons.

## Why use this library?

This library provides a simple interface for working with publish/subscribe event pattern. It also provides a React adapter that allows you to use the publish/subscribe event pattern in your React components.
Other than that, this library uses Zod for data validation. You can define the schema for your events using Zod, and the library will automatically validate the received events against the defined schema.

This eliminates the need to add a context provider to your application, and you can use the publish/subscribe event pattern in your components without having to worry about the boilerplate code. And the element that publishes the event doesn't have to be the same element that subscribes to the event so it will avoid re-rendering the component that publishes the event.
