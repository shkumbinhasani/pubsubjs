import React from "react";
import { UserEventLog } from "./UserEventLog";
import type { UserEvent } from "../lib/types";

interface Props {
  username: string;
  userEvents: UserEvent[];
}

export function Sidebar({ username, userEvents }: Props) {
  return (
    <aside>
      <div className="user-info">
        <h3>Logged in as</h3>
        <span className="username">{username}</span>
      </div>

      <UserEventLog events={userEvents} />

      <div className="architecture">
        <h3>Architecture</h3>
        <pre>{`
Client ◄─WebSocket─► Server
                       │
                    Redis
                       │
Client ◄─WebSocket─► Server
        `}</pre>
      </div>
    </aside>
  );
}
