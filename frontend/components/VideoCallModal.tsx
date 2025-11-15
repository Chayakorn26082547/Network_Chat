"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";

interface IncomingCall {
  fromUserId: string;
  fromUsername: string;
}

interface PendingOffer {
  fromUserId: string;
  offer: RTCSessionDescriptionInit;
}

export default function VideoCallModal() {
  const { socket } = useSocket();

  const [isOpen, setIsOpen] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [isCaller, setIsCaller] = useState(false);

  const [remoteUsername, setRemoteUsername] = useState<string | null>(null);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);

  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [pendingOffer, setPendingOffer] = useState<PendingOffer | null>(null);

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamStateRef = useRef<MediaStream | null>(null);

  // ---------------------------------------------------------------------------
  // Global starter: window.startVideoCall(toUserId, toUsername?)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    (window as any).startVideoCall = (
      toUserId: string,
      toUsername?: string
    ) => {
      console.log("[VideoCall] startVideoCall called", {
        toUserId,
        toUsername,
      });

      setIsOpen(true);
      setIsCaller(true);
      setRemoteUserId(toUserId);
      setRemoteUsername(toUsername || null);

      // Notify callee to show incoming call UI
      socket.emit("videoCallRequest", toUserId);

      // Start call after a short delay so callee has time to set up
      setTimeout(() => {
        startAsCaller(toUserId);
      }, 400);
    };

    return () => {
      try {
        delete (window as any).startVideoCall;
      } catch (e) {
        // ignore
      }
    };
  }, [socket]);

  // ---------------------------------------------------------------------------
  // Attach remote stream when it changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("[VideoCall] Attaching remote stream via useEffect");
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // ---------------------------------------------------------------------------
  // Socket event handlers
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    // 1) Callee receives an incoming call notification
    const handleIncoming = (data: IncomingCall) => {
      console.log("[VideoCall] incomingVideoCall", data);
      setIncomingCall(data);
      setIsOpen(true);
      setIsCaller(false);
      setRemoteUserId(data.fromUserId);
      setRemoteUsername(data.fromUsername);
    };

    // 2) Offer: callee receives SDP offer from caller
    const handleVideoOffer = (data: { fromUserId: string; offer: any }) => {
      console.log("[VideoCall] videoOffer received", data);
      // Store full object so we have both fromUserId + offer for acceptIncoming
      setPendingOffer({
        fromUserId: data.fromUserId,
        offer: data.offer,
      });
      if (!remoteUserId) {
        setRemoteUserId(data.fromUserId);
      }
    };

    // 3) Answer: caller receives SDP answer from callee
    const handleVideoAnswer = async (data: {
      fromUserId: string;
      answer: any;
    }) => {
      console.log("[VideoCall] videoAnswer received", data);
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (err) {
        console.error(
          "[VideoCall] Error setting remote description (answer)",
          err
        );
      }
    };

    // 4) ICE candidates
    const handleNewIce = async (data: {
      fromUserId: string;
      candidate: any;
    }) => {
      const pc = pcRef.current;
      if (!pc || !data.candidate) return;
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        console.warn("[VideoCall] Error adding ICE candidate", err);
      }
    };

    // 5) Call ended / declined by remote
    const handleCallEnded = (data: { fromUserId: string }) => {
      console.log("[VideoCall] videoCallEnded from remote", data);
      endCall();
    };

    const handleCallDeclined = (data: { fromUserId: string }) => {
      console.log("[VideoCall] videoCallDeclined from remote", data);
      endCall();
    };

    socket.on("incomingVideoCall", handleIncoming);
    socket.on("videoOffer", handleVideoOffer);
    socket.on("videoAnswer", handleVideoAnswer);
    socket.on("newIceCandidate", handleNewIce);
    socket.on("videoCallEnded", handleCallEnded);
    socket.on("videoCallDeclined", handleCallDeclined);

    return () => {
      socket.off("incomingVideoCall", handleIncoming);
      socket.off("videoOffer", handleVideoOffer);
      socket.off("videoAnswer", handleVideoAnswer);
      socket.off("newIceCandidate", handleNewIce);
      socket.off("videoCallEnded", handleCallEnded);
      socket.off("videoCallDeclined", handleCallDeclined);
    };
  }, [socket, remoteUserId]);

  // ---------------------------------------------------------------------------
  // Media + PeerConnection helpers
  // ---------------------------------------------------------------------------
  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      return stream;
    } catch (e) {
      console.error("[VideoCall] Failed to get local media", e);
      throw e;
    }
  };

  const createPeerConnection = (toUserId: string) => {
    console.log("[VideoCall] Creating RTCPeerConnection to", toUserId);

    const pc = new RTCPeerConnection({
      iceServers: [
        // STUN
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },

        // TURN (free open relay - good for testing / small scale)
        {
          urls: "turn:global.relay.metered.ca:80",
          username: "open",
          credential: "open",
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: "open",
          credential: "open",
        },
      ],
    });

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        console.log("[VideoCall] Sending ICE candidate:", ev.candidate.type);
        socket?.emit("newIceCandidate", {
          toUserId,
          candidate: ev.candidate,
        });
      } else {
        console.log("[VideoCall] All ICE candidates sent");
      }
    };

    pc.ontrack = (ev) => {
      console.log(
        "[VideoCall] Received remote track:",
        ev.track.kind,
        "streams:",
        ev.streams.length
      );

      if (!ev.streams || !ev.streams[0]) return;
      const stream = ev.streams[0];

      console.log(
        "[VideoCall] Setting remote stream with",
        stream.getTracks().length,
        "tracks"
      );

      // Keep in ref (for immediate attach when video mounts)
      remoteStreamStateRef.current = stream;

      // Directly attach if video element ready
      if (remoteVideoRef.current) {
        console.log("[VideoCall] Directly setting srcObject on remote video");
        remoteVideoRef.current.srcObject = stream;
      }

      // Also store in state for React to know
      setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      console.log("[VideoCall] Connection state:", pc.connectionState);
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected" ||
        pc.connectionState === "closed"
      ) {
        console.warn("[VideoCall] Connection failed/disconnected/closed");
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[VideoCall] ICE connection state:", pc.iceConnectionState);
    };

    pcRef.current = pc;
    return pc;
  };

  // ---------------------------------------------------------------------------
  // Caller flow
  // ---------------------------------------------------------------------------
  const startAsCaller = async (toUserId: string) => {
    try {
      console.log("[VideoCall] Starting as caller");
      const stream = await startLocalStream();
      const pc = createPeerConnection(toUserId);

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket?.emit("videoOffer", { toUserId, offer });
      setIsInCall(true);
    } catch (e) {
      console.error("[VideoCall] Error starting as caller", e);
      endCall();
    }
  };

  // ---------------------------------------------------------------------------
  // Answerer flow
  // ---------------------------------------------------------------------------
  const startAsAnswerer = async (
    fromUserId: string,
    remoteOffer: RTCSessionDescriptionInit
  ) => {
    try {
      console.log("[VideoCall] Starting as answerer");
      const stream = await startLocalStream();
      const pc = createPeerConnection(fromUserId);

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket?.emit("videoAnswer", {
        toUserId: fromUserId,
        answer,
      });

      setIsInCall(true);
    } catch (e) {
      console.error("[VideoCall] Error starting as answerer", e);
      endCall();
    }
  };

  // ---------------------------------------------------------------------------
  // Incoming call controls
  // ---------------------------------------------------------------------------
  const acceptIncoming = async () => {
    if (!incomingCall || !pendingOffer) {
      console.warn("[VideoCall] No incoming call or pending offer to accept");
      return;
    }

    console.log("[VideoCall] Accepting incoming call");
    const { fromUserId, offer } = pendingOffer;

    // Clear UI state first
    setIncomingCall(null);
    setPendingOffer(null);
    setIsOpen(true);
    setIsCaller(false);

    await startAsAnswerer(fromUserId, offer);
  };

  const declineIncoming = () => {
    if (incomingCall && socket && incomingCall.fromUserId) {
      console.log("[VideoCall] Declining incoming call");
      socket.emit("videoCallDeclined", incomingCall.fromUserId);
    }
    setIncomingCall(null);
    setPendingOffer(null);
    setIsOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Hang up / cleanup
  // ---------------------------------------------------------------------------
  const endCall = () => {
    console.log("[VideoCall] Ending call locally");
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch (e) {
        // ignore
      }
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    setIsInCall(false);
    setIsOpen(false);
    setIncomingCall(null);
    setPendingOffer(null);
    setIsCaller(false);
    setRemoteUserId(null);
    setRemoteUsername(null);
    setRemoteStream(null);
    remoteStreamStateRef.current = null;
  };

  const hangup = () => {
    console.log("[VideoCall] Hangup clicked");
    if (remoteUserId && socket) {
      socket.emit("videoCallEnded", remoteUserId);
    }
    endCall();
  };

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-3xl h-[80vh] rounded-lg shadow-lg p-4 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold">
                Video Call {remoteUsername ? `with ${remoteUsername}` : ""}
              </h3>
              <div className="flex items-center gap-2">
                {isInCall && (
                  <button
                    onClick={hangup}
                    className="px-3 py-1 bg-red-600 text-white rounded"
                  >
                    Hang up
                  </button>
                )}
                <button
                  onClick={endCall}
                  className="px-3 py-1 bg-gray-200 rounded"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Videos */}
            <div className="flex-1 mt-4 grid grid-cols-2 gap-4">
              <div className="bg-black rounded overflow-hidden flex items-center justify-center">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="bg-black rounded overflow-hidden flex items-center justify-center">
                <video
                  ref={(el) => {
                    remoteVideoRef.current = el;
                    if (el && remoteStreamStateRef.current) {
                      console.log(
                        "[VideoCall] Remote video mounted, attaching waiting stream"
                      );
                      el.srcObject = remoteStreamStateRef.current;
                    }
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Incoming call prompt */}
            {!isInCall && incomingCall && (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm">
                    Incoming call from{" "}
                    <strong>{incomingCall.fromUsername}</strong>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={acceptIncoming}
                    className="px-3 py-2 bg-green-600 text-white rounded"
                  >
                    Accept
                  </button>
                  <button
                    onClick={declineIncoming}
                    className="px-3 py-2 bg-red-600 text-white rounded"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
