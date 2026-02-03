/**
 * Comprehensive React + PubSub Example
 *
 * This example demonstrates:
 * - Shopping cart with optimistic updates
 * - Real-time notifications system
 * - User presence tracking
 * - Live activity feed
 * - Error boundaries and loading states
 * - Multiple hook patterns (useSubscribe, usePublish, usePubSub)
 * - State synchronization patterns
 *
 * Note on Subscriber Middleware:
 * The @pubsubjs/core package provides subscriber middleware (createSubscriberLoggingMiddleware,
 * createIdempotencyMiddleware, createRateLimitMiddleware, etc.) for the Subscriber class.
 * These are designed for server-side or standalone subscription handling patterns.
 *
 * This React example uses @pubsubjs/react's createPubSub() which provides React hooks
 * (useSubscribe, usePublish) optimized for client-side use. For client-side React apps:
 * - Logging: Use React DevTools or browser console in development mode
 * - Idempotency: Typically handled by the server or via React state deduplication
 * - Rate limiting: Usually enforced server-side to prevent abuse
 *
 * If you need subscriber middleware in a React app, consider using the Subscriber class
 * from @pubsubjs/core directly for specific server-communication patterns, or implement
 * custom logic in your useSubscribe handlers.
 */

import React, { 
  useState, 
  useCallback, 
  useEffect, 
  useRef, 
  createContext, 
  useContext,
  Component,
  type ReactNode 
} from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";
import { createPubSub, MemoryTransport } from "@pubsubjs/react";

// ============================================
// 1. Event Definitions with Zod Schemas
// ============================================

const AppEvents = defineEvent([
  // Cart events
  {
    name: "cart.itemAdded",
    schema: z.object({
      productId: z.string(),
      name: z.string(),
      price: z.number().positive(),
      quantity: z.number().int().positive().default(1),
    }),
  },
  {
    name: "cart.itemRemoved",
    schema: z.object({
      productId: z.string(),
    }),
  },
  {
    name: "cart.quantityChanged",
    schema: z.object({
      productId: z.string(),
      quantity: z.number().int().nonnegative(),
    }),
  },
  {
    name: "cart.cleared",
    schema: z.object({}),
  },
  {
    name: "cart.checkoutStarted",
    schema: z.object({
      cartId: z.string(),
      total: z.number().positive(),
    }),
  },
  {
    name: "cart.checkoutCompleted",
    schema: z.object({
      cartId: z.string(),
      orderId: z.string(),
      total: z.number().positive(),
    }),
  },
  // Notification events
  {
    name: "notification.show",
    schema: z.object({
      id: z.string(),
      type: z.enum(["info", "success", "warning", "error"]),
      title: z.string(),
      message: z.string(),
      duration: z.number().int().nonnegative().default(5000),
    }),
  },
  {
    name: "notification.dismiss",
    schema: z.object({
      id: z.string(),
    }),
  },
  // User presence events
  {
    name: "user.online",
    schema: z.object({
      userId: z.string(),
      username: z.string(),
      avatar: z.string().optional(),
      status: z.enum(["available", "busy", "away"]).default("available"),
    }),
  },
  {
    name: "user.offline",
    schema: z.object({
      userId: z.string(),
    }),
  },
  {
    name: "user.statusChanged",
    schema: z.object({
      userId: z.string(),
      status: z.enum(["available", "busy", "away"]),
    }),
  },
  // Activity feed events
  {
    name: "activity.new",
    schema: z.object({
      id: z.string(),
      type: z.enum(["cart", "order", "user", "system"]),
      userId: z.string().optional(),
      username: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
      timestamp: z.number(),
    }),
  },
  // Real-time updates
  {
    name: "product.stockChanged",
    schema: z.object({
      productId: z.string(),
      stock: z.number().int().nonnegative(),
    }),
  },
  {
    name: "product.priceChanged",
    schema: z.object({
      productId: z.string(),
      oldPrice: z.number().positive(),
      newPrice: z.number().positive(),
    }),
  },
]);

// ============================================
// 2. PubSub Instance (Zustand-style, no Provider)
// ============================================

const transport = new MemoryTransport();

export const useAppEvents = createPubSub({
  events: AppEvents,
  transport,
});

// ============================================
// 3. Types
// ============================================

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  duration: number;
  createdAt: number;
}

interface OnlineUser {
  userId: string;
  username: string;
  avatar?: string;
  status: "available" | "busy" | "away";
  joinedAt: number;
}

interface Activity {
  id: string;
  type: "cart" | "order" | "user" | "system";
  userId?: string;
  username?: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  image?: string;
}

// ============================================
// 4. Error Boundary Component
// ============================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="error-boundary">
            <h2>Something went wrong</h2>
            <p>{this.state.error?.message}</p>
            <button onClick={() => this.setState({ hasError: false, error: null })}>
              Try again
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

// ============================================
// 5. Loading State Component
// ============================================

function LoadingSpinner({ size = "medium" }: { size?: "small" | "medium" | "large" }) {
  const sizeClass = `spinner-${size}`;
  return (
    <div className={`loading-spinner ${sizeClass}`}>
      <div className="spinner-ring"></div>
    </div>
  );
}

// ============================================
// 6. Notification System
// ============================================

function NotificationItem({ 
  notification, 
  onDismiss 
}: { 
  notification: Notification; 
  onDismiss: (id: string) => void;
}) {
  const { publish } = useAppEvents.usePublish();
  
  useEffect(() => {
    const timer = setTimeout(() => {
      publish("notification.dismiss", { id: notification.id });
    }, notification.duration);
    
    return () => clearTimeout(timer);
  }, [notification.id, notification.duration, publish]);

  const iconMap = {
    info: "ℹ️",
    success: "✅",
    warning: "⚠️",
    error: "❌",
  };

  return (
    <div className={`notification notification-${notification.type}`}>
      <span className="notification-icon">{iconMap[notification.type]}</span>
      <div className="notification-content">
        <div className="notification-title">{notification.title}</div>
        <div className="notification-message">{notification.message}</div>
      </div>
      <button 
        className="notification-close"
        onClick={() => publish("notification.dismiss", { id: notification.id })}
      >
        ×
      </button>
    </div>
  );
}

function NotificationContainer() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useAppEvents.useSubscribe(
    "notification.show",
    (payload) => {
      setNotifications((prev) => [
        ...prev,
        { ...payload, createdAt: Date.now() },
      ]);
    },
    []
  );

  useAppEvents.useSubscribe(
    "notification.dismiss",
    (payload) => {
      setNotifications((prev) => prev.filter((n) => n.id !== payload.id));
    },
    []
  );

  return (
    <div className="notification-container">
      {notifications.map((notification) => (
        <NotificationItem 
          key={notification.id} 
          notification={notification}
          onDismiss={() => {}}
        />
      ))}
    </div>
  );
}

// ============================================
// 7. User Presence Component
// ============================================

function UserPresence() {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [currentUser, setCurrentUser] = useState<OnlineUser | null>(null);
  const { publish } = useAppEvents.usePublish();

  // Subscribe to user presence events
  useAppEvents.useSubscribe(
    "user.online",
    (payload) => {
      setUsers((prev) => {
        if (prev.find((u) => u.userId === payload.userId)) return prev;
        return [...prev, { ...payload, joinedAt: Date.now() }];
      });
    },
    []
  );

  useAppEvents.useSubscribe(
    "user.offline",
    (payload) => {
      setUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
    },
    []
  );

  useAppEvents.useSubscribe(
    "user.statusChanged",
    (payload) => {
      setUsers((prev) =>
        prev.map((u) =>
          u.userId === payload.userId ? { ...u, status: payload.status } : u
        )
      );
    },
    []
  );

  // Join as current user
  const joinAsUser = useCallback((username: string) => {
    const userId = `user_${Date.now()}`;
    const user: OnlineUser = {
      userId,
      username,
      status: "available",
      joinedAt: Date.now(),
    };
    setCurrentUser(user);
    publish("user.online", {
      userId,
      username,
      status: "available",
    });
  }, [publish]);

  // Change status
  const changeStatus = useCallback((status: OnlineUser["status"]) => {
    if (currentUser) {
      publish("user.statusChanged", {
        userId: currentUser.userId,
        status,
      });
    }
  }, [currentUser, publish]);

  const statusColors = {
    available: "#28a745",
    busy: "#dc3545",
    away: "#ffc107",
  };

  return (
    <div className="user-presence card">
      <h3>User Presence</h3>
      
      {!currentUser ? (
        <div className="join-form">
          <input
            type="text"
            placeholder="Enter your username"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value) {
                joinAsUser(e.currentTarget.value);
              }
            }}
          />
          <button onClick={() => {
            const input = document.querySelector('.join-form input') as HTMLInputElement;
            if (input?.value) joinAsUser(input.value);
          }}>
            Join
          </button>
        </div>
      ) : (
        <div className="current-user">
          <div className="user-info">
            <span className="user-avatar-large">
              {currentUser.username.charAt(0).toUpperCase()}
            </span>
            <span className="username">{currentUser.username}</span>
            <span 
              className="status-indicator"
              style={{ backgroundColor: statusColors[currentUser.status] }}
            />
          </div>
          <div className="status-buttons">
            {(["available", "busy", "away"] as const).map((status) => (
              <button
                key={status}
                className={currentUser.status === status ? "active" : ""}
                onClick={() => changeStatus(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="online-users">
        <h4>Online Users ({users.length})</h4>
        <div className="users-list">
          {users.map((user) => (
            <div key={user.userId} className="user-item">
              <span className="user-avatar-small">
                {user.username.charAt(0).toUpperCase()}
              </span>
              <span className="username">{user.username}</span>
              <span 
                className="status-dot"
                style={{ backgroundColor: statusColors[user.status] }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// 8. Activity Feed Component
// ============================================

function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);

  useAppEvents.useSubscribe(
    "activity.new",
    (payload) => {
      setActivities((prev) => [payload, ...prev].slice(0, 50));
    },
    []
  );

  const iconMap = {
    cart: "🛒",
    order: "📦",
    user: "👤",
    system: "⚙️",
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 60) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="activity-feed card">
      <h3>Activity Feed</h3>
      <div className="activity-list">
        {activities.length === 0 ? (
          <p className="empty-state">No activity yet</p>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className={`activity-item activity-${activity.type}`}>
              <span className="activity-icon">{iconMap[activity.type]}</span>
              <div className="activity-content">
                <div className="activity-title">{activity.title}</div>
                {activity.description && (
                  <div className="activity-description">{activity.description}</div>
                )}
                <div className="activity-meta">
                  {activity.username && (
                    <span className="activity-user">@{activity.username}</span>
                  )}
                  <span className="activity-time">{formatTime(activity.timestamp)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================
// 9. Shopping Cart with Optimistic Updates
// ============================================

const products: Product[] = [
  { id: "1", name: "Wireless Headphones", price: 79.99, stock: 10, category: "Electronics" },
  { id: "2", name: "Mechanical Keyboard", price: 129.99, stock: 5, category: "Electronics" },
  { id: "3", name: "USB-C Hub", price: 49.99, stock: 15, category: "Electronics" },
  { id: "4", name: "Webcam 4K", price: 89.99, stock: 8, category: "Electronics" },
  { id: "5", name: "Desk Lamp LED", price: 34.99, stock: 20, category: "Office" },
  { id: "6", name: "Monitor Stand", price: 59.99, stock: 12, category: "Office" },
];

function ProductCard({ product }: { product: Product }) {
  const { publish } = useAppEvents.usePublish();
  const [isAdding, setIsAdding] = useState(false);
  const [stock, setStock] = useState(product.stock);

  // Listen for stock changes
  useAppEvents.useSubscribe(
    "product.stockChanged",
    (payload) => {
      if (payload.productId === product.id) {
        setStock(payload.stock);
      }
    },
    [product.id]
  );

  // Listen for price changes
  const [price, setPrice] = useState(product.price);
  useAppEvents.useSubscribe(
    "product.priceChanged",
    (payload) => {
      if (payload.productId === product.id) {
        setPrice(payload.newPrice);
      }
    },
    [product.id]
  );

  const handleAddToCart = async () => {
    if (stock <= 0) return;
    
    setIsAdding(true);
    
    // Optimistic update - immediately publish event
    publish("cart.itemAdded", {
      productId: product.id,
      name: product.name,
      price: price,
      quantity: 1,
    });

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    setIsAdding(false);
    
    // Show success notification
    publish("notification.show", {
      id: `notif_${Date.now()}`,
      type: "success",
      title: "Added to Cart",
      message: `${product.name} has been added to your cart`,
      duration: 3000,
    });
  };

  const isOutOfStock = stock <= 0;

  return (
    <div className={`product-card ${isOutOfStock ? "out-of-stock" : ""}`}>
      <div className="product-image">
        <span className="product-placeholder">{product.name.charAt(0)}</span>
      </div>
      <div className="product-info">
        <h4 className="product-name">{product.name}</h4>
        <span className="product-category">{product.category}</span>
        <div className="product-price-stock">
          <span className="product-price">${price.toFixed(2)}</span>
          <span className={`product-stock ${stock < 5 ? "low" : ""}`}>
            {stock > 0 ? `${stock} in stock` : "Out of stock"}
          </span>
        </div>
      </div>
      <button
        className="add-to-cart-btn"
        onClick={handleAddToCart}
        disabled={isOutOfStock || isAdding}
      >
        {isAdding ? <LoadingSpinner size="small" /> : isOutOfStock ? "Out of Stock" : "Add to Cart"}
      </button>
    </div>
  );
}

function CartItemRow({ 
  item, 
  onUpdateQuantity, 
  onRemove 
}: { 
  item: CartItem; 
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  return (
    <div className="cart-item">
      <div className="cart-item-info">
        <span className="cart-item-name">{item.name}</span>
        <span className="cart-item-price">${item.price.toFixed(2)} each</span>
      </div>
      <div className="cart-item-actions">
        <div className="quantity-controls">
          <button 
            onClick={() => onUpdateQuantity(item.productId, Math.max(0, item.quantity - 1))}
            disabled={item.quantity <= 1}
          >
            −
          </button>
          <span className="quantity">{item.quantity}</span>
          <button onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}>
            +
          </button>
        </div>
        <span className="cart-item-total">
          ${(item.price * item.quantity).toFixed(2)}
        </span>
        <button 
          className="remove-btn"
          onClick={() => onRemove(item.productId)}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function ShoppingCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { publish } = useAppEvents.usePublish();

  // Subscribe to cart events
  useAppEvents.useSubscribe(
    "cart.itemAdded",
    (payload) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.productId === payload.productId);
        if (existing) {
          return prev.map((i) =>
            i.productId === payload.productId
              ? { ...i, quantity: i.quantity + (payload.quantity || 1) }
              : i
          );
        }
        return [...prev, { ...payload, quantity: payload.quantity || 1 }];
      });
    },
    []
  );

  useAppEvents.useSubscribe(
    "cart.itemRemoved",
    (payload) => {
      setItems((prev) => prev.filter((i) => i.productId !== payload.productId));
    },
    []
  );

  useAppEvents.useSubscribe(
    "cart.quantityChanged",
    (payload) => {
      if (payload.quantity === 0) {
        setItems((prev) => prev.filter((i) => i.productId !== payload.productId));
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.productId === payload.productId ? { ...i, quantity: payload.quantity } : i
          )
        );
      }
    },
    []
  );

  useAppEvents.useSubscribe(
    "cart.cleared",
    () => {
      setItems([]);
    },
    []
  );

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    publish("cart.quantityChanged", { productId, quantity });
  };

  const handleRemove = (productId: string) => {
    publish("cart.itemRemoved", { productId });
  };

  const handleClear = () => {
    publish("cart.cleared", {});
    publish("notification.show", {
      id: `notif_${Date.now()}`,
      type: "info",
      title: "Cart Cleared",
      message: "Your shopping cart has been cleared",
      duration: 3000,
    });
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;
    
    setIsCheckingOut(true);
    const cartId = `cart_${Date.now()}`;
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    
    // Publish checkout started event
    publish("cart.checkoutStarted", { cartId, total });
    
    // Simulate checkout process
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Publish checkout completed event
    const orderId = `order_${Date.now()}`;
    publish("cart.checkoutCompleted", { cartId, orderId, total });
    
    // Clear cart
    publish("cart.cleared", {});
    
    // Show success notification
    publish("notification.show", {
      id: `notif_${Date.now()}`,
      type: "success",
      title: "Order Placed!",
      message: `Order #${orderId} has been placed successfully. Total: $${total.toFixed(2)}`,
      duration: 5000,
    });
    
    // Add to activity feed
    publish("activity.new", {
      id: `act_${Date.now()}`,
      type: "order",
      title: "New order placed",
      description: `Order #${orderId} - $${total.toFixed(2)}`,
      metadata: { orderId, total },
      timestamp: Date.now(),
    });
    
    setIsCheckingOut(false);
  };

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="shopping-cart card">
      <div className="cart-header">
        <h3>Shopping Cart ({itemCount})</h3>
        {items.length > 0 && (
          <button className="clear-btn" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>
      
      {items.length === 0 ? (
        <div className="empty-cart">
          <span className="empty-icon">🛒</span>
          <p>Your cart is empty</p>
          <p className="empty-hint">Add some products to get started</p>
        </div>
      ) : (
        <>
          <div className="cart-items">
            {items.map((item) => (
              <CartItemRow
                key={item.productId}
                item={item}
                onUpdateQuantity={handleUpdateQuantity}
                onRemove={handleRemove}
              />
            ))}
          </div>
          <div className="cart-footer">
            <div className="cart-total">
              <span>Total:</span>
              <span className="total-amount">${total.toFixed(2)}</span>
            </div>
            <button 
              className="checkout-btn"
              onClick={handleCheckout}
              disabled={isCheckingOut}
            >
              {isCheckingOut ? (
                <>
                  <LoadingSpinner size="small" />
                  Processing...
                </>
              ) : (
                `Checkout ($${total.toFixed(2)})`
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// 10. Demo Controls Component
// ============================================

function DemoControls() {
  const { publish } = useAppEvents.usePublish();

  const simulatePriceChange = () => {
    const product = products[Math.floor(Math.random() * products.length)];
    const newPrice = product.price * (0.8 + Math.random() * 0.4);
    publish("product.priceChanged", {
      productId: product.id,
      oldPrice: product.price,
      newPrice: Math.round(newPrice * 100) / 100,
    });
    publish("notification.show", {
      id: `notif_${Date.now()}`,
      type: "info",
      title: "Price Update",
      message: `${product.name} price has changed`,
      duration: 3000,
    });
  };

  const simulateStockChange = () => {
    const product = products[Math.floor(Math.random() * products.length)];
    const newStock = Math.floor(Math.random() * 20);
    publish("product.stockChanged", {
      productId: product.id,
      stock: newStock,
    });
  };

  const simulateUserJoin = () => {
    const names = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry"];
    const name = names[Math.floor(Math.random() * names.length)]!;
    publish("user.online", {
      userId: `user_${Date.now()}`,
      username: name,
      status: "available",
    });
  };

  const simulateActivity = () => {
    const activities = [
      { type: "system" as const, title: "System maintenance scheduled", description: "Maintenance in 1 hour" },
      { type: "cart" as const, title: "Someone added items to cart", description: "3 items added" },
      { type: "user" as const, title: "New user registered", description: "Welcome to the platform" },
    ];
    const activity = activities[Math.floor(Math.random() * activities.length)]!;
    publish("activity.new", {
      id: `act_${Date.now()}`,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      timestamp: Date.now(),
    });
  };

  return (
    <div className="demo-controls card">
      <h3>Demo Controls</h3>
      <div className="controls-grid">
        <button className="control-btn" onClick={simulatePriceChange}>
          💰 Change Price
        </button>
        <button className="control-btn" onClick={simulateStockChange}>
          📦 Update Stock
        </button>
        <button className="control-btn" onClick={simulateUserJoin}>
          👤 Add User
        </button>
        <button className="control-btn" onClick={simulateActivity}>
          📋 New Activity
        </button>
      </div>
    </div>
  );
}

// ============================================
// 11. Main App Component
// ============================================

function App() {
  return (
    <ErrorBoundary>
      <div className="app">
        <header className="app-header">
          <h1>🚀 PubSub React Demo</h1>
          <p>Real-time state management with optimistic updates</p>
        </header>

        <NotificationContainer />

        <main className="app-main">
          <div className="main-content">
            <section className="products-section">
              <h2>Products</h2>
              <div className="products-grid">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>

            <aside className="sidebar">
              <ShoppingCart />
              <UserPresence />
              <ActivityFeed />
              <DemoControls />
            </aside>
          </div>
        </main>

        <footer className="app-footer">
          <p>
            Built with <strong>@pubsubjs/react</strong> • 
            Zustand-style API • No Provider needed • Type-safe
          </p>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

// ============================================
// 12. Mount App
// ============================================

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
