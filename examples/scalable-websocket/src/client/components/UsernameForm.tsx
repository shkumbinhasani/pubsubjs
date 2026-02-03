import React, { useState } from "react";

interface Props {
  onSubmit: (username: string) => void;
}

export function UsernameForm({ onSubmit }: Props) {
  const [username, setUsername] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onSubmit(username.trim());
    }
  };

  return (
    <div className="username-form-container">
      <div className="username-form">
        <h2>Welcome to the Chat</h2>
        <p>Enter your username to join</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your username..."
            autoFocus
          />
          <button type="submit">Join Chat</button>
        </form>
      </div>
    </div>
  );
}
