import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import twilio from "twilio";
import {
  User,
  Message,
  PrivateMessage,
  Group,
  GroupMessage,
  ServerToClientEvents,
  ClientToServerEvents,
} from "./types";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
  pingInterval: 25000, // how often server sends pings (25s)
  pingTimeout: 60000, // how long server waits before disconnect (60s)
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage
const users = new Map<string, User>();
const messages: Message[] = [];
const privateMessages = new Map<string, PrivateMessage[]>(); // key: "userId1-userId2" (sorted)
const userSockets = new Map<string, string>(); // socketId -> userId
const usernameToUserId = new Map<string, string>(); // username -> userId (persistent mapping)
const groups = new Map<string, Group>(); // groupId -> Group
const groupMessages = new Map<string, GroupMessage[]>(); // groupId -> messages

// Helper function to generate private chat room key
function getChatRoomKey(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join("-");
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    users: users.size,
    messages: messages.length,
  });
});

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const twilioClient = twilio(accountSid, authToken);
// GET /turn-token → returns fresh ICE servers
app.get("/turn-token", async (req, res) => {
  try {
    const token = await twilioClient.tokens.create();
    res.json({
      iceServers: token.iceServers,
      username: token.username,
      ttl: token.ttl,
    });
  } catch (e) {
    console.error("TURN token error:", e);
    res.status(500).json({ error: "Failed to generate TURN token" });
  }
});

// Debug endpoint to check private messages
app.get("/debug/private-messages", (req, res) => {
  const allMessages: any = {};
  privateMessages.forEach((msgs, key) => {
    allMessages[key] = {
      count: msgs.length,
      messages: msgs.map((m) => ({
        from: m.fromUsername,
        to: m.toUsername,
        text: m.text,
        timestamp: new Date(m.timestamp).toISOString(),
      })),
    };
  });
  res.json({
    totalRooms: privateMessages.size,
    rooms: allMessages,
  });
});

// WebSocket connection handler
io.on(
  "connection",
  (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    // Handle username setup (supports string or object with avatar)
    socket.on(
      "setUsername",
      (payload: string | { username: string; avatar?: string }) => {
        const username =
          typeof payload === "string" ? payload : payload.username;
        const avatar = typeof payload === "string" ? undefined : payload.avatar;

        const normalizedUsername = username.trim().toLowerCase();

        // Check if this username is already connected from a different socket
        const existingUser = Array.from(users.values()).find(
          (u) =>
            u.username.toLowerCase() === normalizedUsername &&
            u.socketId !== socket.id
        );

        if (existingUser) {
          console.log(
            `Username ${username} already in use by another connection`
          );
          socket.emit("usernameError", {
            error: "Username already in use. Please choose a different name.",
          });
          return;
        }

        // Get or create persistent user ID for this username
        let userId = usernameToUserId.get(normalizedUsername);
        if (!userId) {
          userId = randomUUID();
          usernameToUserId.set(normalizedUsername, userId);
          console.log(`Created new persistent userId for ${username}:`, userId);
        } else {
          console.log(`Reusing existing userId for ${username}:`, userId);
          // Clean up old socket mapping if user is reconnecting
          const oldUser = users.get(userId);
          if (oldUser && oldUser.socketId !== socket.id) {
            console.log(
              `Cleaning up old socket mapping for ${username}: ${oldUser.socketId} -> ${socket.id}`
            );
            userSockets.delete(oldUser.socketId);
          }
        }

        const user: User = {
          id: userId,
          username: username.trim(),
          socketId: socket.id,
          joinedAt: Date.now(),
          avatar,
        };

        users.set(userId, user);
        userSockets.set(socket.id, userId);

        // Join room with username
        socket.join(username);

        console.log(`User set: ${username} (${userId}) - socket: ${socket.id}`);

        // Notify everyone
        io.emit("userJoined", {
          username,
          users: Array.from(users.values()),
        });

        // Send current user list
        socket.emit("userList", Array.from(users.values()));

        // Send previous messages to new user
        socket.emit("previousMessages", messages);
      }
    );

    // Handle message sending
    // Handle message sending
    socket.on(
      "message",
      (data: {
        username: string;
        text: string;
        // --- ADD THESE ---
        fileData?: string;
        fileName?: string;
        fileType?: string;
      }) => {
        const senderUserId = userSockets.get(socket.id) || "unknown";
        const sender =
          senderUserId !== "unknown" ? users.get(senderUserId) : undefined;
        const message: Message = {
          id: randomUUID(),
          username: data.username,
          text: data.text,
          timestamp: Date.now(),
          userId: senderUserId,
          avatar: sender?.avatar,

          // --- ADD THESE ---
          fileData: data.fileData,
          fileName: data.fileName,
          fileType: data.fileType,
        };

        messages.push(message);

        // Keep only last 100 messages
        if (messages.length > 100) {
          messages.shift();
        }

        console.log(
          `Message from ${data.username}: ${data.text} ${
            data.fileName ? `(File: ${data.fileName})` : ""
          }`
        );

        // Broadcast to all connected clients
        io.emit("message", message);
      }
    );

    // Handle get previous messages (world chat) - must be at connection scope
    socket.on("getPreviousMessages", () => {
      socket.emit("previousMessages", messages);
    });

    // Handle private message sending
    socket.on(
      "privateMessage",
      (data: {
        toUserId: string;
        text: string;
        // --- ADD THESE ---
        fileData?: string;
        fileName?: string;
        fileType?: string;
      }) => {
        console.log("Received privateMessage event:", data);

        const fromUserId = userSockets.get(socket.id);
        console.log("From user ID:", fromUserId);

        if (!fromUserId) {
          console.log("ERROR: fromUserId not found for socket:", socket.id);
          return;
        }

        const fromUser = users.get(fromUserId);
        const toUser = users.get(data.toUserId);

        console.log("From user:", fromUser);
        console.log("To user:", toUser);

        if (!fromUser || !toUser) {
          console.log(
            "ERROR: User not found. fromUser:",
            fromUser,
            "toUser:",
            toUser
          );
          return;
        }

        const privateMessage: PrivateMessage = {
          id: randomUUID(),
          fromUserId: fromUser.id,
          fromUsername: fromUser.username,
          toUserId: toUser.id,
          toUsername: toUser.username,
          text: data.text,
          timestamp: Date.now(),
          avatar: fromUser.avatar,

          // --- ADD THESE ---
          fileData: data.fileData,
          fileName: data.fileName,
          fileType: data.fileType,
        };

        // Store private message
        const chatRoomKey = getChatRoomKey(fromUserId, data.toUserId);
        // ... (rest of the function is fine)

        console.log("Chat room key for storage:", chatRoomKey);

        if (!privateMessages.has(chatRoomKey)) {
          privateMessages.set(chatRoomKey, []);
          console.log("Created new chat room:", chatRoomKey);
        }
        const roomMessages = privateMessages.get(chatRoomKey)!;
        roomMessages.push(privateMessage);

        console.log(
          "Stored message. Total messages in room",
          chatRoomKey,
          ":",
          roomMessages.length
        );

        // Keep only last 100 messages per chat room
        if (roomMessages.length > 100) {
          roomMessages.shift();
        }

        console.log(
          `Private message from ${fromUser.username} to ${toUser.username}: ${
            data.text
          } ${data.fileName ? `(File: ${data.fileName})` : ""}`
        );
        console.log(
          "Sending to socket IDs - sender:",
          socket.id,
          "receiver:",
          toUser.socketId
        );

        // Send to sender
        socket.emit("privateMessage", privateMessage);

        // Send to receiver
        io.to(toUser.socketId).emit("privateMessage", privateMessage);

        console.log("Private message sent successfully");
      }
    );

    // Handle get previous private messages
    socket.on("getPreviousPrivateMessages", (chatWithUserId: string) => {
      const userId = userSockets.get(socket.id);
      console.log(
        "Request for previous private messages - requester userId:",
        userId,
        "chatWith:",
        chatWithUserId
      );

      if (!userId) {
        console.log("ERROR: userId not found for socket:", socket.id);
        return;
      }

      const chatRoomKey = getChatRoomKey(userId, chatWithUserId);
      const messages = privateMessages.get(chatRoomKey) || [];

      console.log("Chat room key:", chatRoomKey);
      console.log("Found", messages.length, "previous messages");
      console.log("All chat rooms:", Array.from(privateMessages.keys()));

      socket.emit("previousPrivateMessages", {
        chatWithUserId,
        messages,
      });
    });

    // Video call signaling: caller requests a call (incoming ring)
    socket.on("videoCallRequest", (toUserId: string) => {
      const fromUserId = userSockets.get(socket.id);
      if (!fromUserId) return;
      const fromUser = users.get(fromUserId);
      const toUser = users.get(toUserId);
      if (!fromUser || !toUser) return;

      // Notify callee of incoming call
      io.to(toUser.socketId).emit("incomingVideoCall", {
        fromUserId: fromUser.id,
        fromUsername: fromUser.username,
      });
    });

    // Forward SDP offer from caller to callee
    socket.on("videoOffer", (data: { toUserId: string; offer: any }) => {
      const fromUserId = userSockets.get(socket.id);
      if (!fromUserId) return;
      const toUser = users.get(data.toUserId);
      const fromUser = users.get(fromUserId);
      if (!toUser || !fromUser) return;

      io.to(toUser.socketId).emit("videoOffer", {
        fromUserId: fromUser.id,
        offer: data.offer,
      });
    });

    // Forward SDP answer from callee back to caller
    socket.on("videoAnswer", (data: { toUserId: string; answer: any }) => {
      const fromUserId = userSockets.get(socket.id);
      if (!fromUserId) return;
      const toUser = users.get(data.toUserId);
      const fromUser = users.get(fromUserId);
      if (!toUser || !fromUser) return;

      io.to(toUser.socketId).emit("videoAnswer", {
        fromUserId: fromUser.id,
        answer: data.answer,
      });
    });

    // Forward ICE candidates
    socket.on(
      "newIceCandidate",
      (data: { toUserId: string; candidate: any }) => {
        const fromUserId = userSockets.get(socket.id);
        if (!fromUserId) return;
        const toUser = users.get(data.toUserId);
        const fromUser = users.get(fromUserId);
        if (!toUser || !fromUser) return;

        io.to(toUser.socketId).emit("newIceCandidate", {
          fromUserId: fromUser.id,
          candidate: data.candidate,
        });
      }
    );

    // Call ended
    socket.on("videoCallEnded", (toUserId: string) => {
      const fromUserId = userSockets.get(socket.id);
      if (!fromUserId) return;
      const toUser = users.get(toUserId);
      if (!toUser) return;
      io.to(toUser.socketId).emit("videoCallEnded", { fromUserId });
    });

    // Call declined
    socket.on("videoCallDeclined", (toUserId: string) => {
      const fromUserId = userSockets.get(socket.id);
      if (!fromUserId) return;
      const toUser = users.get(toUserId);
      if (!toUser) return;
      io.to(toUser.socketId).emit("videoCallDeclined", { fromUserId });
    });

    // Handle request for current user list
    socket.on("getUserList", () => {
      socket.emit("userList", Array.from(users.values()));
    });

    // Handle create group
    socket.on("createGroup", (groupName: string) => {
      const userId = userSockets.get(socket.id);
      if (!userId) return;

      const user = users.get(userId);
      if (!user) return;

      const group: Group = {
        id: randomUUID(),
        name: groupName.trim(),
        creatorId: userId,
        creatorUsername: user.username,
        members: [userId], // Creator is automatically a member
        createdAt: Date.now(),
      };

      groups.set(group.id, group);
      groupMessages.set(group.id, []); // Initialize empty message array

      console.log(
        `Group created: "${group.name}" by ${user.username} (${group.id})`
      );

      // Notify all clients about the new group
      io.emit("groupCreated", group);
    });

    // Handle get group list
    socket.on("getGroupList", () => {
      socket.emit("groupList", Array.from(groups.values()));
    });

    // Handle join group
    socket.on("joinGroup", (groupId: string) => {
      const userId = userSockets.get(socket.id);
      if (!userId) return;

      const user = users.get(userId);
      const group = groups.get(groupId);

      if (!user || !group) return;

      // Check if already a member
      if (group.members.includes(userId)) {
        console.log(`${user.username} already in group ${group.name}`);
        return;
      }

      // Add user to group
      group.members.push(userId);
      console.log(`${user.username} joined group "${group.name}"`);

      // Create system message for join
      const joinMessage: GroupMessage = {
        id: `system-join-${userId}-${Date.now()}`,
        groupId: group.id,
        userId: "system",
        username: "System",
        text: `${user.username} joined the group`,
        timestamp: Date.now(),
      };

      // Add to group messages
      if (!groupMessages.has(groupId)) {
        groupMessages.set(groupId, []);
      }
      const messages = groupMessages.get(groupId)!;
      messages.push(joinMessage);
      if (messages.length > 100) messages.shift();

      // Send system message to all group members
      io.emit("groupMessage", joinMessage);

      // Notify all clients about the updated group
      io.emit("groupJoined", {
        groupId: group.id,
        userId: userId,
        username: user.username,
        group: group,
      });
    });

    // Handle leave group
    socket.on("leaveGroup", (groupId: string) => {
      const userId = userSockets.get(socket.id);
      if (!userId) return;

      const user = users.get(userId);
      const group = groups.get(groupId);

      if (!user || !group) return;

      // Check if user is a member
      if (!group.members.includes(userId)) {
        console.log(`${user.username} tried to leave group they're not in`);
        return;
      }

      // Remove user from group
      group.members = group.members.filter((id) => id !== userId);
      console.log(`${user.username} left group "${group.name}"`);

      // Check if group is now empty
      if (group.members.length === 0) {
        console.log(`Group "${group.name}" is empty - deleting group`);
        groups.delete(groupId);
        groupMessages.delete(groupId);

        // Notify all clients that group was deleted
        io.emit("groupDeleted", groupId);
      } else {
        // Create system message for leave
        const leaveMessage: GroupMessage = {
          id: `system-leave-${userId}-${Date.now()}`,
          groupId: group.id,
          userId: "system",
          username: "System",
          text: `${user.username} left the group`,
          timestamp: Date.now(),
        };

        // Add to group messages
        const messages = groupMessages.get(groupId)!;
        messages.push(leaveMessage);
        if (messages.length > 100) messages.shift();

        // Send system message to all group members
        io.emit("groupMessage", leaveMessage);

        // Notify all clients about the updated group
        io.emit("groupLeft", {
          groupId: group.id,
          userId: userId,
          username: user.username,
          group: group,
        });
      }
    });

    // Handle group message
    socket.on(
      "groupMessage",
      (data: {
        groupId: string;
        text: string;
        // --- ADD THESE ---
        fileData?: string;
        fileName?: string;
        fileType?: string;
      }) => {
        const userId = userSockets.get(socket.id);
        if (!userId) return;

        const user = users.get(userId);
        const group = groups.get(data.groupId);

        if (!user || !group) return;

        // Check if user is a member of the group
        if (!group.members.includes(userId)) {
          console.log(
            `${user.username} tried to send message to group they're not in`
          );
          return;
        }

        const groupMessage: GroupMessage = {
          id: randomUUID(),
          groupId: data.groupId,
          userId: userId,
          username: user.username,
          text: data.text,
          timestamp: Date.now(),
          avatar: user.avatar,

          // --- ADD THESE ---
          fileData: data.fileData,
          fileName: data.fileName,
          fileType: data.fileType,
        };

        // Store message
        const messages = groupMessages.get(data.groupId)!;
        messages.push(groupMessage);

        // Keep only last 100 messages per group
        if (messages.length > 100) {
          messages.shift();
        }

        console.log(
          `Group message in "${group.name}" from ${user.username}: ${
            data.text
          } ${data.fileName ? `(File: ${data.fileName})` : ""}`
        );

        // Send to all group members
        group.members.forEach((memberId) => {
          const member = users.get(memberId);
          if (member) {
            io.to(member.socketId).emit("groupMessage", groupMessage);
          }
        });
      }
    );

    // Handle get previous group messages
    socket.on("getPreviousGroupMessages", (groupId: string) => {
      const userId = userSockets.get(socket.id);
      if (!userId) return;

      const group = groups.get(groupId);
      if (!group) return;

      // Check if user is a member
      if (!group.members.includes(userId)) {
        console.log(
          `User ${userId} tried to get messages from group they're not in`
        );
        return;
      }

      const messages = groupMessages.get(groupId) || [];
      console.log(
        `Sending ${messages.length} previous messages for group "${group.name}"`
      );

      socket.emit("previousGroupMessages", {
        groupId,
        messages,
      });
    });

    // Handle user left
    socket.on("userLeft", (username: string) => {
      const userId = userSockets.get(socket.id);
      if (userId) {
        const user = users.get(userId);
        if (user) {
          users.delete(userId);
          console.log(`User left intentionally: ${username}`);

          io.emit("userLeft", {
            username,
            users: Array.from(users.values()),
          });
        }
        userSockets.delete(socket.id);
      }
    });

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      const userId = userSockets.get(socket.id);
      if (userId) {
        const user = users.get(userId);
        if (user) {
          // Remove user from active users
          users.delete(userId);
          console.log(
            `User disconnected: ${user.username} (${userId}) - Reason: ${reason}`
          );

          io.emit("userLeft", {
            username: user.username,
            users: Array.from(users.values()),
          });

          // Check if all users are offline - if so, clear all chat history
          if (users.size === 0) {
            console.log("No users online - Clearing all chat history");
            messages.length = 0; // Clear world chat
            privateMessages.clear(); // Clear all private chats
            groups.clear(); // Clear all groups
            groupMessages.clear(); // Clear all group messages
            usernameToUserId.clear(); // Clear username-to-userId mappings
            console.log("All chat history and groups cleared");
          } else {
            console.log(
              `${users.size} user(s) still online - Chat history preserved`
            );
          }
        }
        userSockets.delete(socket.id);
      }
    });
  }
);

// Error handler
httpServer.on("error", (error) => {
  console.error("Server error:", error);
});

// Start server
const PORT = parseInt(process.env.PORT || "3001", 10);
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Chat server is running on http://localhost:${PORT}`);
  console.log(
    `Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`
  );
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
