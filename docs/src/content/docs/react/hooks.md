---
title: React Hooks
description: API reference for PubSubJS React hooks
---

## useSubscribe

Subscribe to events within React components.

### Signature

```typescript
function useSubscribe<TEventName extends EventNames<TEvents>>(
  eventName: TEventName,
  handler: (payload: EventPayload<TEvents, TEventName>) => void,
  deps: React.DependencyList,
  options?: { enabled?: boolean }
): void;
```

### Usage

```tsx
import { useSubscribe } from "./pubsub";

function MyComponent() {
  const [messages, setMessages] = useState([]);

  useSubscribe(
    "message.received",
    (payload) => {
      setMessages((prev) => [...prev, payload]);
    },
    []
  );

  return <div>{/* ... */}</div>;
}
```

### With Dependencies

Re-subscribe when dependencies change:

```tsx
function UserMessages({ userId }) {
  useSubscribe(
    "message.received",
    (payload) => {
      if (payload.userId === userId) {
        // Handle message for this user
      }
    },
    [userId]
  );
}
```

### Conditional Subscription

```tsx
function ConditionalSubscriber({ enabled }) {
  useSubscribe(
    "notification",
    (payload) => {
      console.log("Received:", payload);
    },
    [enabled],
    { enabled } // Only subscribe when enabled is true
  );
}
```

## usePublish

Get a publish function for sending events.

### Signature

```typescript
function usePublish(): {
  publish: <TEventName extends EventNames<TEvents>>(
    eventName: TEventName,
    payload: EventPayload<TEvents, TEventName>
  ) => Promise<void>;
};
```

### Usage

```tsx
import { usePublish } from "./pubsub";

function SendButton() {
  const { publish } = usePublish();

  const handleClick = async () => {
    await publish("button.clicked", {
      buttonId: "send",
      timestamp: Date.now(),
    });
  };

  return <button onClick={handleClick}>Send</button>;
}
```

### With Loading State

```tsx
function SendForm() {
  const { publish } = usePublish();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data) => {
    setLoading(true);
    try {
      await publish("form.submitted", data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <button disabled={loading}>
        {loading ? "Sending..." : "Submit"}
      </button>
    </form>
  );
}
```

## Creating Custom Hooks

Build custom hooks on top of PubSubJS hooks:

### useLatestEvent

```tsx
function useLatestEvent<T extends EventNames<Events>>(eventName: T) {
  const [latest, setLatest] = useState<EventPayload<Events, T> | null>(null);

  useSubscribe(
    eventName,
    (payload) => {
      setLatest(payload);
    },
    [eventName]
  );

  return latest;
}

// Usage
function PriceDisplay() {
  const price = useLatestEvent("price.updated");
  return <span>{price?.value ?? "Loading..."}</span>;
}
```

### useEventHistory

```tsx
function useEventHistory<T extends EventNames<Events>>(
  eventName: T,
  maxItems = 10
) {
  const [history, setHistory] = useState<EventPayload<Events, T>[]>([]);

  useSubscribe(
    eventName,
    (payload) => {
      setHistory((prev) => [...prev.slice(-(maxItems - 1)), payload]);
    },
    [eventName, maxItems]
  );

  return history;
}

// Usage
function ActivityFeed() {
  const activities = useEventHistory("activity.logged", 50);
  return (
    <ul>
      {activities.map((a, i) => (
        <li key={i}>{a.description}</li>
      ))}
    </ul>
  );
}
```

### useEventCallback

```tsx
function useEventCallback<T extends EventNames<Events>>(eventName: T) {
  const { publish } = usePublish();

  return useCallback(
    (payload: EventPayload<Events, T>) => {
      return publish(eventName, payload);
    },
    [publish, eventName]
  );
}

// Usage
function ChatInput() {
  const sendMessage = useEventCallback("chat.message");

  const handleSubmit = (text) => {
    sendMessage({ text, timestamp: Date.now() });
  };

  return <input onSubmit={handleSubmit} />;
}
```

## Next Steps

- [Examples](/react/examples/) - Real-world usage patterns
- [Setup](/react/setup/) - Configuration options
