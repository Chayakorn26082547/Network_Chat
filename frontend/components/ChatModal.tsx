"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import SendIcon from "@mui/icons-material/Send";
import AttachFileIcon from "@mui/icons-material/AttachFile"; // --- ADDED ---
import CloseIcon from "@mui/icons-material/Close"; // --- ADDED ---

interface Message {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  // --- ADDED file fields ---
  fileData?: string; // Base64 data URL
  fileName?: string;
  fileType?: string;
}

export default function ChatModal({ onClose }: { onClose: () => void }) {
  const { socket, connected } = useSocket();
  const [username, setUsername] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [file, setFile] = useState<File | null>(null); // --- ADDED ---
  const modalRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null); // --- ADDED ---

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem("chatUsername")
        : null;
    if (!saved) {
      // If there's no username, close the modal
      onClose();
      return;
    }
    setUsername(saved);

    if (!socket) return;

    const handleMessage = (m: Message) => setMessages((prev) => [...prev, m]);
    const handlePreviousMessages = (prev: Message[]) => setMessages(prev);

    const handleConnect = () => {
      console.log("World chat reconnected, reloading messages...");
      socket.emit("getPreviousMessages");
    };

    socket.on("connect", handleConnect);
    socket.on("message", handleMessage);
    socket.on("previousMessages", handlePreviousMessages);

    // Initial load or when connected
    if (connected) {
      socket.emit("getPreviousMessages");
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("message", handleMessage);
      socket.off("previousMessages", handlePreviousMessages);
    };
  }, [socket, connected, onClose]);

  // --- ADDED ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // Optional: Add file size validation here
      // if (selectedFile.size > 5 * 1024 * 1024) { // 5MB limit
      //   alert("File is too large! (Limit 5MB)");
      //   return;
      // }
      setFile(selectedFile);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = "";
  };

  // --- ADDED ---
  const removeFile = () => {
    setFile(null);
  };

  // --- UPDATED ---
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    // Check if there's either text or a file to send
    if (!socket || (!inputValue.trim() && !file) || !username) return;

    if (file) {
      // If there's a file, read it as Data URL (base64)
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileData = e.target?.result as string;
        socket.emit("message", {
          username,
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
        alert("Error reading file. Please try again.");
      };
      reader.readAsDataURL(file);
    } else {
      // No file, just send text
      socket.emit("message", { username, text: inputValue.trim() });
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
        <div className="bg-[#252524]  p-5 border-b border-blue-200">
          <h2 className="text-xl font-bold text-[#f8f8f8]">World Chat</h2>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-sm">
                No messages yet. Start the conversation!
              </p>
            </div>
          ) : (
            messages.map((m) => {
              console.log("MESSAGE FROM SOCKET:", m);
              const isSent = m.username === username;
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
                    {/* --- UPDATED: Render file if it exists --- */}
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
                            {/* You could add a DownloadIcon here */}
                          </a>
                        )}
                      </div>
                    )}
                    {/* Render text if it exists */}
                    {m.text && <div>{m.text}</div>}
                  </div>
                  <div className="text-xs mt-1 opacity-50 text-gray-600">
                    {time}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
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
              placeholder="Message..."
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
