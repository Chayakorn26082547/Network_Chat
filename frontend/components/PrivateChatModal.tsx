"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import SendIcon from "@mui/icons-material/Send";
import VideocamIcon from "@mui/icons-material/Videocam";
import AttachFileIcon from "@mui/icons-material/AttachFile"; // --- ADDED ---
import CloseIcon from "@mui/icons-material/Close"; // --- ADDED ---

interface PrivateMessage {
  id: string;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  text: string;
  timestamp: number;
  // --- ADDED ---
  fileData?: string;
  fileName?: string;
  fileType?: string;
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
  const [file, setFile] = useState<File | null>(null); // --- ADDED ---
  const modalRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null); // --- ADDED ---
  const hasRequestedMessages = useRef(false);
  const chatWithUserIdRef = useRef(chatWithUser.id);

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
    // Reset the "requested" flag only when switching to a different chat
    if (chatWithUserIdRef.current !== chatWithUser.id) {
      chatWithUserIdRef.current = chatWithUser.id;
      hasRequestedMessages.current = false;
    }

    // Get current user ID
    const handleUserList = (users: User[]) => {
      const currentUser = users.find((u) => u.username === savedUsername);
      if (currentUser) {
        setCurrentUserId(currentUser.id);
      }
    };

    socket.on("userList", handleUserList);
    socket.emit("getUserList");

    // Listen for new private messages
    const handlePrivateMessage = (msg: PrivateMessage) => {
      // Check if this message is part of the conversation
      const isPartOfConversation =
        (msg.fromUsername === savedUsername &&
          msg.toUsername === chatWithUser.username) ||
        (msg.fromUsername === chatWithUser.username &&
          msg.toUsername === savedUsername);

      if (isPartOfConversation) {
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some((m) => m.id === msg.id)) {
            return prev;
          }
          return [...prev, msg];
        });
      }
    };

    const handlePreviousPrivateMessages = (data: {
      chatWithUserId: string;
      messages: PrivateMessage[];
    }) => {
      if (data.chatWithUserId === chatWithUser.id) {
        setMessages((prev) => {
          // Avoid replacing messages with an identical payload (prevents unnecessary rerenders/scroll)
          if (
            prev.length === data.messages.length &&
            prev.every((m, i) => m.id === data.messages[i].id)
          ) {
            return prev;
          }
          return data.messages;
        });
      }
    };

    const handleConnect = () => {
      setTimeout(() => {
        if (!hasRequestedMessages.current) {
          hasRequestedMessages.current = true;
          socket.emit("getPreviousPrivateMessages", chatWithUser.id);
        }
      }, 100);
    };

    socket.on("connect", handleConnect);
    socket.on("privateMessage", handlePrivateMessage);
    socket.on("previousPrivateMessages", handlePreviousPrivateMessages);

    // Request previous messages on initial mount (only once)
    if (!hasRequestedMessages.current) {
      hasRequestedMessages.current = true;
      socket.emit("getPreviousPrivateMessages", chatWithUser.id);
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("privateMessage", handlePrivateMessage);
      socket.off("previousPrivateMessages", handlePreviousPrivateMessages);
      socket.off("userList", handleUserList);
    };
  }, [socket, connected, chatWithUser.id, chatWithUser.username, onClose]);

  // --- ADDED ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
    e.target.value = "";
  };

  // --- ADDED ---
  const removeFile = () => {
    setFile(null);
  };

  // --- UPDATED ---
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || (!inputValue.trim() && !file)) return;

    if (file) {
      // If there's a file, read it as Data URL (base64)
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileData = e.target?.result as string;
        socket.emit("privateMessage", {
          toUserId: chatWithUser.id,
          text: inputValue.trim(),
          fileData,
          fileName: file.name,
          fileType: file.type,
        });
        // Reset inputs
        setFile(null);
        setInputValue("");
      };
      reader.onerror = (error) => {
        console.error("Error reading file:", error);
      };
      reader.readAsDataURL(file);
    } else {
      // No file, just send text
      socket.emit("privateMessage", {
        toUserId: chatWithUser.id,
        text: inputValue.trim(),
      });
      setInputValue("");
    }
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
          <div className="absolute top-4 right-15 flex items-center gap-2">
            <button
              onClick={() => {
                // Trigger global video call starter
                try {
                  (window as any).startVideoCall(
                    chatWithUser.id,
                    chatWithUser.username
                  );
                } catch (e) {
                  console.error("startVideoCall not available", e);
                }
              }}
              title="Start video call"
              className="text-[#f8f8f8] hover:text-white mr-2"
            >
              <VideocamIcon />
            </button>
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
                // --- ADDED ---
                const isImage = m.fileType && m.fileType.startsWith("image/");

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
                      {/* --- START: UPDATED RENDER LOGIC --- */}
                      {m.fileData && (
                        <div
                          className={
                            m.text ? "mb-2" : "" // Add margin if text follows
                          }
                        >
                          {isImage ? (
                            <img
                              src={m.fileData}
                              alt={m.fileName || "Uploaded image"}
                              className="rounded-lg max-w-xs max-h-60 object-cover cursor-pointer"
                              onClick={() => window.open(m.fileData, "_blank")}
                            />
                          ) : (
                            <a
                              href={m.fileData}
                              download={m.fileName}
                              title={m.fileName}
                              className={`flex items-center gap-2 p-2 rounded-lg ${
                                isSent
                                  ? "bg-white/10 hover:bg-white/20"
                                  : "bg-black/10 hover:bg-black/20"
                              } transition-all`}
                            >
                              <span className="text-sm font-medium truncate max-w-xs">
                                {m.fileName || "Attached File"}
                              </span>
                            </a>
                          )}
                        </div>
                      )}
                      {/* Render text if it exists */}
                      {m.text && <div>{m.text}</div>}
                      {/* --- END: UPDATED RENDER LOGIC --- */}
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
          {/* --- ADDED: File Preview --- */}
          {file && (
            <div className="px-3 pb-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 truncate max-w-xs">
                Attaching: <strong>{file.name}</strong>
              </span>
              <button
                onClick={removeFile}
                className="p-1 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-200"
                title="Remove file"
              >
                <CloseIcon fontSize="small" />
              </button>
            </div>
          )}
          <form onSubmit={handleSend} className="flex items-center gap-3">
            {/* --- ADDED: File Input Button --- */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-full text-gray-600 hover:bg-gray-200 transition-all"
              title="Attach file"
            >
              <AttachFileIcon />
            </button>
            {/* --- ADDED: Hidden File Input --- */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
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
              disabled={!inputValue.trim() && !file} // --- UPDATED ---
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
