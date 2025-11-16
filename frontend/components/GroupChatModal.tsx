"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "@/hooks/useSocket";
import SendIcon from "@mui/icons-material/Send";
import GroupsIcon from "@mui/icons-material/Groups";
import AttachFileIcon from "@mui/icons-material/AttachFile"; // --- ADDED ---
import CloseIcon from "@mui/icons-material/Close"; // --- ADDED ---

interface GroupMessage {
  id: string;
  groupId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  avatar?: string;
  // --- ADDED ---
  fileData?: string;
  fileName?: string;
  fileType?: string;
}
interface User {
  id: string;
  username: string;
  socketId: string;
  avatar?: string;
}

interface Group {
  id: string;
  name: string;
  creatorId: string;
  creatorUsername: string;
  members: string[];
  createdAt: number;
}

interface GroupChatModalProps {
  group: Group;
  onClose: () => void;
}

export default function GroupChatModal({
  group,
  onClose,
}: GroupChatModalProps) {
  const { socket, connected } = useSocket();
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [file, setFile] = useState<File | null>(null); // --- ADDED ---
  const [isMember, setIsMember] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null); // --- ADDED ---
  const groupIdRef = useRef(group.id);
  const hasRequestedMessages = useRef(false);
  const didInitialScroll = useRef(false);
  const [userMap, setUserMap] = useState<Record<string, User>>({});
  const [usersById, setUsersById] = useState<Record<string, User>>({});
  const currentAvatar =
    (typeof window !== "undefined" && localStorage.getItem("chatAvatar")) ||
    undefined;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const closeModalCallback = useCallback(() => {
    onClose();
  }, [onClose]);

  // Remove auto-scroll on every message; handled selectively in handlers

  useEffect(() => {
    const savedUsername = localStorage.getItem("chatUsername");
    if (!savedUsername) {
      onClose();
      return;
    }
    setCurrentUsername(savedUsername);

    if (!socket) return;

    // Get current user ID and check membership
    const handleUserList = (users: User[]) => {
      const currentUser = users.find((u) => u.username === savedUsername);
      if (currentUser) {
        setCurrentUserId(currentUser.id);
        const isMemberNow = group.members.includes(currentUser.id);
        setIsMember(isMemberNow);

        // Request messages only once if we're a member and haven't requested yet
        if (isMemberNow && !hasRequestedMessages.current) {
          hasRequestedMessages.current = true;
          socket.emit("getPreviousGroupMessages", groupIdRef.current);
        }
      }
      const byName: Record<string, User> = {};
      const byId: Record<string, User> = {};
      users.forEach((u) => {
        byName[u.username] = u;
        byId[u.id] = u;
      });
      setUserMap(byName);
      setUsersById(byId);
    };

    // Listen for group messages
    const handleGroupMessage = (msg: GroupMessage) => {
      // --- ADDED: Log to debug
      console.log("RECEIVED 'groupMessage' EVENT:", msg);

      if (msg.groupId === groupIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        // Only auto-scroll when YOU sent a text message
        if (
          msg.groupId === groupIdRef.current &&
          currentUserId &&
          msg.userId === currentUserId &&
          msg.text &&
          msg.text.trim().length > 0
        ) {
          setTimeout(scrollToBottom, 0);
        }
      }
    };

    // Handle previous messages
    const handlePreviousGroupMessages = (data: {
      groupId: string;
      messages: GroupMessage[];
    }) => {
      if (data.groupId === groupIdRef.current) {
        setMessages(data.messages);
        if (!didInitialScroll.current) {
          setTimeout(() => {
            scrollToBottom();
            didInitialScroll.current = true;
          }, 0);
        }
      }
    };

    // Handle group updates
    const handleGroupJoined = (data: {
      groupId: string;
      userId: string;
      username: string;
      group: Group;
    }) => {
      if (data.groupId === groupIdRef.current) {
        // Update local group membership
        setCurrentUserId((prevUserId) => {
          if (data.group.members.includes(prevUserId || "")) {
            setIsMember(true);
            // Request messages when we join (only if we haven't already)
            if (!hasRequestedMessages.current && data.userId === prevUserId) {
              hasRequestedMessages.current = true;
              socket.emit("getPreviousGroupMessages", groupIdRef.current);
            }
          }
          return prevUserId;
        });
      }
    };

    const handleGroupLeft = (data: {
      groupId: string;
      userId: string;
      username: string;
      group: Group;
    }) => {
      if (data.groupId === groupIdRef.current) {
        setCurrentUserId((prevUserId) => {
          if (data.userId === prevUserId) {
            // Current user left - close the modal (use timeout to avoid setState during render)
            setTimeout(() => closeModalCallback(), 0);
          }
          return prevUserId;
        });
      }
    };

    const handleGroupDeleted = (groupId: string) => {
      if (groupId === groupIdRef.current) {
        // Group was deleted - close the modal (use timeout to avoid setState during render)
        setTimeout(() => closeModalCallback(), 0);
      }
    };

    const handleConnect = () => {
      socket.emit("getUserList");
    };

    socket.on("connect", handleConnect);
    socket.on("userList", handleUserList);
    socket.on("groupMessage", handleGroupMessage);
    socket.on("previousGroupMessages", handlePreviousGroupMessages);
    socket.on("groupJoined", handleGroupJoined);
    socket.on("groupLeft", handleGroupLeft);
    socket.on("groupDeleted", handleGroupDeleted);

    socket.emit("getUserList");

    return () => {
      socket.off("connect", handleConnect);
      socket.off("userList", handleUserList);
      socket.off("groupMessage", handleGroupMessage);
      socket.off("previousGroupMessages", handlePreviousGroupMessages);
      socket.off("groupJoined", handleGroupJoined);
      socket.off("groupLeft", handleGroupLeft);
      socket.off("groupDeleted", handleGroupDeleted);
    };
  }, [socket, closeModalCallback]);

  // --- ADDED ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = "";
  };

  // --- ADDED ---
  const removeFile = () => {
    setFile(null);
  };

  const handleJoinGroup = () => {
    if (!socket || !currentUserId) return;
    socket.emit("joinGroup", group.id);
  };

  const handleLeaveGroup = () => {
    if (!socket || !currentUserId) return;
    socket.emit("leaveGroup", group.id);
  };

  // --- UPDATED ---
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || (!inputValue.trim() && !file) || !isMember) return;

    if (file) {
      // If there's a file, read it as Data URL (base64)
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileData = e.target?.result as string;
        socket.emit("groupMessage", {
          groupId: group.id,
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
      socket.emit("groupMessage", {
        groupId: group.id,
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
          <div className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <GroupsIcon className="text-white" />
              <div>
                <h2 className="text-xl font-bold text-[#f8f8f8]">
                  {group.name}
                </h2>
                <p className="text-xs text-gray-300">
                  {group.members.length} member(s) • Created by{" "}
                  {group.creatorUsername}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isMember && (
                <button
                  onClick={handleLeaveGroup}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-all"
                >
                  Leave Group
                </button>
              )}
              <button
                onClick={onClose}
                className="text-[#f8f8f8] hover:text-white transition-all"
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
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
          {!isMember ? (
            <div className="flex flex-col items-center justify-center h-full">
              <GroupsIcon className="text-gray-300 text-6xl mb-4" />
              <p className="text-gray-400 text-sm mb-4">
                You need to join this group to see messages
              </p>
              <button
                onClick={handleJoinGroup}
                className="px-6 py-3 bg-[#252524] text-white rounded-lg hover:bg-gray-700 transition-all"
              >
                Join Group
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-sm">
                No messages yet. Start the conversation!
              </p>
            </div>
          ) : (
            <>
              {messages.map((m) => {
                const isSent = m.username === currentUsername;
                const time = new Date(m.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const isSystemMessage = m.userId === "system";
                const isImage = m.fileType && m.fileType.startsWith("image/");

                const sender = m.userId ? usersById[m.userId] : undefined;
                const avatar =
                  m.avatar ||
                  (isSent
                    ? currentAvatar
                    : sender?.avatar || userMap[m.username]?.avatar) ||
                  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
                    m.username
                  )}`;

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      isSystemMessage
                        ? "items-center"
                        : isSent
                        ? "items-end"
                        : "items-start"
                    }`}
                  >
                    {/* SYSTEM MESSAGE */}
                    {isSystemMessage ? (
                      <div className="text-xs text-gray-500 italic bg-gray-100 px-4 py-2 rounded-full">
                        {m.text}
                      </div>
                    ) : (
                      <>
                        {/* avatar + bubble row */}
                        <div
                          className={`flex items-end gap-2 max-w-full ${
                            isSent ? "flex-row-reverse" : "flex-row"
                          }`}
                        >
                          <img
                            src={avatar}
                            alt={`${m.username} avatar`}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />

                          {/* MESSAGE BUBBLE */}
                          <div
                            className={`max-w-sm px-5 py-3 rounded-2xl text-sm leading-relaxed ${
                              isSent
                                ? "bg-[#252524] text-white rounded-br-none"
                                : "bg-gray-200 text-gray-900 rounded-bl-none"
                            }`}
                          >
                            {/* FILE PREVIEW */}
                            {m.fileData && (
                              <div className={m.text ? "mb-2" : ""}>
                                {isImage ? (
                                  <img
                                    src={m.fileData}
                                    alt={m.fileName || "Uploaded image"}
                                    className="rounded-lg max-w-xs max-h-60 object-cover cursor-pointer"
                                    onClick={() =>
                                      window.open(m.fileData, "_blank")
                                    }
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

                            {/* TEXT MESSAGE */}
                            {m.text && <div>{m.text}</div>}
                          </div>
                        </div>

                        {/* TIMESTAMP BELOW BUBBLE */}
                        <div
                          className={`text-[10px] opacity-50 mt-1 ${
                            isSent ? "text-right pr-10" : "text-left pl-10"
                          }`}
                        >
                          {time}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        {isMember && (
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
                placeholder={`Message ${group.name}...`}
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
        )}
      </div>
    </div>
  );
}
