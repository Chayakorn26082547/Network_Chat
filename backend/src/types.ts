export interface User {
  id: string;
  username: string;
  socketId: string;
  joinedAt: number;
  avatar?: string;
}

export interface Message {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  userId: string;
  avatar?: string;
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
  avatar?: string;
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
  avatar?: string;
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
  // Video call signaling
  incomingVideoCall: (data: {
    fromUserId: string;
    fromUsername: string;
  }) => void;
  videoOffer: (data: { fromUserId: string; offer: any }) => void;
  videoAnswer: (data: { fromUserId: string; answer: any }) => void;
  newIceCandidate: (data: { fromUserId: string; candidate: any }) => void;
  videoCallEnded: (data: { fromUserId: string }) => void;
  videoCallDeclined: (data: { fromUserId: string }) => void;
}

export interface ClientToServerEvents {
  setUsername: (
    data:
      | string
      | {
          username: string;
          avatar?: string;
        }
  ) => void;
  message: (data: {
    username: string;
    text: string;
    fileData?: string;
    fileName?: string;
    fileType?: string;
  }) => void;
  privateMessage: (data: {
    toUserId: string;
    text: string;
    fileData?: string;
    fileName?: string;
    fileType?: string;
  }) => void;
  getPreviousPrivateMessages: (chatWithUserId: string) => void;
  createGroup: (groupName: string) => void;
  getGroupList: () => void;
  joinGroup: (groupId: string) => void;
  leaveGroup: (groupId: string) => void;
  groupMessage: (data: {
    groupId: string;
    text: string;
    fileData?: string;
    fileName?: string;
    fileType?: string;
  }) => void;
  getPreviousGroupMessages: (groupId: string) => void;
  getUserList: () => void;
  getPreviousMessages: () => void;
  userLeft: (username: string) => void;
  // Video call signaling
  videoCallRequest: (toUserId: string) => void;
  videoOffer: (data: { toUserId: string; offer: any }) => void;
  videoAnswer: (data: { toUserId: string; answer: any }) => void;
  newIceCandidate: (data: { toUserId: string; candidate: any }) => void;
  videoCallEnded: (toUserId: string) => void;
  videoCallDeclined: (toUserId: string) => void;
}
