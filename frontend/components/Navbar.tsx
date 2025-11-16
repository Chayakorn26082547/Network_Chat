"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@mui/material";
import ChatModal from "./ChatModal";
import ForumIcon from "@mui/icons-material/Forum";
import Logout from "./navbar-components/Logout";
import { useSocket } from "@/hooks/useSocket";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { socket } = useSocket();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Initialize from localStorage early
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedUser = localStorage.getItem("chatUsername");
    const storedAvatar = localStorage.getItem("chatAvatar");
    if (storedUser) setUsername(storedUser);
    if (storedAvatar) setAvatarUrl(storedAvatar);
  }, []);

  // Listen for userList to refresh avatar if server has one
  useEffect(() => {
    if (!socket) return;
    const handleUserList = (users: any[]) => {
      if (!username) return;
      const me = users.find((u) => u.username === username);
      if (me && me.avatar && me.avatar !== avatarUrl) {
        setAvatarUrl(me.avatar);
        try {
          localStorage.setItem("chatAvatar", me.avatar);
        } catch {
          // ignore
        }
      }
    };
    socket.on("userList", handleUserList);
    if (username && !avatarUrl) {
      socket.emit("getUserList");
    }
    return () => {
      socket.off("userList", handleUserList);
    };
  }, [socket, username, avatarUrl]);

  const fallback = username
    ? `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
        username
      )}`
    : "https://api.dicebear.com/7.x/thumbs/svg?seed=guest";

  return (
    <nav className="bg-[#252524] shadow p-4 flex items-center justify-end">
      <div className="flex items-center gap-4">
        <Button
          color="inherit"
          startIcon={<ForumIcon sx={{ color: "#f8f8f8" }} />}
          onClick={() => setOpen(true)}
        />
        <div className="flex items-center gap-2">
          <img
            src={avatarUrl || fallback}
            alt={username ? `${username} avatar` : "Your avatar"}
            className="w-8 h-8 rounded-full object-cover shadow ring-2 ring-[#252524]/20"
            draggable={false}
          />
        </div>
      </div>
      <Logout />

      {open && <ChatModal onClose={() => setOpen(false)} />}
    </nav>
  );
}
