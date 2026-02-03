export interface Message {
  id: string;
  from: string;
  message: string;
  timestamp: number;
}

export interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: number;
}

export interface UserEvent {
  userId: string;
  username: string;
  timestamp: number;
  type: "joined" | "left";
}

export interface ServerInfo {
  serverId: string;
  connectedClients: number;
  timestamp: number;
}
