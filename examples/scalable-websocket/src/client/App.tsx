import React, { useState, useCallback } from "react";
import { publisher } from "./lib/pubsub";
import { useConnection, useMessages, useNotifications, useUserEvents } from "./hooks";
import {
  ConnectionStatus,
  Notifications,
  UsernameForm,
  MessageList,
  MessageInput,
  Sidebar,
} from "./components";

export function App() {
  const { isConnected, serverInfo } = useConnection();
  const messages = useMessages();
  const { notifications, dismiss } = useNotifications();
  const userEvents = useUserEvents();
  const [username, setUsername] = useState<string | null>(null);

  const handleSetUsername = useCallback((name: string) => {
    setUsername(name);
    publisher.publish("client.setUsername", { username: name });
  }, []);

  const handleSendMessage = useCallback((message: string) => {
    publisher.publish("client.message", { message });
  }, []);

  if (!username) {
    return <UsernameForm onSubmit={handleSetUsername} />;
  }

  return (
    <div className="app">
      <header>
        <h1>Scalable WebSocket Chat</h1>
        <ConnectionStatus isConnected={isConnected} serverInfo={serverInfo} />
      </header>

      <Notifications notifications={notifications} onDismiss={dismiss} />

      <main>
        <div className="chat-container">
          <MessageList messages={messages} />
          <MessageInput onSend={handleSendMessage} disabled={!isConnected} />
        </div>

        <Sidebar username={username} userEvents={userEvents} />
      </main>

      <footer>
        <p>
          Open multiple browser tabs or run multiple server instances to see
          cross-instance messaging.
        </p>
      </footer>
    </div>
  );
}
