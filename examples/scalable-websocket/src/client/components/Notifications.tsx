import React from "react";
import type { Notification } from "../lib/types";

interface Props {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

export function Notifications({ notifications, onDismiss }: Props) {
  if (notifications.length === 0) return null;

  return (
    <div className="notification-container">
      {notifications.map((n) => (
        <div key={n.id} className={`notification notification-${n.type}`}>
          <div className="notification-header">
            <strong>{n.title}</strong>
            <button onClick={() => onDismiss(n.id)}>&times;</button>
          </div>
          <p>{n.message}</p>
        </div>
      ))}
    </div>
  );
}
