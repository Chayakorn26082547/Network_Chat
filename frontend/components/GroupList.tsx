"use client";

import React, { useEffect, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import GroupsIcon from "@mui/icons-material/Groups";
import AddIcon from "@mui/icons-material/Add";

interface Group {
  id: string;
  name: string;
  creatorId: string;
  creatorUsername: string;
  members: string[]; // Array of user IDs
  createdAt: number;
}

interface User {
  id: string;
  username: string;
  socketId: string;
}

interface GroupListProps {
  onGroupClick?: (group: Group) => void;
  onCreateGroup?: () => void;
}

export default function GroupList({
  onGroupClick,
  onCreateGroup,
}: GroupListProps) {
  const { socket, connected } = useSocket();
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    const savedUsername = localStorage.getItem("chatUsername");

    const handleGroupList = (groupList: Group[]) => {
      console.log("Received group list:", groupList);
      setGroups(groupList);
    };

    const handleGroupCreated = (group: Group) => {
      console.log("New group created:", group);
      setGroups((prev) => [...prev, group]);
    };

    const handleGroupJoined = (data: {
      groupId: string;
      userId: string;
      username: string;
      group: Group;
    }) => {
      console.log("User joined group:", data);
      setGroups((prev) =>
        prev.map((g) => (g.id === data.groupId ? data.group : g))
      );
    };

    const handleGroupLeft = (data: {
      groupId: string;
      userId: string;
      username: string;
      group: Group;
    }) => {
      console.log("User left group:", data);
      setGroups((prev) =>
        prev.map((g) => (g.id === data.groupId ? data.group : g))
      );
    };

    const handleGroupDeleted = (groupId: string) => {
      console.log("Group deleted:", groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    };

    const handleUserList = (userList: User[]) => {
      setUsers(userList);
      if (savedUsername) {
        const currentUser = userList.find((u) => u.username === savedUsername);
        if (currentUser) {
          setCurrentUserId(currentUser.id);
        }
      }
    };

    const handleConnect = () => {
      console.log("GroupList: Socket connected, requesting group list");
      socket.emit("getGroupList");
      socket.emit("getUserList");
    };

    socket.on("connect", handleConnect);
    socket.on("groupList", handleGroupList);
    socket.on("groupCreated", handleGroupCreated);
    socket.on("groupJoined", handleGroupJoined);
    socket.on("groupLeft", handleGroupLeft);
    socket.on("groupDeleted", handleGroupDeleted);
    socket.on("userList", handleUserList);

    if (connected) {
      socket.emit("getGroupList");
      socket.emit("getUserList");
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("groupList", handleGroupList);
      socket.off("groupCreated", handleGroupCreated);
      socket.off("groupJoined", handleGroupJoined);
      socket.off("groupLeft", handleGroupLeft);
      socket.off("groupDeleted", handleGroupDeleted);
      socket.off("userList", handleUserList);
    };
  }, [socket, connected]);

  const getMemberNames = (group: Group) => {
    return group.members
      .map((memberId) => {
        const user = users.find((u) => u.id === memberId);
        return user?.username || "Unknown";
      })
      .join(", ");
  };

  const isUserMember = (group: Group) => {
    return currentUserId && group.members.includes(currentUserId);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <GroupsIcon /> Group Chats
        </h2>
        <button
          onClick={onCreateGroup}
          className="flex items-center gap-2 px-4 py-2 bg-[#252524] text-white rounded-lg hover:bg-gray-700 transition-all"
        >
          <AddIcon /> Create Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No groups yet. Create the first one!
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isMember = isUserMember(group);
            return (
              <div
                key={group.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
                onClick={() => onGroupClick && onGroupClick(group)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg text-gray-800">
                        {group.name}
                      </h3>
                      {isMember && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                          Joined
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Created by:{" "}
                      <span className="font-medium">
                        {group.creatorUsername}
                      </span>
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Members ({group.members.length}): {getMemberNames(group)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <GroupsIcon className="text-gray-400" />
                    <span className="text-sm text-gray-500">
                      {group.members.length}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
