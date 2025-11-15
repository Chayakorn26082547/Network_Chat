"use client";

import React, { useEffect, useState, useRef } from "react";
import { useSocket } from "@/hooks/useSocket";

interface User {
  id: string;
  username: string;
  socketId: string;
}

interface OnlineUsersProps {
  onUserClick?: (user: User) => void;
}

export default function OnlineUsers({ onUserClick }: OnlineUsersProps) {
  const { socket } = useSocket();
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const hasSetCurrentUser = useRef(false);
  const listenersRegistered = useRef(false);

  useEffect(() => {
    if (!socket || listenersRegistered.current) return;

    listenersRegistered.current = true;

    const handleUserList = (list: User[]) => {
      setUsers(list);
    };

    const handleUserJoined = (data: { username: string; users: User[] }) => {
      setUsers(data.users);
    };

    const handleUserLeft = (data: { username: string; users: User[] }) => {
      setUsers(data.users);
    };

    const handleConnect = () => {
      console.log("Socket connected, re-authenticating...");
      // Re-authenticate user on reconnect
      const savedUsername = localStorage.getItem("chatUsername");
      if (savedUsername) {
        socket.emit("setUsername", savedUsername);
      }
      // Request user list
      socket.emit("getUserList");
    };

    socket.on("connect", handleConnect);
    socket.on("userList", handleUserList);
    socket.on("userJoined", handleUserJoined);
    socket.on("userLeft", handleUserLeft);

    // Initial setup
    const savedUsername = localStorage.getItem("chatUsername");
    if (savedUsername) {
      socket.emit("setUsername", savedUsername);
    }
    socket.emit("getUserList");

    return () => {
      listenersRegistered.current = false;
      socket.off("connect", handleConnect);
      socket.off("userList", handleUserList);
      socket.off("userJoined", handleUserJoined);
      socket.off("userLeft", handleUserLeft);
    };
  }, [socket]);

  // Separate effect to set current user ID based on username
  useEffect(() => {
    if (users.length > 0 && !hasSetCurrentUser.current) {
      const savedUsername = localStorage.getItem("chatUsername");
      if (savedUsername) {
        const currentUser = users.find((u) => u.username === savedUsername);
        if (currentUser) {
          hasSetCurrentUser.current = true;
          setCurrentUserId(currentUser.id);
        }
      }
    }
  }, [users]);

  if (!users || users.length === 0) {
    return (
      <div className="px-4 py-6">
        <div className="text-sm text-gray-500 px-15">
          No one is online right now.
        </div>
      </div>
    );
  }

  return (
    <div className="px-20 py-4">
      <div className="flex gap-15 overflow-x-auto no-scrollbar">
        {users.map((u) => {
          const isCurrentUser = u.id === currentUserId;

          return (
            <div key={u.id} className="flex-shrink-0 w-20 text-center">
              <div
                className={`relative mx-auto w-20 h-20 ${
                  !isCurrentUser ? "cursor-pointer" : "cursor-default"
                }`}
                onClick={() => !isCurrentUser && onUserClick && onUserClick(u)}
              >
                <div
                  className={`absolute inset-0 rounded-full bg-gray-300 transition-all duration-200 ${
                    !isCurrentUser
                      ? "hover:scale-110 hover:shadow-xl hover:bg-gray-400"
                      : ""
                  }`}
                  aria-hidden
                />
                {/* online indicator */}
                <span
                  className="absolute top-0 right-0 w-5 h-5 rounded-full bg-green-400 border-2 border-white"
                  aria-hidden
                />
              </div>
              <div
                className={`mt-2 text-xs truncate ${
                  isCurrentUser
                    ? "text-gray-900 font-semibold"
                    : "text-gray-700"
                }`}
              >
                {u.username} {isCurrentUser && "(You)"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
