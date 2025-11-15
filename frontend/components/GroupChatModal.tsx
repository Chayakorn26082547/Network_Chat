"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "@/hooks/useSocket";
import SendIcon from "@mui/icons-material/Send";
import GroupsIcon from "@mui/icons-material/Groups";

interface GroupMessage {
  id: string;
  groupId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
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
  const [isMember, setIsMember] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const groupIdRef = useRef(group.id);
  const hasRequestedMessages = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const closeModalCallback = useCallback(() => {
    onClose();
  }, [onClose]);

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

    // Get current user ID and check membership
    const handleUserList = (users: any[]) => {
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
    };

    // Listen for group messages
    const handleGroupMessage = (msg: GroupMessage) => {
      if (msg.groupId === groupIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };

    // Handle previous messages
    const handlePreviousGroupMessages = (data: {
      groupId: string;
      messages: GroupMessage[];
    }) => {
      if (data.groupId === groupIdRef.current) {
        setMessages(data.messages);
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

  const handleJoinGroup = () => {
    if (!socket || !currentUserId) return;
    socket.emit("joinGroup", group.id);
  };

  const handleLeaveGroup = () => {
    if (!socket || !currentUserId) return;
    socket.emit("leaveGroup", group.id);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !inputValue.trim() || !isMember) return;

    socket.emit("groupMessage", {
      groupId: group.id,
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
                    {isSystemMessage ? (
                      <div className="text-xs text-gray-500 italic bg-gray-100 px-4 py-2 rounded-full">
                        {m.text}
                      </div>
                    ) : (
                      <>
                        {!isSent && (
                          <div className="text-xs font-semibold mb-2 text-gray-600">
                            {m.username}
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
            <form onSubmit={handleSend} className="flex items-center gap-3">
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
                disabled={!inputValue.trim()}
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
