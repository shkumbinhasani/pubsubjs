import React from "react";
import type { UserEvent } from "../lib/types";

interface Props {
  events: UserEvent[];
}

export function UserEventLog({ events }: Props) {
  return (
    <div className="user-events">
      <h3>Activity</h3>
      <div className="event-list">
        {events.length === 0 ? (
          <div className="empty-state">No activity yet</div>
        ) : (
          events.map((event, i) => (
            <div
              key={`${event.userId}-${event.timestamp}-${i}`}
              className={`user-event ${event.type}`}
            >
              <span className="event-icon">
                {event.type === "joined" ? "→" : "←"}
              </span>
              <span className="event-text">
                <strong>{event.username}</strong>{" "}
                {event.type === "joined" ? "joined" : "left"}
              </span>
              <span className="event-time">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
