export interface User {
  id: string;
  username: string;
  socketId: string;
  joinedAt: number;
}

export interface Message {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  userId: string;
}

export interface ServerToClientEvents {
  message: (data: Message) => void;
  userJoined: (data: { username: string; users: User[] }) => void;
  userLeft: (data: { username: string; users: User[] }) => void;
  previousMessages: (messages: Message[]) => void;
  userList: (users: User[]) => void;
}

export interface ClientToServerEvents {
  setUsername: (username: string) => void;
  message: (data: { username: string; text: string }) => void;
  getUserList: () => void;
  getPreviousMessages: () => void;
  userLeft: (username: string) => void;
}
