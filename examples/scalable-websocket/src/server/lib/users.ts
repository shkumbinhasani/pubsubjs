/**
 * Connected users store
 */
export interface ConnectedUser {
  username: string;
  connectionId: string;
}

const users = new Map<string, ConnectedUser>();

export const connectedUsers = {
  get(userId: string) {
    return users.get(userId);
  },

  set(userId: string, user: ConnectedUser) {
    users.set(userId, user);
  },

  delete(userId: string) {
    return users.delete(userId);
  },

  get size() {
    return users.size;
  },

  values() {
    return users.values();
  },
};
