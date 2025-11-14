"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";

export default function Home() {
  const router = useRouter();
  const { socket, connected } = useSocket();
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Check if user has already set a username
    const savedUsername = localStorage.getItem("chatUsername");
    if (savedUsername) {
      setUsername(savedUsername);
      setIsLoading(false);
      // Redirect to chat page after a short delay
      const timer = setTimeout(() => {
        router.push("/chat");
      }, 500);
      return () => clearTimeout(timer);
    }
    setIsLoading(false);
  }, [router]);

  const handleSetUsername = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!inputValue.trim()) {
      setError("Please enter a username");
      return;
    }

    if (inputValue.trim().length < 2) {
      setError("Username must be at least 2 characters");
      return;
    }

    if (inputValue.trim().length > 20) {
      setError("Username must be less than 20 characters");
      return;
    }

    // Save username to localStorage
    const trimmedUsername = inputValue.trim();
    localStorage.setItem("chatUsername", trimmedUsername);
    setUsername(trimmedUsername);

    // Emit username to server via socket
    if (socket) {
      socket.emit("setUsername", trimmedUsername);
    }

    // Redirect to chat page
    router.push("/chat");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen ">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (username) {
    return (
      <div className="flex items-center justify-center min-h-screen ">
        <div className="text-white text-xl">Welcome back, {username}!</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center bg-[#f8f8f8] min-h-screen ">
      <div className="w-full max-w-md px-8">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-center text-[#252524] mb-2">
            Welcome to Chat
          </h1>
          <p className="text-center text-[#252524]/50 mb-8">
            What's your username?
          </p>

          <form onSubmit={handleSetUsername} className="space-y-4">
            <div>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setError("");
                }}
                placeholder="Enter your username"
                maxLength={20}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#252524] transition"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                {inputValue.length}/20 characters
              </p>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="w-full bg-[#252524]  text-white font-semibold py-2 rounded-lg hover:from-blue-600 hover:to-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Chatting
            </button>
          </form>

          {!connected && (
            <p className="text-center text-yellow-600 text-sm mt-4">
              ⚠️ Connecting to server...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
