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
  fileData?: string; // Base64 data URL
  fileName?: string;
  fileType?: string;
}

export interface PrivateMessage {
  id: string;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  text: string;
  timestamp: number;
  fileData?: string;
  fileName?: string;
  fileType?: string;
}

export interface Group {
  id: string;
  name: string;
  creatorId: string;
  creatorUsername: string;
  members: string[]; // Array of user IDs
  createdAt: number;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  fileData?: string;
  fileName?: string;
  fileType?: string;
}

export interface ServerToClientEvents {
  message: (data: Message) => void;
  privateMessage: (data: PrivateMessage) => void;
  previousPrivateMessages: (data: {
    chatWithUserId: string;
    messages: PrivateMessage[];
  }) => void;
  groupCreated: (group: Group) => void;
  groupList: (groups: Group[]) => void;
  groupJoined: (data: {
    groupId: string;
    userId: string;
    username: string;
    group: Group;
  }) => void;
  groupLeft: (data: {
    groupId: string;
    userId: string;
    username: string;
    group?: Group;
  }) => void;
  groupDeleted: (groupId: string) => void;
  groupMessage: (data: GroupMessage) => void;
  previousGroupMessages: (data: {
    groupId: string;
    messages: GroupMessage[];
  }) => void;
  userJoined: (data: { username: string; users: User[] }) => void;
  userLeft: (data: { username: string; users: User[] }) => void;
  previousMessages: (messages: Message[]) => void;
  userList: (users: User[]) => void;
}

export interface ClientToServerEvents {
  setUsername: (username: string) => void;
  message: (data: { username: string; text: string }) => void;
  privateMessage: (data: { toUserId: string; text: string }) => void;
  getPreviousPrivateMessages: (chatWithUserId: string) => void;
  createGroup: (groupName: string) => void;
  getGroupList: () => void;
  joinGroup: (groupId: string) => void;
  leaveGroup: (groupId: string) => void;
  groupMessage: (data: { groupId: string; text: string }) => void;
  getPreviousGroupMessages: (groupId: string) => void;
  getUserList: () => void;
  getPreviousMessages: () => void;
  userLeft: (username: string) => void;
}
