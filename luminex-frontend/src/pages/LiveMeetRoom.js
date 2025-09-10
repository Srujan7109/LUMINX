import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LiveMeetRoom.css";

export default function LiveMeetRoom({ role = "student" }) {
  const navigate = useNavigate();
  const [audioOn, setAudioOn] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const handleLeave = () => {
    navigate("/student-dashboard");
  };

  const toggleAudio = () => {
    setAudioOn(!audioOn);
  };

  const handleSendMessage = () => {
    if (input.trim()) {
      setMessages([...messages, { sender: "You", text: input }]);
      setInput("");
    }
  };

  return (
    <div className="live-room">
      {/* Header Controls */}
      <div className="live-header">
        <h2>📡 Live Meet Room</h2>
        <button className="leave-btn" onClick={handleLeave}>
          {role === "teacher" ? "End Meet" : "Leave Meet"}
        </button>
      </div>

      <div className="live-content">
        {/* PPT Sharing Block */}
        <div className="ppt-section">
          <div className="ppt-display">
            <p>📑 PPT will be displayed here</p>
          </div>
          {role === "teacher" && (
            <div className="ppt-controls">
              <label className="upload-btn">
                Upload Slide
                <input type="file" hidden />
              </label>
              <button className="audio-btn" onClick={toggleAudio}>
                {audioOn ? "🎤 Stop Audio" : "🎙️ Start Audio"}
              </button>
            </div>
          )}
        </div>

        {/* Q&A Chat Section */}
        <div className="chat-section">
          <h3>💬 Q&A Chat</h3>
          <div className="chat-box">
            {messages.map((msg, i) => (
              <div key={i} className="chat-message">
                <strong>{msg.sender}:</strong> {msg.text}
              </div>
            ))}
          </div>
          <div className="chat-input">
            <input
              type="text"
              placeholder="Ask a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            />
            <button onClick={handleSendMessage}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
