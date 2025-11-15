"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import SimplePeer from "simple-peer";

interface IncomingCall {
  fromUserId: string;
  fromUsername: string;
}

export default function VideoCallModal() {
  const { socket } = useSocket();

  const [isOpen, setIsOpen] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [isCaller, setIsCaller] = useState(false);
  const [remoteUsername, setRemoteUsername] = useState<string | null>(null);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

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

  const acceptIncoming = async () => {
    if (!incomingCall || !incomingCall.fromUserId) return;
    const fromUserId = incomingCall.fromUserId;

    console.log("[VideoCall] Accepting incoming call from", fromUserId);

    setIsCaller(false);
    setIncomingCall(null);
    setIsOpen(true);

    // create non-initiator peer
    const peer = await createPeer(false, fromUserId);

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

  // ------------------ SOCKET SIGNALING ------------------

  useEffect(() => {
    if (!socket) return;

    // incoming call (ring)
    const handleIncomingCall = (data: IncomingCall) => {
      console.log("[Socket] incomingVideoCall", data);
      setIncomingCall(data);
      setIsOpen(true);
      setIsCaller(false);
      setRemoteUserId(data.fromUserId);
      setRemoteUsername(data.fromUsername);
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

    return () => {
      socket.off("incomingVideoCall", handleIncomingCall);
      socket.off("videoOffer", handleVideoOffer);
      socket.off("videoCallEnded", handleCallEnded);
      socket.off("videoCallDeclined", handleCallDeclined);
    };
  }, [socket]);

  // ------------------ RENDER ------------------

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-3xl h-[80vh] rounded-lg shadow-lg p-4 flex flex-col">
            {/* HEADER */}
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

            {/* VIDEOS */}
            <div className="flex-1 mt-4 grid grid-cols-2 gap-4">
              {/* Local video */}
              <div className="bg-black rounded overflow-hidden flex items-center justify-center">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Remote video */}
              <div className="bg-black rounded overflow-hidden flex items-center justify-center">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Incoming call notification */}
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
