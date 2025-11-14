"use client";

import React from "react";
import { AVATARS } from "@/utils/avatars";

interface ProfileImageSelectorProps {
  onSelect: (avatar: string) => void;
  selected?: string;
}

export default function ProfileImageSelector({
  onSelect,
  selected,
}: ProfileImageSelectorProps) {
  return (
    <div className="mt-6">
      <label className="block text-sm font-medium text-gray-700 mb-4">
        Choose your profile avatar:
      </label>
      <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
        {AVATARS.map((avatar) => (
          <button
            key={avatar.id}
            onClick={() => onSelect(avatar.emoji)}
            className={`flex items-center justify-center w-16 h-16 rounded-lg text-3xl transition-all border-2 ${
              selected === avatar.emoji
                ? "border-blue-500 bg-blue-50 scale-110"
                : "border-gray-300 bg-white hover:border-blue-300"
            }`}
            title={avatar.label}
          >
            {avatar.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
