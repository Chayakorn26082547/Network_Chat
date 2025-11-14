"use client";

import React, { useEffect, useState } from "react";
import { useSocket } from "@/hooks/useSocket";

interface User {
  id: string;
  username: string;
  socketId: string;
}

export default function OnlineUsers() {
  const { socket } = useSocket();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleUserList = (list: User[]) => setUsers(list);
    const handleUserJoined = (data: { username: string; users: User[] }) =>
      setUsers(data.users);
    const handleUserLeft = (data: { username: string; users: User[] }) =>
      setUsers(data.users);

    socket.on("userList", handleUserList);
    socket.on("userJoined", handleUserJoined);
    socket.on("userLeft", handleUserLeft);

    // request current user list from the server (new socket event)
    socket.emit("getUserList");

    return () => {
      socket.off("userList", handleUserList);
      socket.off("userJoined", handleUserJoined);
      socket.off("userLeft", handleUserLeft);
    };
  }, [socket]);

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
        {users.map((u) => (
          <div key={u.id} className="flex-shrink-0 w-20 text-center">
            <div className="relative mx-auto w-20 h-20">
              <div
                className="absolute inset-0 rounded-full bg-gray-300"
                aria-hidden
              />
              {/* online indicator */}
              <span
                className="absolute top-0 right-0 w-5 h-5 rounded-full bg-green-400 border-2 border-white"
                aria-hidden
              />
            </div>
            <div className="mt-2 text-xs truncate text-gray-700">
              {u.username}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
