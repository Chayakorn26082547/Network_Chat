import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import {
  User,
  Message,
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
const userSockets = new Map<string, string>(); // socketId -> userId

// Health check endpoint
// THIS USE REST API [NEED TO DELETE]
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    users: users.size,
    messages: messages.length,
  });
});

// WebSocket connection handler
io.on(
  "connection",
  (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    // Handle username setup
    socket.on("setUsername", (username: string) => {
      // Check if username is already taken
      const existingUser = Array.from(users.values()).find(
        (u) => u.username.toLowerCase() === username.toLowerCase()
      );

      if (existingUser && existingUser.socketId !== socket.id) {
        socket.emit("userJoined", {
          username: "System",
          users: Array.from(users.values()),
        });
        return;
      }

      const userId = existingUser?.id || randomUUID();
      const user: User = {
        id: userId,
        username: username.trim(),
        socketId: socket.id,
        joinedAt: Date.now(),
      };

      users.set(userId, user);
      userSockets.set(socket.id, userId);

      // Join room with username
      socket.join(username);

      console.log(`User set: ${username} (${userId})`);

      // Notify everyone
      io.emit("userJoined", {
        username,
        users: Array.from(users.values()),
      });

      // Send current user list
      socket.emit("userList", Array.from(users.values()));

      // Send previous messages to new user
      socket.emit("previousMessages", messages);
    });

    // Handle message sending
    socket.on("message", (data: { username: string; text: string }) => {
      const message: Message = {
        id: randomUUID(),
        username: data.username,
        text: data.text,
        timestamp: Date.now(),
        userId: userSockets.get(socket.id) || "unknown",
      };

      messages.push(message);

      // Keep only last 100 messages
      if (messages.length > 100) {
        messages.shift();
      }

      console.log(`Message from ${data.username}: ${data.text}`);

      // Broadcast to all connected clients
      io.emit("message", message);
    });

    // Handle get previous messages
    socket.on("getPreviousMessages", () => {
      socket.emit("previousMessages", messages);
    });

    // Handle request for current user list
    socket.on("getUserList", () => {
      socket.emit("userList", Array.from(users.values()));
    });

    // Handle user left
    socket.on("userLeft", (username: string) => {
      const userId = userSockets.get(socket.id);
      if (userId) {
        users.delete(userId);
        userSockets.delete(socket.id);
        console.log(`User left: ${username}`);

        io.emit("userLeft", {
          username,
          users: Array.from(users.values()),
        });
      }
    });

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      const userId = userSockets.get(socket.id);
      if (userId) {
        const user = users.get(userId);
        if (user) {
          users.delete(userId);
          console.log(`User disconnected: ${user.username} (${userId})`);
          console.log("Disconnected because:", reason);

          io.emit("userLeft", {
            username: user.username,
            users: Array.from(users.values()),
          });
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
