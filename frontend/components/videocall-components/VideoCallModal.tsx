"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import SimplePeer from "simple-peer";
import CallIcon from "@mui/icons-material/Call";
import VideoCallControls from "@/components/videocall-components/VideoCallControls";

interface IncomingCall {
  fromUserId: string;
  fromUsername: string;
}

interface User {
  id: string;
  username: string;
  socketId: string;
  avatar?: string;
}

export default function VideoCallModal() {
  const { socket } = useSocket();

  const [isOpen, setIsOpen] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [isCaller, setIsCaller] = useState(false);
  const [remoteUsername, setRemoteUsername] = useState<string | null>(null);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [dots, setDots] = useState(".");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [userMap, setUserMap] = useState<Record<string, User>>({});

  // store incoming SimplePeer signals before peer is created (callee side)
  const pendingSignalsRef = useRef<any[]>([]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<any>(null); // SimplePeer instance (typed as any to avoid TS hell)

  // ------------------ TURN / STUN ------------------

  const fetchIceServers = async () => {
    try {
      const backendBase =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const cleanBase = backendBase.replace(/\/$/, "");

      const res = await fetch(`${cleanBase}/turn-token`);
      if (!res.ok) throw new Error("Failed to fetch TURN token");
      const data = await res.json();

      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        console.log(
          "[VideoCall] Using ICE servers from backend:",
          data.iceServers
        );
        return data.iceServers;
      }

      console.warn(
        "[VideoCall] Backend returned no iceServers, fallback to STUN"
      );
    } catch (e) {
      console.error(
        "[VideoCall] Error fetching TURN token, fallback to STUN:",
        e
      );
    }

    return [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];
  };

  // ------------------ MEDIA ------------------

  const getLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    return stream;
  };

  // ------------------ PEER CREATION ------------------

  const createPeer = async (initiator: boolean, targetUserId: string) => {
    const iceServers = await fetchIceServers();
    const stream = await getLocalStream();

    console.log("[SimplePeer] Creating peer. initiator:", initiator);

    const peer = new SimplePeer({
      initiator,
      trickle: false, // easier to debug; all ICE in one signal
      stream,
      config: { iceServers },
    });

    peer.on("signal", (signalData: any) => {
      console.log("[SimplePeer] signal generated, sending via videoOffer");
      // Reuse your existing "videoOffer" event for ALL signals (offer/answer/ICE)
      socket?.emit("videoOffer", {
        toUserId: targetUserId,
        offer: signalData,
      });
    });

    peer.on("stream", (remoteStream: MediaStream) => {
      console.log("[SimplePeer] Remote stream received");
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    });

    peer.on("connect", () => {
      console.log("[SimplePeer] Peer connected");
      setIsInCall(true);
    });

    peer.on("error", (err: any) => {
      console.error("[SimplePeer] Error:", err);
      endCall();
    });

    peer.on("close", () => {
      console.log("[SimplePeer] Peer closed");
      endCall();
    });

    peerRef.current = peer;
    return peer;
  };

  // ------------------ CALLER FLOW ------------------

  const startAsCaller = async (toUserId: string, toUsername?: string) => {
    console.log("[VideoCall] Starting as caller to", toUserId);
    setIsOpen(true);
    setIsCaller(true);
    setRemoteUserId(toUserId);
    setRemoteUsername(toUsername || null);

    // ring first
    socket?.emit("videoCallRequest", toUserId);

    // small delay so callee UI shows "Incoming call" before signals arrive
    setTimeout(async () => {
      await createPeer(true, toUserId);
    }, 300);
  };

  // expose global startVideoCall(toUserId, username?)
  useEffect(() => {
    (window as any).startVideoCall = (
      toUserId: string,
      toUsername?: string
    ) => {
      startAsCaller(toUserId, toUsername);
    };

    return () => {
      try {
        delete (window as any).startVideoCall;
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // ------------------ ANSWERER FLOW ------------------

  const acceptIncoming = async (fromUserId?: string, fromUsername?: string) => {
    const userId = fromUserId || incomingCall?.fromUserId;
    if (!userId) return;

    console.log("[VideoCall] Accepting incoming call from", userId);

    setIsCaller(false);
    setIncomingCall(null);
    setIsOpen(true);
    setRemoteUserId(userId);
    setRemoteUsername(fromUsername || incomingCall?.fromUsername || null);

    // create non-initiator peer
    const peer = await createPeer(false, userId);

    // feed any pending SimplePeer signals we buffered while waiting for Accept
    if (pendingSignalsRef.current.length > 0) {
      console.log(
        "[SimplePeer] Feeding pending signals:",
        pendingSignalsRef.current.length
      );
      pendingSignalsRef.current.forEach((sig) => peer.signal(sig));
      pendingSignalsRef.current = [];
    }
  };

  // expose global acceptVideoCall(fromUserId, username?)
  useEffect(() => {
    (window as any).acceptVideoCall = (
      fromUserId: string,
      fromUsername?: string
    ) => {
      acceptIncoming(fromUserId, fromUsername);
    };

    return () => {
      try {
        delete (window as any).acceptVideoCall;
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, incomingCall]);

  const declineIncoming = () => {
    if (incomingCall && socket && incomingCall.fromUserId) {
      socket.emit("videoCallDeclined", incomingCall.fromUserId);
    }
    setIncomingCall(null);
    pendingSignalsRef.current = [];
    setIsOpen(false);
  };

  // ------------------ END / HANGUP ------------------

  const cleanupMediaAndPeer = () => {
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {
        // ignore
      }
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    pendingSignalsRef.current = [];
  };

  const endCall = () => {
    console.log("[VideoCall] Ending call");
    cleanupMediaAndPeer();

    setIsInCall(false);
    setIsOpen(false);
    setIsCaller(false);
    setRemoteUserId(null);
    setRemoteUsername(null);
    setIncomingCall(null);
  };

  const hangup = () => {
    if (remoteUserId && socket) {
      socket.emit("videoCallEnded", remoteUserId);
    }
    endCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // ------------------ SOCKET SIGNALING ------------------

  useEffect(() => {
    if (!socket) return;

    // incoming call (ring)
    const handleIncomingCall = (data: IncomingCall) => {
      console.log("[Socket] incomingVideoCall", data);
      setIncomingCall(data);
      setRemoteUserId(data.fromUserId);
      setRemoteUsername(data.fromUsername);
      // Don't auto-open modal - let IncomingCallNotification component handle UI
    };

    // SimplePeer signal forward
    const handleVideoOffer = (data: { fromUserId: string; offer: any }) => {
      console.log("[Socket] videoOffer (SimplePeer signal) received", data);

      // if we already have a peer, pass directly
      if (peerRef.current) {
        peerRef.current.signal(data.offer);
        return;
      }

      // otherwise, buffer until user presses "Accept"
      console.log("[SimplePeer] Buffering signal until Accept");
      pendingSignalsRef.current.push(data.offer);
    };

    const handleCallEnded = (data: { fromUserId: string }) => {
      console.log("[Socket] videoCallEnded from", data.fromUserId);
      endCall();
    };

    const handleCallDeclined = (data: { fromUserId: string }) => {
      console.log("[Socket] videoCallDeclined from", data.fromUserId);
      endCall();
    };

    socket.on("incomingVideoCall", handleIncomingCall);
    socket.on("videoOffer", handleVideoOffer);
    socket.on("videoCallEnded", handleCallEnded);
    socket.on("videoCallDeclined", handleCallDeclined);

    const handleUserList = (users: User[]) => {
      const map: Record<string, User> = {};
      users.forEach((u) => (map[u.id] = u));
      setUserMap(map);
    };
    socket.on("userList", handleUserList);

    // Fetch user list when modal opens or remote user id changes for avatar
    if (isOpen) {
      socket.emit("getUserList");
    }

    return () => {
      socket.off("incomingVideoCall", handleIncomingCall);
      socket.off("videoOffer", handleVideoOffer);
      socket.off("videoCallEnded", handleCallEnded);
      socket.off("videoCallDeclined", handleCallDeclined);
      socket.off("userList", handleUserList);
    };
  }, [socket, isOpen, remoteUserId]);

  // Animate dots when waiting for answer
  useEffect(() => {
    if (isCaller && !isInCall) {
      const interval = setInterval(() => {
        setDots((prev) => {
          if (prev === ".") return "..";
          if (prev === "..") return "...";
          return ".";
        });
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setDots(".");
    }
  }, [isCaller, isInCall]);

  // ------------------ RENDER ------------------

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-5xl h-[80vh] rounded-lg shadow-lg p-4 flex flex-col">
            {/* HEADER */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={
                    (remoteUserId && userMap[remoteUserId]?.avatar) ||
                    (remoteUsername
                      ? `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
                          remoteUsername
                        )}`
                      : "https://api.dicebear.com/7.x/thumbs/svg?seed=connecting")
                  }
                  alt={remoteUsername ? `${remoteUsername} avatar` : "Avatar"}
                  className="w-10 h-10 rounded-full object-cover shadow ring-2 ring-[#252524]/10 flex-shrink-0"
                  draggable={false}
                />
                <h3 className="font-bold truncate">
                  Video Call {remoteUsername ? `with ${remoteUsername}` : ""}
                </h3>
              </div>
            </div>

            {/* VIDEOS */}
            <div className="flex-1 relative bg-black rounded overflow-hidden">
              {/* Remote video (full size) */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />

              {/* Control buttons (bottom right) */}
              <VideoCallControls
                isMuted={isMuted}
                isVideoOff={isVideoOff}
                onToggleMute={toggleMute}
                onToggleVideo={toggleVideo}
                onHangup={hangup}
              />

              {/* Waiting for answer overlay (caller only) */}
              {isCaller && !isInCall && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                  <CallIcon className="text-white text-6xl mb-4 animate-pulse" />
                  <p className="text-white text-xl font-semibold">
                    Waiting for answer{dots}
                  </p>
                  {remoteUsername && (
                    <p className="text-white/80 text-sm mt-2">
                      Calling {remoteUsername}
                    </p>
                  )}
                </div>
              )}

              {/* Local video (picture-in-picture overlay) */}
              <div className="absolute top-4 right-4 w-48 aspect-[4/3] bg-black rounded-lg overflow-hidden shadow-lg border-1 border-white/20">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
