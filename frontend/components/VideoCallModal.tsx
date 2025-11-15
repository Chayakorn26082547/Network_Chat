"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";

interface IncomingCall {
  fromUserId: string;
  fromUsername: string;
}

interface PendingOffer {
  fromUserId: string;
  offer: any;
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
  const remoteStreamRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamStateRef = useRef<MediaStream | null>(null);

  // ---------- TURN / STUN HELPERS ----------

  const fetchTurnServers = async () => {
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
        "[VideoCall] Backend returned no iceServers, falling back to STUN"
      );
    } catch (e) {
      console.error(
        "[VideoCall] Error fetching TURN token, fallback to STUN:",
        e
      );
    }

    // Fallback: STUN only (works on LAN / simple NAT)
    return [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];
  };

  // ---------- GLOBAL START CALL HANDLER ----------

  useEffect(() => {
    (window as any).startVideoCall = (
      toUserId: string,
      toUsername?: string
    ) => {
      setIsOpen(true);
      setIsCaller(true);
      setRemoteUserId(toUserId);
      setRemoteUsername(toUsername || null);

      socket?.emit("videoCallRequest", toUserId);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // ---------- REMOTE STREAM → VIDEO ELEMENT ----------

  useEffect(() => {
    if (remoteStreamRef.current && remoteStream) {
      console.log("[VideoCall] Attaching remote stream via useEffect");
      remoteStreamRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // ---------- SOCKET SIGNALING HANDLERS ----------

  useEffect(() => {
    if (!socket) return;

    const handleIncoming = (data: IncomingCall) => {
      console.log("[VideoCall] incomingVideoCall", data);
      setIncomingCall(data);
      setIsOpen(true);
      setIsCaller(false);
      setRemoteUserId(data.fromUserId);
      setRemoteUsername(data.fromUsername);
    };

    const handleVideoOffer = async (data: {
      fromUserId: string;
      offer: any;
    }) => {
      console.log("[VideoCall] videoOffer received", data);
      setPendingOffer({ fromUserId: data.fromUserId, offer: data.offer });
      if (!remoteUserId) setRemoteUserId(data.fromUserId);
    };

    const handleVideoAnswer = async (data: {
      fromUserId: string;
      answer: any;
    }) => {
      console.log("[VideoCall] videoAnswer received", data);
      const pc = pcRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    };

    const handleNewIce = async (data: {
      fromUserId: string;
      candidate: any;
    }) => {
      const pc = pcRef.current;
      if (pc && data.candidate) {
        try {
          console.log(
            "[VideoCall] Adding remote ICE candidate:",
            data.candidate.type || data.candidate.candidate
          );
          await pc.addIceCandidate(data.candidate);
        } catch (e) {
          console.warn("[VideoCall] Error adding remote ICE candidate", e);
        }
      }
    };

    const handleCallEnded = (data: { fromUserId: string }) => {
      console.log("[VideoCall] videoCallEnded from", data.fromUserId);
      endCall();
    };

    const handleCallDeclined = (data: { fromUserId: string }) => {
      console.log("[VideoCall] videoCallDeclined from", data.fromUserId);
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

  // ---------- MEDIA + PEER CONNECTION ----------

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

  const createPeerConnection = async (toUserId: string) => {
    const iceServers = await fetchTurnServers();

    const pc = new RTCPeerConnection({ iceServers });

    console.log("[VideoCall] Creating RTCPeerConnection to", toUserId);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        console.log(
          "[VideoCall] Sending ICE candidate:",
          ev.candidate.type || ev.candidate.candidate
        );
        socket?.emit("newIceCandidate", { toUserId, candidate: ev.candidate });
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
      if (ev.streams && ev.streams[0]) {
        const stream = ev.streams[0];
        console.log(
          "[VideoCall] Setting remote stream with",
          stream.getTracks().length,
          "tracks"
        );

        remoteStreamStateRef.current = stream;

        if (remoteStreamRef.current) {
          console.log("[VideoCall] Directly setting srcObject on remote video");
          remoteStreamRef.current.srcObject = stream;
        }

        setRemoteStream(stream);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[VideoCall] Connection state:", pc.connectionState);
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        console.error("[VideoCall] Connection failed or disconnected");
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[VideoCall] ICE connection state:", pc.iceConnectionState);
    };

    pcRef.current = pc;
    return pc;
  };

  const startAsCaller = async (toUserId: string) => {
    try {
      console.log("[VideoCall] Starting as caller");
      const stream = await startLocalStream();
      const pc = await createPeerConnection(toUserId);

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

  const startAsAnswerer = async (fromUserId: string, remoteOffer: any) => {
    try {
      console.log("[VideoCall] Starting as answerer");
      const stream = await startLocalStream();
      const pc = await createPeerConnection(fromUserId);

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket?.emit("videoAnswer", { toUserId: fromUserId, answer });
      setIsInCall(true);
    } catch (e) {
      console.error("[VideoCall] Error starting as answerer", e);
      endCall();
    }
  };

  // ---------- UI ACTIONS ----------

  const acceptIncoming = async () => {
    if (!incomingCall) return;
    console.log("[VideoCall] Accepting incoming call");
    setIncomingCall(null);

    if (pendingOffer) {
      console.log("[VideoCall] Processing pending offer");
      await startAsAnswerer(pendingOffer.fromUserId, pendingOffer.offer);
      setPendingOffer(null);
    }
  };

  const declineIncoming = () => {
    if (incomingCall && socket && incomingCall.fromUserId) {
      socket.emit("videoCallDeclined", incomingCall.fromUserId);
    }
    setIncomingCall(null);
    setPendingOffer(null);
    setIsOpen(false);
  };

  const endCall = () => {
    console.log("[VideoCall] Ending call");

    if (pcRef.current) {
      try {
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
    if (remoteUserId) socket?.emit("videoCallEnded", remoteUserId);
    endCall();
  };

  // ---------- RENDER ----------

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-3xl h-[80vh] rounded-lg shadow-lg p-4 flex flex-col">
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
                    remoteStreamRef.current = el;
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
