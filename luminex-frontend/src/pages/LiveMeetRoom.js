// src/pages/LiveMeetRoom.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { io } from "socket.io-client";
import "./LiveMeetRoom.css";

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function LiveMeetRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username, role } = location.state || {};

  const [status, setStatus] = useState("Disconnected");
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [resources, setResources] = useState([]);
  const [slides, setSlides] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [audioOn, setAudioOn] = useState(false);

  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);

  // 🔹 Join classroom and setup signaling
  useEffect(() => {
    if (!username || !role) {
      navigate("/login");
      return;
    }

    const socket = io("http://localhost:5000");
    socketRef.current = socket;

    socket.on("connect", () => setStatus("Connected"));
    socket.on("disconnect", () => setStatus("Disconnected"));

    socket.emit("join-classroom", { name: username, role });

    socket.on("participants-updated", (list) => setParticipants(list));
    socket.on("new-message", (msg) => setMessages((prev) => [...prev, msg]));
    socket.on("slide-uploaded", (data) => {
      const slideUrls = data.slideData.map((s) => s.url);
      setSlides(slideUrls);
      setCurrentSlide(0);
    });
    socket.on("slide-changed", (data) => setCurrentSlide(data.slideNumber));
    socket.on("resource-added", (res) =>
      setResources((prev) => [...prev, res])
    );
    socket.on("resource-removed", (res) =>
      setResources((prev) => prev.filter((r) => r.url !== res.url))
    );

    // WebRTC signaling
    socket.on("webrtc-offer", async ({ from, sdp }) => {
      if (role !== "student") return;
      if (!peerConnectionRef.current) {
        peerConnectionRef.current = new RTCPeerConnection(rtcConfig);

        peerConnectionRef.current.onicecandidate = (e) => {
          if (e.candidate) {
            socketRef.current.emit("webrtc-ice-candidate", {
              to: from,
              candidate: e.candidate,
            });
          }
        };

        peerConnectionRef.current.ontrack = (event) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
          }
        };
      }

      await peerConnectionRef.current.setRemoteDescription(sdp);
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socketRef.current.emit("webrtc-answer", { to: from, sdp: answer });
    });

    socket.on("webrtc-answer", async ({ from, sdp }) => {
      if (role !== "teacher") return;
      await peerConnectionRef.current?.setRemoteDescription(sdp);
    });

    socket.on("webrtc-ice-candidate", async ({ candidate }) => {
      try {
        await peerConnectionRef.current?.addIceCandidate(candidate);
      } catch (err) {
        console.error("Error adding ICE candidate", err);
      }
    });

    return () => socket.disconnect();
  }, [username, role, navigate]);

  // 🔹 Start/Stop Audio
  const toggleAudio = async () => {
    if (audioOn) {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      setAudioOn(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      if (!peerConnectionRef.current) {
        peerConnectionRef.current = new RTCPeerConnection(rtcConfig);
      }

      stream
        .getTracks()
        .forEach((track) => peerConnectionRef.current.addTrack(track, stream));

      peerConnectionRef.current.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current.emit("webrtc-ice-candidate", {
            candidate: e.candidate,
          });
        }
      };

      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socketRef.current.emit("webrtc-offer", { sdp: offer });

      setAudioOn(true);
    } catch (err) {
      console.error("Mic error:", err);
    }
  };

  // 🔹 Slide navigation
  const nextSlide = () => {
    if (role === "teacher" && currentSlide < slides.length - 1) {
      socketRef.current.emit("change-slide", { slideNumber: currentSlide + 1 });
      setCurrentSlide((s) => s + 1);
    }
  };
  const previousSlide = () => {
    if (role === "teacher" && currentSlide > 0) {
      socketRef.current.emit("change-slide", { slideNumber: currentSlide - 1 });
      setCurrentSlide((s) => s - 1);
    }
  };

  // 🔹 Chat
  const sendMessage = () => {
    if (!chatInput.trim()) return;
    const msg = { sender: username, text: chatInput };
    socketRef.current.emit("send-message", msg);
    setChatInput("");
  };

  // 🔹 Slide upload handler (multiple files)
  const handleSlideUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.slides) {
        setSlides(data.slides.map((s) => s.url));
        setCurrentSlide(0);
      }
    } catch (err) {
      console.error("Slide upload failed", err);
    }
  };

  return (
    <div className="container">
      <div
        className={`status ${
          status === "Connected" ? "connected" : "disconnected"
        }`}
      >
        {status}
      </div>

      <div className="classroom">
        <div className="main-content">
          <h2>
            Welcome, {username}! ({role})
          </h2>

          <div className="slide-area">
            {slides.length > 0 ? (
              <img
                src={slides[currentSlide]}
                alt={`Slide ${currentSlide + 1}`}
                className="slide-content"
              />
            ) : (
              <p>📋 Waiting for teacher to upload slides...</p>
            )}

            {role === "teacher" && slides.length > 0 && (
              <div className="slide-controls">
                <button onClick={previousSlide}>⬅ Previous</button>
                <button onClick={nextSlide}>Next ➡</button>
              </div>
            )}
          </div>

          {role === "teacher" && (
            <div className="teacher-controls">
              <div className="audio-controls">
                <button
                  onClick={toggleAudio}
                  className={audioOn ? "audio-on" : "audio-off"}
                >
                  {audioOn ? "🔊 Stop Audio" : "🎤 Start Audio"}
                </button>
              </div>

              <input
                type="file"
                id="slideUpload"
                style={{ display: "none" }}
                accept="image/*"
                multiple
                onChange={handleSlideUpload}
              />
              <button
                onClick={() => document.getElementById("slideUpload").click()}
              >
                📂 Upload Slides
              </button>
            </div>
          )}

          {role === "student" && (
            <audio ref={remoteAudioRef} autoPlay controls />
          )}
        </div>

        <div className="sidebar">
          <div className="participants">
            <h3>👥 Participants ({participants.length})</h3>
            {participants.map((p, i) => (
              <div key={i}>
                {p.role === "teacher" ? "👨‍🏫" : "👨‍🎓"} {p.name}
              </div>
            ))}
          </div>

          <div className="chat">
            <h3>💬 Chat</h3>
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={i}>
                  <b>{m.sender}:</b> {m.text}
                </div>
              ))}
            </div>
            <div className="chat-input">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />
              <button onClick={sendMessage}>Send</button>
            </div>
          </div>

          <div className="resources">
            <h3>📚 Resources</h3>
            {resources.map((r, i) => (
              <div key={i}>
                <a href={r.url} download>
                  {r.name || r.url}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
