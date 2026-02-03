import { useState, useEffect, useCallback } from "react";
import { subscriber } from "../lib/pubsub";
import type { Notification } from "../lib/types";

const AUTO_DISMISS_MS = 5000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    subscriber.on("notification", (payload) => {
      setNotifications((prev) => [...prev, payload]);

      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== payload.id));
      }, AUTO_DISMISS_MS);
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, dismiss };
}
