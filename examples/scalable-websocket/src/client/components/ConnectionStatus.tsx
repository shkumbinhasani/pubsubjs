import React from "react";
import type { ServerInfo } from "../lib/types";

interface Props {
  isConnected: boolean;
  serverInfo: ServerInfo | null;
}

export function ConnectionStatus({ isConnected, serverInfo }: Props) {
  return (
    <div className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
      <span className="status-dot" />
      <span>{isConnected ? "Connected" : "Disconnected"}</span>
      {serverInfo && (
        <span className="server-info">
          Server: {serverInfo.serverId}
        </span>
      )}
    </div>
  );
}
