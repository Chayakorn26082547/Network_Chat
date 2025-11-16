"use client";

import Navbar from "@/components/Navbar";
import OnlineUsers from "@/components/OnlineUsers";
import PrivateChatModal from "@/components/PrivateChatModal";
import GroupList from "@/components/GroupList";
import GroupChatModal from "@/components/GroupChatModal";
import { useState, useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useRouter } from "next/navigation";

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

export default function ChatPage() {
  const [privateChatUser, setPrivateChatUser] = useState<User | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const { socket } = useSocket();
  const router = useRouter();

  useEffect(() => {
    // Ensure user is authenticated on page load/refresh
    const savedUsername = localStorage.getItem("chatUsername");

    if (!savedUsername) {
      // No username saved, redirect to home
      router.push("/");
      return;
    }

    if (!socket) return;

    console.log("Chat page: Re-authenticating user:", savedUsername);
    const savedAvatar = localStorage.getItem("chatAvatar");
    socket.emit("setUsername", {
      username: savedUsername,
      avatar: savedAvatar || undefined,
    });

    // Get current user ID
    const handleUserList = (userList: User[]) => {
      setUsers(userList);
      const currentUser = userList.find((u) => u.username === savedUsername);
      if (currentUser) {
        setCurrentUserId(currentUser.id);
      }
    };

    // Auto-open modal when user joins a group
    const handleGroupJoined = (data: {
      groupId: string;
      userId: string;
      username: string;
      group: Group;
    }) => {
      setCurrentUserId((prevUserId) => {
        if (data.userId === prevUserId) {
          // Current user joined a group - open the modal
          setSelectedGroup(data.group);
        }
        return prevUserId;
      });
    };

    socket.on("userList", handleUserList);
    socket.on("groupJoined", handleGroupJoined);
    socket.emit("getUserList");

    return () => {
      socket.off("userList", handleUserList);
      socket.off("groupJoined", handleGroupJoined);
    };
  }, [socket, router]);

  const handleCreateGroup = () => {
    if (!socket || !newGroupName.trim()) return;

    socket.emit("createGroup", newGroupName.trim());
    setNewGroupName("");
    setShowCreateGroupModal(false);
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          {/* Online Users Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Online Users</h2>
            <OnlineUsers onUserClick={(user) => setPrivateChatUser(user)} />
            <p className="text-center text-gray-500 mt-4">
              Click on any online user to start a private chat
            </p>
          </div>

          {/* Group Chats Section */}
          <div>
            <GroupList
              onGroupClick={(group) => setSelectedGroup(group)}
              onCreateGroup={() => setShowCreateGroupModal(true)}
            />
          </div>
        </div>
      </main>

      {/* Private Chat Modal */}
      {privateChatUser && (
        <PrivateChatModal
          chatWithUser={privateChatUser}
          onClose={() => setPrivateChatUser(null)}
        />
      )}

      {/* Group Chat Modal */}
      {selectedGroup && (
        <GroupChatModal
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
        />
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-slate-500/25 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Create New Group</h3>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Enter group name..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#252524] focus:ring-1 focus:ring-[#252524]/50 mb-4"
              autoFocus
              onKeyPress={(e) => e.key === "Enter" && handleCreateGroup()}
            />
            <div className="flex gap-3">
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
                className="flex-1 px-4 py-2 bg-[#252524] text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateGroupModal(false);
                  setNewGroupName("");
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
