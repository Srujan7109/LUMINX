async function sendMessage() {
  const input = document.getElementById("chatInput");
  const chatbox = document.getElementById("chatbox");

  const userMessage = input.value.trim();
  if (!userMessage) return;

  // Show user message
  chatbox.innerHTML += `<div class="message"><span class="user">You:</span> ${userMessage}</div>`;
  input.value = "";

  // --- Show "Generating answer..." immediately ---
  const generatingDiv = document.createElement("div");
  generatingDiv.className = "message";
  generatingDiv.innerHTML = `<span class="ai">AI:</span> Generating answer...`;
  chatbox.appendChild(generatingDiv);
  chatbox.scrollTop = chatbox.scrollHeight;

  try {
    // Send message to backend
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Backend error:", response.status, text);
      generatingDiv.innerHTML = `<span class="ai">AI:</span> <span class="text-danger">
        Error ${response.status}: ${text}</span>`;
      return;
    }

    const data = await response.json();

    if (!data || !data.reply) {
      console.warn("AI server returned empty response:", data);
      generatingDiv.innerHTML = `<span class="ai">AI:</span> <span class="text-warning">
        No response from AI.</span>`;
      return;
    }

    // Replace "Generating answer..." with actual reply
    generatingDiv.innerHTML = `<span class="ai">AI:</span> ${data.reply}`;
    chatbox.scrollTop = chatbox.scrollHeight;

  } catch (err) {
    console.error("Fetch error:", err);
    generatingDiv.innerHTML = `<span class="ai">AI:</span> <span class="text-danger">
      Could not reach server or AI. Check console for details.</span>`;
  }
}
