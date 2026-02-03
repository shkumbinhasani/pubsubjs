import React, { useRef, useEffect } from "react";
import type { Message } from "../lib/types";

interface Props {
  messages: Message[];
}

export function MessageList({ messages }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="message-list" ref={listRef}>
      {messages.length === 0 ? (
        <div className="empty-state">No messages yet. Start the conversation!</div>
      ) : (
        messages.map((msg) => (
          <div key={msg.id} className="message">
            <span className="message-from">{msg.from}</span>
            <span className="message-text">{msg.message}</span>
            <span className="message-time">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
