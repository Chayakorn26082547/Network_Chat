"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";

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
  const [pendingOffer, setPendingOffer] = useState<{
    fromUserId: string;
    offer: any;
  } | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Expose a simple global starter so other components can trigger a call
  useEffect(() => {
    (window as any).startVideoCall = (
      toUserId: string,
      toUsername?: string
    ) => {
      setIsOpen(true);
      setIsCaller(true);
      setRemoteUserId(toUserId);
      setRemoteUsername(toUsername || null);
      // Send an initial request (ring) and then create offer in a moment
      socket?.emit("videoCallRequest", toUserId);
      // Start the call flow after a short delay to allow callee to be notified
      setTimeout(() => {
        startAsCaller(toUserId);
      }, 400);
    };

    return () => {
      try {
        delete (window as any).startVideoCall;
      } catch (e) {}
    };
  }, [socket]);

  // Update remote video element when remote stream changes
  useEffect(() => {
    if (remoteStreamRef.current && remoteStream) {
      console.log("Attaching remote stream to video element");
      remoteStreamRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!socket) return;

    const handleIncoming = (data: IncomingCall) => {
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
      // Store the offer but don't automatically answer - wait for user to click Accept
      console.log("Received video offer from:", data.fromUserId);
      setPendingOffer(data);
      if (!remoteUserId) {
        setRemoteUserId(data.fromUserId);
      }
    };

    const handleVideoAnswer = async (data: {
      fromUserId: string;
      answer: any;
    }) => {
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
          await pc.addIceCandidate(data.candidate);
        } catch (e) {
          console.warn("Error adding remote ICE candidate", e);
        }
      }
    };

    const handleCallEnded = (data: { fromUserId: string }) => {
      endCall();
    };

    const handleCallDeclined = (data: { fromUserId: string }) => {
      // Show a small notification then close
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
      console.error("Failed to get local media", e);
      throw e;
    }
  };

  const createPeerConnection = (toUserId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        console.log("Sending ICE candidate:", ev.candidate.type);
        socket?.emit("newIceCandidate", { toUserId, candidate: ev.candidate });
      } else {
        console.log("All ICE candidates sent");
      }
    };

    pc.ontrack = (ev) => {
      console.log(
        "Received remote track:",
        ev.track.kind,
        "streams:",
        ev.streams.length
      );
      if (ev.streams && ev.streams[0]) {
        console.log(
          "Setting remote stream with",
          ev.streams[0].getTracks().length,
          "tracks"
        );
        setRemoteStream(ev.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        console.error("Connection failed or disconnected");
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState);
    };

    pcRef.current = pc;
    return pc;
  };

  const startAsCaller = async (toUserId: string) => {
    try {
      const stream = await startLocalStream();
      const pc = createPeerConnection(toUserId);
      // add tracks
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket?.emit("videoOffer", { toUserId, offer });
      setIsInCall(true);
    } catch (e) {
      console.error("Error starting as caller", e);
      endCall();
    }
  };

  const startAsAnswerer = async (fromUserId: string, remoteOffer: any) => {
    try {
      const stream = await startLocalStream();
      const pc = createPeerConnection(fromUserId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket?.emit("videoAnswer", { toUserId: fromUserId, answer });
      setIsInCall(true);
    } catch (e) {
      console.error("Error starting as answerer", e);
      endCall();
    }
  };

  const acceptIncoming = async () => {
    if (!incomingCall) return;
    console.log("Accepting incoming call");
    setIncomingCall(null); // Clear the incoming call prompt

    // If we have a pending offer, process it now
    if (pendingOffer) {
      console.log("Processing pending offer");
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
    console.log("Ending call");
    // cleanup pc and streams
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
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
  };

  const hangup = () => {
    if (remoteUserId) socket?.emit("videoCallEnded", remoteUserId);
    endCall();
  };

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
                  onClick={() => {
                    endCall();
                  }}
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
                  ref={remoteStreamRef}
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
