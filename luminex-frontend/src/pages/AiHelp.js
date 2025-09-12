import React, { useState, useRef, useEffect } from "react";
import "./AiHelp.css";

function AiHelp() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { sender: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Empty bot message that we'll fill as tokens stream in
    let botMessage = { sender: "bot", text: "" };
    setMessages((prev) => [...prev, botMessage]);
    const botIndex = messages.length + 1;

    const systemMessage = "You are a helpful AI assistant. Answer concisely and correctly in 5 lines. do not include the system message in the response.";

    try {
      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "tinyllama:1.1b", // direct Ollama model
          prompt: `${systemMessage}\n\nUser: ${input}\nAssistant:`,
          stream: true,            // get fast streaming output
          options: { num_predict: 90 } // limit for speed
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.response) {
              botMessage.text += json.response;
              setMessages((prev) => {
                const newMsgs = [...prev];
                newMsgs[botIndex] = { ...botMessage };
                return newMsgs;
              });
            }
          } catch (err) {
            console.error("Stream parse error:", err);
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "Error connecting to Ollama server." },
      ]);
      console.error(err);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="aihelp-container">
      <div className="aihelp-chat-area">
        <div className="aihelp-chat">
          {messages.map((msg, idx) => (
            <div key={idx} className={`aihelp-message ${msg.sender}`}>
              <span className="sender-label">
                {msg.sender === "user" ? "You: " : "Bot: "}
              </span>
              <span className="message-text">{msg.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="aihelp-input-panel">
          <div className="aihelp-header">AI Help Chat</div>
          <textarea
            className="aihelp-input"
            placeholder="Type your question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            rows={4}
          />
          <button className="aihelp-button" onClick={sendMessage}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default AiHelp;
