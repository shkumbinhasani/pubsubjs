import { useState, useEffect } from "react";
import { subscriber } from "../lib/pubsub";
import type { UserEvent } from "../lib/types";

const MAX_EVENTS = 20;

export function useUserEvents() {
  const [events, setEvents] = useState<UserEvent[]>([]);

  useEffect(() => {
    subscriber.on("user.joined", (payload) => {
      setEvents((prev) => [...prev, { ...payload, type: "joined" }].slice(-MAX_EVENTS));
    });

    subscriber.on("user.left", (payload) => {
      setEvents((prev) => [...prev, { ...payload, type: "left" }].slice(-MAX_EVENTS));
    });
  }, []);

  return events;
}
