# PubSub React Example - Comprehensive Demo

A comprehensive React + PubSub demonstration showcasing real-time state management patterns, optimistic updates, notifications, user presence, and more.

## Features

### 1. Shopping Cart with Optimistic Updates
- Add/remove items with immediate UI feedback
- Quantity controls with validation
- Checkout flow with loading states
- Real-time cart total calculation

### 2. Notification System
- Toast notifications with auto-dismiss
- Multiple types: success, error, warning, info
- Smooth animations and transitions
- Queue management

### 3. User Presence
- Join/leave functionality
- Status management (available, busy, away)
- Real-time online users list
- Visual status indicators

### 4. Activity Feed
- Live activity stream
- Multiple activity types (cart, order, user, system)
- Relative timestamps
- Auto-scrolling with new items

### 5. Product Management
- Real-time price updates
- Stock level changes
- Out-of-stock handling
- Category filtering

### 6. Error Boundaries & Loading States
- React Error Boundary for crash recovery
- Loading spinners for async operations
- Graceful error handling

## Architecture Patterns

### Zustand-Style API
No Provider needed! Create PubSub instance at module scope:

```typescript
const transport = new MemoryTransport();

export const useAppEvents = createPubSub({
  events: AppEvents,
  transport,
});
```

### Shared Subscriptions
Multiple components subscribing to the same event share a single transport subscription (reference counted).

### Event-Driven State Management
```typescript
// Subscribe to events
useAppEvents.useSubscribe(
  "cart.itemAdded",
  (payload) => {
    setItems((prev) => [...prev, payload]);
  },
  []
);

// Publish events
const { publish } = useAppEvents.usePublish();
publish("cart.itemAdded", { productId: "1", name: "Widget", price: 9.99 });
```

### Optimistic Updates
```typescript
const handleAddToCart = async () => {
  // Immediately publish (optimistic)
  publish("cart.itemAdded", { productId, name, price });
  
  // Show loading state
  setIsAdding(true);
  
  // Simulate API
  await new Promise((resolve) => setTimeout(resolve, 300));
  
  setIsAdding(false);
  
  // Show success notification
  publish("notification.show", {
    id: `notif_${Date.now()}`,
    type: "success",
    title: "Added to Cart",
    message: `${name} has been added to your cart`,
  });
};
```

## Running the Example

```bash
# From the repo root
bun examples/react-example/server.ts

# Or from the example directory
cd examples/react-example
bun server.ts
```

Then open http://localhost:3003 in your browser.

## Project Structure

```
examples/react-example/
├── frontend.tsx      # Main React application
├── server.ts         # Bun.serve() server
├── index.html        # HTML entry point
├── styles.css        # Modern dark theme styles
├── package.json      # Dependencies
└── README.md         # This file
```

## Key Concepts

### 1. Event Definitions
All events are defined with Zod schemas for runtime validation:

```typescript
const AppEvents = defineEvent([
  {
    name: "cart.itemAdded",
    schema: z.object({
      productId: z.string(),
      name: z.string(),
      price: z.number().positive(),
      quantity: z.number().int().positive().default(1),
    }),
  },
  // ... more events
]);
```

### 2. Hook Patterns

#### useSubscribe
Subscribe to events with dependency tracking:
```typescript
useAppEvents.useSubscribe(
  "event.name",
  (payload) => { /* handler */ },
  [/* deps */]
);
```

#### usePublish
Get publish function:
```typescript
const { publish } = useAppEvents.usePublish();
```

### 3. State Synchronization
Components maintain local state that syncs with PubSub events:

```typescript
const [items, setItems] = useState<CartItem[]>([]);

useAppEvents.useSubscribe(
  "cart.itemAdded",
  (payload) => {
    setItems((prev) => [...prev, payload]);
  },
  []
);
```

### 4. Type Safety
Full TypeScript support with automatic type inference:

```typescript
// TypeScript knows the exact shape of payload
useAppEvents.useSubscribe("cart.itemAdded", (payload) => {
  // payload is typed as: { productId: string, name: string, price: number, quantity: number }
  console.log(payload.price); // ✓ Valid
  console.log(payload.invalid); // ✗ TypeScript error
});
```

## Best Practices Demonstrated

1. **Event Naming**: Use dot notation for namespacing (`cart.itemAdded`, `user.online`)
2. **Schema Validation**: Always define Zod schemas for runtime safety
3. **Dependency Arrays**: Properly manage React hook dependencies
4. **Cleanup**: Automatic cleanup on unmount via useEffect
5. **Error Handling**: Try-catch blocks and error boundaries
6. **Loading States**: Visual feedback for async operations
7. **Optimistic Updates**: Immediate UI updates with rollback capability

## Extending the Example

### Add New Events

1. Define the event schema in `AppEvents`
2. Create a component that publishes the event
3. Create components that subscribe to the event

### Use Different Transport

Replace `MemoryTransport` with other transports:
- `WindowTransport` - Cross-tab communication
- `WebSocketTransport` - Server communication
- `RedisTransport` - Distributed systems

### Add Persistence

Sync cart state with localStorage:

```typescript
useEffect(() => {
  const saved = localStorage.getItem('cart');
  if (saved) {
    const items = JSON.parse(saved);
    items.forEach(item => publish("cart.itemAdded", item));
  }
}, []);

useEffect(() => {
  localStorage.setItem('cart', JSON.stringify(items));
}, [items]);
```

## Learn More

- [PubSub Core Documentation](../../packages/core/README.md)
- [PubSub React Documentation](../../packages/react/README.md)
- [Zod Documentation](https://zod.dev)
- [React Documentation](https://react.dev)
