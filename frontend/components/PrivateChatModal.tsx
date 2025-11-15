"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import SendIcon from "@mui/icons-material/Send";

interface PrivateMessage {
  id: string;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  text: string;
  timestamp: number;
}

interface User {
  id: string;
  username: string;
  socketId: string;
}

interface PrivateChatModalProps {
  chatWithUser: User;
  onClose: () => void;
}

export default function PrivateChatModal({
  chatWithUser,
  onClose,
}: PrivateChatModalProps) {
  const { socket, connected } = useSocket();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const modalRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const savedUsername = localStorage.getItem("chatUsername");
    if (!savedUsername) {
      onClose();
      return;
    }
    setCurrentUsername(savedUsername);

    if (!socket) return;

    // Get current user ID
    const handleUserList = (users: User[]) => {
      const currentUser = users.find((u) => u.username === savedUsername);
      if (currentUser) {
        setCurrentUserId(currentUser.id);
        console.log("Current user ID set:", currentUser.id);
      }
    };

    socket.on("userList", handleUserList);
    socket.emit("getUserList");

    // Listen for new private messages
    const handlePrivateMessage = (msg: PrivateMessage) => {
      console.log("Received private message:", msg);
      console.log(
        "Current user:",
        savedUsername,
        "Chat with:",
        chatWithUser.username
      );

      // Check if this message is part of the conversation between current user and chatWithUser
      const isPartOfConversation =
        (msg.fromUsername === savedUsername &&
          msg.toUsername === chatWithUser.username) ||
        (msg.fromUsername === chatWithUser.username &&
          msg.toUsername === savedUsername);

      console.log("Is part of conversation:", isPartOfConversation);

      if (isPartOfConversation) {
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some((m) => m.id === msg.id)) {
            console.log("Message already exists, skipping");
            return prev;
          }
          console.log("Adding message to chat");
          return [...prev, msg];
        });
      } else {
        console.log("Message not part of this conversation, ignoring");
      }
    };

    const handlePreviousPrivateMessages = (data: {
      chatWithUserId: string;
      messages: PrivateMessage[];
    }) => {
      console.log("Received previous messages:", data);
      console.log(
        "Expected chatWithUserId:",
        chatWithUser.id,
        "Received:",
        data.chatWithUserId
      );
      console.log("Number of messages:", data.messages.length);

      if (data.chatWithUserId === chatWithUser.id) {
        console.log("Setting", data.messages.length, "messages to state");
        setMessages(data.messages);
      } else {
        console.log("User ID mismatch - not setting messages");
      }
    };

    const handleConnect = () => {
      console.log(
        "Private chat reconnected, reloading messages with",
        chatWithUser.username
      );
      // Small delay to ensure socket is ready
      setTimeout(() => {
        socket.emit("getPreviousPrivateMessages", chatWithUser.id);
      }, 100);
    };

    socket.on("connect", handleConnect);
    socket.on("privateMessage", handlePrivateMessage);
    socket.on("previousPrivateMessages", handlePreviousPrivateMessages);

    // Request previous messages with this user (initial load or reconnect)
    console.log(
      "Requesting previous private messages for",
      chatWithUser.username,
      "ID:",
      chatWithUser.id
    );
    socket.emit("getPreviousPrivateMessages", chatWithUser.id);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("privateMessage", handlePrivateMessage);
      socket.off("previousPrivateMessages", handlePreviousPrivateMessages);
      socket.off("userList", handleUserList);
    };
  }, [socket, connected, chatWithUser.id, chatWithUser.username, onClose]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !inputValue.trim()) return;

    console.log(
      "Sending private message to:",
      chatWithUser.id,
      "text:",
      inputValue.trim()
    );

    socket.emit("privateMessage", {
      toUserId: chatWithUser.id,
      text: inputValue.trim(),
    });

    setInputValue("");
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) onClose();
  };

  return (
    <div
      ref={modalRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-slate-500/25 flex items-center justify-center z-50"
    >
      <div className="bg-white w-full max-w-2xl h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="bg-[#252524] p-5 border-b border-blue-200">
          <h2 className="text-xl font-bold text-[#f8f8f8]">
            Chat with {chatWithUser.username}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            <span className="text-xs text-gray-300">Online</span>
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-sm">
                No messages yet. Start a conversation with{" "}
                {chatWithUser.username}!
              </p>
            </div>
          ) : (
            <>
              {messages.map((m) => {
                const isSent = m.fromUsername === currentUsername;
                const time = new Date(m.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      isSent ? "items-end" : "items-start"
                    }`}
                  >
                    {!isSent && (
                      <div className="text-xs font-semibold mb-2 text-gray-600">
                        {m.fromUsername}
                      </div>
                    )}
                    <div
                      className={`max-w-sm px-5 py-3 rounded-2xl text-sm leading-relaxed ${
                        isSent
                          ? "bg-[#252524] text-white rounded-br-none"
                          : "bg-gray-200 text-gray-900 rounded-bl-none"
                      }`}
                    >
                      <div>{m.text}</div>
                    </div>
                    <div className="text-xs mt-1 opacity-50 text-gray-600">
                      {time}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-gray-50 border-t border-gray-200 py-5 px-3">
          <form onSubmit={handleSend} className="flex items-center gap-3">
            <input
              type="text"
              className="flex-1 px-5 py-3 rounded-full border border-gray-300 focus:outline-none focus:border-[#252524] focus:ring-1 focus:ring-[#252524]/50 text-sm placeholder-gray-400"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`Message ${chatWithUser.username}...`}
              autoFocus
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="p-3 rounded-full bg-[#252524] text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <SendIcon />
            </button>
          </form>
        </div>

        {/* Close button (top right) */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#f8f8f8] hover:text-white z-10"
          title="Close"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
