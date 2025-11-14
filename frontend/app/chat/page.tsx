"use client";

import Navbar from "@/components/Navbar";
import OnlineUsers from "@/components/OnlineUsers";

export default function ChatPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white">
        <div className="pl-10 pt-10 text-xl">Online User</div>
        <OnlineUsers />
        <div className="px-4 py-10 text-center text-gray-500">
          This page contains the list of online users. Use the Chat button in
          the navbar to open the chat modal.
        </div>
      </main>
    </>
  );
}
