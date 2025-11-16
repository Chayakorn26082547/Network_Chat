"use client";

import React, { useEffect, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import CallIcon from "@mui/icons-material/Call";
import CallEndIcon from "@mui/icons-material/CallEnd";

interface IncomingCall {
  fromUserId: string;
  fromUsername: string;
}

interface User {
  id: string;
  username: string;
  socketId: string;
  avatar?: string;
}

export default function IncomingCallNotification() {
  const { socket } = useSocket();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [dots, setDots] = useState(".");
  const [userMap, setUserMap] = useState<Record<string, User>>({});

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: IncomingCall) => {
      console.log("[IncomingCallNotification] Incoming call from", data);
      setIncomingCall(data);
      // Ensure we have fresh user list (in case we haven't yet)
      socket.emit("getUserList");
    };

    const handleCallDeclined = (data: { fromUserId: string }) => {
      setIncomingCall(null);
    };

    const handleCallEnded = (data: { fromUserId: string }) => {
      setIncomingCall(null);
    };

    socket.on("incomingVideoCall", handleIncomingCall);
    socket.on("videoCallDeclined", handleCallDeclined);
    socket.on("videoCallEnded", handleCallEnded);

    // Listen for user list to resolve avatar
    const handleUserList = (users: User[]) => {
      const map: Record<string, User> = {};
      users.forEach((u) => (map[u.id] = u));
      setUserMap(map);
    };
    socket.on("userList", handleUserList);

    // Request list on mount to populate avatars early
    socket.emit("getUserList");

    return () => {
      socket.off("incomingVideoCall", handleIncomingCall);
      socket.off("videoCallDeclined", handleCallDeclined);
      socket.off("videoCallEnded", handleCallEnded);
      socket.off("userList", handleUserList);
    };
  }, [socket]);

  // Animate dots for incoming call text
  useEffect(() => {
    if (incomingCall) {
      const interval = setInterval(() => {
        setDots((prev) => {
          if (prev === ".") return "..";
          if (prev === "..") return "...";
          return ".";
        });
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setDots(".");
    }
  }, [incomingCall]);

  const handleAccept = () => {
    if (!incomingCall) return;

    // Trigger the global accept function from VideoCallModal
    if ((window as any).acceptVideoCall) {
      (window as any).acceptVideoCall(
        incomingCall.fromUserId,
        incomingCall.fromUsername
      );
    }
    setIncomingCall(null);
  };

  const handleDecline = () => {
    if (!incomingCall || !socket) return;

    socket.emit("videoCallDeclined", incomingCall.fromUserId);
    setIncomingCall(null);
  };

  if (!incomingCall) return null;

  // Resolve avatar from user map by ID first, else by username fallback
  const callerUser = incomingCall.fromUserId
    ? userMap[incomingCall.fromUserId]
    : Object.values(userMap).find(
        (u) => u.username === incomingCall.fromUsername
      );
  const avatarUrl =
    callerUser?.avatar ||
    `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
      incomingCall.fromUsername
    )}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-white rounded-lg shadow-2xl p-6 w-60">
        <div className="flex flex-col items-center mb-6">
          <p className="text-sm text-gray-600 mb-4">
            Incoming video call{dots}
          </p>

          {/* Caller Avatar */}
          <img
            src={avatarUrl}
            alt={`${incomingCall.fromUsername} avatar`}
            className="w-24 h-24 rounded-full mb-3 object-cover shadow-md ring-2 ring-[#252524]/20"
            draggable={false}
          />

          <p className="font-semibold text-gray-900 text-lg">
            {incomingCall.fromUsername}
          </p>
        </div>

        <div className="flex gap-8 justify-center">
          <button
            onClick={handleAccept}
            className="w-16 h-16 flex items-center justify-center bg-green-600 hover:bg-green-700 text-white rounded-full transition-colors"
          >
            <CallIcon className="text-3xl" />
          </button>
          <button
            onClick={handleDecline}
            className="w-16 h-16 flex items-center justify-center bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
          >
            <CallEndIcon className="text-3xl" />
          </button>
        </div>
      </div>
    </div>
  );
}
