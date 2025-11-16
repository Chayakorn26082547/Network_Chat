"use client";

import React from "react";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import CallEndIcon from "@mui/icons-material/CallEnd";

interface VideoCallControlsProps {
  isMuted: boolean;
  isVideoOff: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onHangup: () => void;
}

export default function VideoCallControls({
  isMuted,
  isVideoOff,
  onToggleMute,
  onToggleVideo,
  onHangup,
}: VideoCallControlsProps) {
  return (
    <div className="absolute bottom-4 right-4 flex gap-3">
      <button
        onClick={onToggleMute}
        className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors shadow-lg ${
          isMuted
            ? "bg-red-600 hover:bg-red-700"
            : "bg-gray-800 hover:bg-gray-900"
        } text-white`}
      >
        {isMuted ? (
          <MicOffIcon className="text-2xl" />
        ) : (
          <MicIcon className="text-2xl" />
        )}
      </button>
      <button
        onClick={onToggleVideo}
        className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors shadow-lg ${
          isVideoOff
            ? "bg-red-600 hover:bg-red-700"
            : "bg-gray-800 hover:bg-gray-900"
        } text-white`}
      >
        {isVideoOff ? (
          <VideocamOffIcon className="text-2xl" />
        ) : (
          <VideocamIcon className="text-2xl" />
        )}
      </button>
      <button
        onClick={onHangup}
        className="w-12 h-12 flex items-center justify-center bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors shadow-lg"
      >
        <CallEndIcon className="text-2xl" />
      </button>
    </div>
  );
}
