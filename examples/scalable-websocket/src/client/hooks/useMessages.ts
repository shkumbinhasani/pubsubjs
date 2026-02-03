import { useState, useEffect } from "react";
import { subscriber } from "../lib/pubsub";
import type { Message } from "../lib/types";

const MAX_MESSAGES = 100;

export function useMessages() {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    subscriber.on("broadcast", (payload) => {
      setMessages((prev) => [...prev, payload].slice(-MAX_MESSAGES));
    });
  }, []);

  return messages;
}
