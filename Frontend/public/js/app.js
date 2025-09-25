// Global variables
let socket = null;
let currentUser = null;
let currentSlideNumber = 0;
let totalSlides = 0;
let slides = [];
let isAudioStreaming = false;
let localStream = null;
let peerConnections = new Map();

// WebRTC configuration
const rtcConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Audio constraints
const audioConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 16000,
    sampleSize: 16,
    channelCount: 1,
  },
  video: false,
};

// Initialize connection when page loads
window.onload = function () {
  console.log("Page loaded, initializing application...");

  // Check if user details exist in localStorage
  const storedName = localStorage.getItem("name");
  const storedRole = localStorage.getItem("role");

  if (storedName && storedRole) {
    // Auto-join with stored details
    console.log(`Auto-joining classroom as ${storedName} (${storedRole})`);
    autoJoinClassroom(storedName, storedRole);
  } else {
    // Show join form if no stored details
    console.log("No stored user details found, showing join form");
    document.getElementById("joinForm").style.display = "block";
  }

  initializeSocket();
  setupChatEnterKey();
  initializeWhiteboard(); // This will call the function from whiteboard.js
  initResourcesIndex();
};

// Auto-join function using localStorage data
function autoJoinClassroom(name, role) {
  currentUser = { name, role };

  // Hide join form and show classroom
  const joinFormEl = document.getElementById("joinForm");
  if (joinFormEl) {
    joinFormEl.style.display = "none";
  }
  document.getElementById("classroom").style.display = "grid";

  // Update status to show user info
  updateStatus("connected", `Connected as: ${name} (${role})`);

  // Show teacher controls if user is a teacher
  if (role === "teacher") {
    document.getElementById("teacherControls").style.display = "flex";
    ensureTeacherActionsOnResources();
  }

  // Emit join event when socket is ready
  if (socket && socket.connected) {
    socket.emit("join-classroom", { name, role });
  } else {
    // Wait for socket connection before joining
    const joinWhenReady = () => {
      if (socket && socket.connected) {
        socket.emit("join-classroom", { name, role });
        socket.off("connect", joinWhenReady);
      }
    };
    if (socket) {
      socket.on("connect", joinWhenReady);
    }
  }
}

// Socket initialization
function initializeSocket() {
  socket = io();

  socket.on("connect", () => {
    console.log("Socket connected");

    // If user is already set (auto-joined), emit join-classroom
    if (currentUser) {
      socket.emit("join-classroom", {
        name: currentUser.name,
        role: currentUser.role,
      });
      updateStatus(
        "connected",
        `Connected as: ${currentUser.name} (${currentUser.role})`
      );
    } else {
      updateStatus("connected", "Connected");
    }

    if (!currentUser) {
      showConnectedMessage();
    }
  });

  socket.on("disconnect", () => {
    updateStatus("disconnected", "Disconnected");
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    peerConnections.forEach((pc) => pc.close());
    peerConnections.clear();
  });

  socket.on("upload-started", (data) => {
    showNotification(`Processing ${data.filename}...`);
    slides = [];
    totalSlides = 0;
    currentSlideNumber = 0;
    document.getElementById("noSlideMessage").style.display = "block";
    document.getElementById("currentSlide").classList.add("hidden");
  });

  socket.on("total-slides", (data) => {
    totalSlides = data.totalSlides;
    slides = new Array(totalSlides).fill(null);
    showNotification(`Loading ${totalSlides} slides...`);
  });

  socket.on("slide-ready", (data) => {
    slides[data.index] = data.url;
    if (data.index === 0) {
      currentSlideNumber = 0;
      displaySlide(data.url);
      updateSlideInfo();
      showNotification("First slide ready!");
    }
  });

  socket.on("upload-complete", (data) => {
    showNotification(`All ${data.totalSlides} slides loaded successfully!`);
    if (slides[0] && currentSlideNumber === 0) {
      displaySlide(slides[0]);
      updateSlideInfo();
    }
  });

  socket.on("slide-changed", (data) => {
    currentSlideNumber = data.slideNumber;
    if (slides[currentSlideNumber]) {
      displaySlide(slides[currentSlideNumber]);
    }
    updateSlideInfo();
    showNotification(`Teacher changed to slide ${currentSlideNumber + 1}`);
  });

  socket.on("new-message", (message) => displayMessage(message));

  socket.on("teacher-left", () => {
    showNotification("Teacher has left the classroom", "warning");
    if (currentUser?.role === "student" && isAudioStreaming) {
      updateAudioStatus("stopped", "Audio: Teacher disconnected");
      peerConnections.forEach((pc) => pc.close());
      peerConnections.clear();
    }
  });

  socket.on("webrtc-offer", handleWebRTCOffer);
  socket.on("webrtc-answer", handleWebRTCAnswer);
  socket.on("webrtc-ice-candidate", handleWebRTCIceCandidate);
  socket.on("classroom-state", updateClassroomState);
  socket.on("participants-updated", updateParticipantsList);
  socket.on("whiteboard-update", handleWhiteboardUpdate);
  socket.on("whiteboard-state", handleWhiteboardState);
  socket.on("whiteboard-clear", handleWhiteboardClear);
  socket.on("whiteboard-toggle", handleWhiteboardToggle); // This correctly calls the function in whiteboard.js

  socket.on("resource-added", (resource) => {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "CACHE_RESOURCE_URLS",
        payload: { urls: [resource.url] },
      });
    }
    addResourceToList(resource);
  });

  socket.on("resource-removed", (resource) => {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "DELETE_RESOURCE_URLS",
        payload: { urls: [resource.url] },
      });
    }
    removeResourceFromList(resource);
  });
}

// Manual join function (for cases where localStorage is not available)
function joinClassroom() {
  const name = document.getElementById("nameInput").value.trim();
  const role = document.getElementById("roleSelect").value;
  if (!name) return alert("Please enter your name");

  // Store in localStorage for future sessions
  localStorage.setItem("name", name);
  localStorage.setItem("role", role);

  currentUser = { name, role };
  socket.emit("join-classroom", { name, role });

  const joinFormEl2 = document.getElementById("joinForm");
  if (joinFormEl2) {
    joinFormEl2.style.display = "none";
  }
  document.getElementById("classroom").style.display = "grid";

  if (role === "teacher") {
    document.getElementById("teacherControls").style.display = "flex";
    ensureTeacherActionsOnResources();
  }
}

// Add logout function to clear localStorage
function logout() {
  localStorage.removeItem("name");
  localStorage.removeItem("role");
  localStorage.removeItem("username"); // if you also store username

  // Disconnect socket
  if (socket) {
    socket.disconnect();
  }

  // Redirect to login page
  window.location.href = "/"; // or wherever your login page is
}

function updateStatus(status, text) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.className = `status ${status}`;
    statusEl.textContent = text;
  }
}

function updateClassroomState(state) {
  currentSlideNumber = state.currentSlide || 0;
  totalSlides = state.totalSlides || 0;
  if (state.slideData && Array.isArray(state.slideData)) {
    slides = state.slideData.map((slide) => slide.url || slide);
  }
  if (slides.length > 0 && slides[currentSlideNumber]) {
    displaySlide(slides[currentSlideNumber]);
  }
  updateSlideInfo();
  if (state.participants) updateParticipantsList(state.participants);

  // When joining, sync the whiteboard to the current state
  if (state.whiteboardMode && state.whiteboardMode !== whiteboardMode) {
    whiteboardMode = state.whiteboardMode;
    applyWhiteboardMode();
  }
}

function updateParticipantsList(participants) {
  const listEl = document.getElementById("participantsList");
  const countEl = document.getElementById("participantCount");
  if (listEl) listEl.innerHTML = "";
  if (countEl) countEl.textContent = participants.length;

  participants.forEach((p) => {
    const div = document.createElement("div");
    div.className = `participant ${p.role}`;
    div.textContent = `${p.role === "teacher" ? "👨‍🏫" : "👨‍🎓"} ${p.name}`;
    if (listEl) listEl.appendChild(div);
  });
}

function updateSlideInfo() {
  const el = document.getElementById("slideInfo");
  if (el)
    el.textContent = `Slide ${currentSlideNumber + 1} of ${totalSlides || 1}`;
}

function displaySlide(slideUrl) {
  const slideImg = document.getElementById("currentSlide");
  const noSlideMsg = document.getElementById("noSlideMessage");
  if (!slideUrl) {
    if (slideImg) slideImg.classList.add("hidden");
    if (noSlideMsg) noSlideMsg.style.display = "block";
    return;
  }
  if (slideImg) {
    slideImg.onload = () => {
      if (slides && slides[currentSlideNumber + 1]) {
        const preload = new Image();
        preload.src = slides[currentSlideNumber + 1];
      }
    };
    slideImg.onerror = function () {
      console.error("Failed to load slide:", slideUrl);
      this.classList.add("hidden");
      if (noSlideMsg) noSlideMsg.style.display = "block";
    };
    slideImg.src = slideUrl;
    slideImg.classList.remove("hidden");
  }
  if (noSlideMsg) noSlideMsg.style.display = "none";
}

function nextSlide() {
  if (currentUser?.role === "teacher" && currentSlideNumber < totalSlides - 1) {
    currentSlideNumber++;
    if (slides[currentSlideNumber]) displaySlide(slides[currentSlideNumber]);
    updateSlideInfo();
    socket.emit("change-slide", { slideNumber: currentSlideNumber });
  }
}

function previousSlide() {
  if (currentUser?.role === "teacher" && currentSlideNumber > 0) {
    currentSlideNumber--;
    if (slides[currentSlideNumber]) displaySlide(slides[currentSlideNumber]);
    updateSlideInfo();
    socket.emit("change-slide", { slideNumber: currentSlideNumber });
  }
}

function triggerFileUpload() {
  if (currentUser?.role !== "teacher")
    return alert("Only teachers can upload slides");
  document.getElementById("slideUpload")?.click();
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file || currentUser?.role !== "teacher") return;
  showNotification("Uploading slides...", "info");
  const formData = new FormData();
  formData.append("file", file);
  fetch("/upload", { method: "POST", body: formData })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (data.slides && Array.isArray(data.slides)) {
        slides = data.slides.map((s) => s.url || s);
        currentSlideNumber = 0;
        totalSlides = slides.length;
        if (slides.length > 0) {
          displaySlide(slides[0]);
          updateSlideInfo();
          showNotification("Slides uploaded successfully!");
        } else {
          throw new Error("No slides in response");
        }
      } else {
        throw new Error("Invalid response format");
      }
    })
    .catch((err) => {
      console.error("Upload failed:", err);
      alert("Upload failed: " + err.message);
    });
}

function sendMessage() {
  const chatInput = document.getElementById("chatInput");
  if (!chatInput) return;
  const message = chatInput.value.trim();
  if (message && socket && currentUser) {
    socket.emit("send-message", {
      text: message,
      sender: currentUser.name,
      role: currentUser.role,
    });
    chatInput.value = "";
  }
}

function setupChatEnterKey() {
  document.getElementById("chatInput")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

function displayMessage(message) {
  const messagesEl = document.getElementById("chatMessages");
  if (!messagesEl) return;
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${message.role}`;
  messageDiv.innerHTML = `<div class="message-header">${message.sender} (${
    message.role
  })</div><div class="message-content">${escapeHtml(message.text)}</div>`;
  messagesEl.appendChild(messageDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(text, type = "info") {
  const notification = document.createElement("div");
  notification.className = "toast-notification"; // Use a class for styling
  notification.textContent = text;
  notification.classList.add(type); // 'info', 'warning', 'error'
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

function showConnectedMessage() {
  const messages = [
    "🎉 Connected! You can now join the classroom.",
    "✨ Connection established successfully!",
    "🚀 Ready to start learning!",
  ];
  showNotification(messages[Math.floor(Math.random() * messages.length)]);
}

async function startAudio() {
  if (currentUser?.role !== "teacher")
    return alert("Only teacher can start audio streaming");
  if (isAudioStreaming) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
    document.getElementById("startAudioBtn")?.classList.add("hidden");
    document.getElementById("stopAudioBtn")?.classList.remove("hidden");
    updateAudioStatus("streaming", "Audio: Streaming 🔴");
    isAudioStreaming = true;
    await createPeerConnectionsForStudents();
  } catch (error) {
    console.error("Error accessing microphone:", error);
    alert("Could not access microphone. Please check permissions.");
    updateAudioStatus("error", "Audio: Error accessing microphone");
  }
}

function stopAudio() {
  if (localStream) localStream.getTracks().forEach((track) => track.stop());
  localStream = null;
  peerConnections.forEach((pc) => pc.close());
  peerConnections.clear();
  document.getElementById("startAudioBtn")?.classList.remove("hidden");
  document.getElementById("stopAudioBtn")?.classList.add("hidden");
  updateAudioStatus("stopped", "Audio: Stopped");
  isAudioStreaming = false;
  socket.emit("audio-stopped");
}

function updateAudioStatus(status, text) {
  const statusEl = document.getElementById("audioStatus");
  if (statusEl) {
    statusEl.className = `audio-status ${status}`;
    statusEl.textContent = text;
  }
}

async function createPeerConnectionsForStudents() {
  if (!localStream) return;
  try {
    const pc = new RTCPeerConnection(rtcConfiguration);
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit("webrtc-ice-candidate", { candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed")
        updateAudioStatus("error", "Audio: Connection failed");
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("webrtc-offer", { offer });
    peerConnections.set("broadcast", pc);
  } catch (error) {
    console.error("Error creating peer connection:", error);
    updateAudioStatus("error", "Audio: Failed to create connection");
  }
}

async function handleWebRTCOffer(data) {
  if (currentUser?.role !== "student") return;
  try {
    const pc = new RTCPeerConnection(rtcConfiguration);
    pc.ontrack = (event) => {
      const remoteAudio = new Audio();
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.autoplay = true;
      remoteAudio.play().catch((e) => console.error("Audio play error:", e));
      updateAudioStatus("receiving", "Audio: Receiving 🔊");
    };
    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit("webrtc-ice-candidate", {
          candidate: e.candidate,
          targetId: data.senderId,
        });
    };
    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed"].includes(pc.connectionState))
        updateAudioStatus("stopped", "Audio: Connection lost");
    };
    await pc.setRemoteDescription(data.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("webrtc-answer", { answer, targetId: data.senderId });
    peerConnections.set(data.senderId || "teacher", pc);
  } catch (error) {
    console.error("Error handling WebRTC offer:", error);
    updateAudioStatus("error", "Audio: Connection error");
  }
}

async function handleWebRTCAnswer(data) {
  if (currentUser?.role !== "teacher") return;
  try {
    const pc = peerConnections.get("broadcast");
    if (pc && pc.signalingState !== "stable") {
      await pc.setRemoteDescription(data.answer);
    }
  } catch (error) {
    console.error("Error handling WebRTC answer:", error);
  }
}

async function handleWebRTCIceCandidate(data) {
  if (!data.candidate) return;
  try {
    const pc =
      currentUser?.role === "teacher"
        ? peerConnections.get("broadcast")
        : peerConnections.get(data.senderId || "teacher");
    if (pc && pc.remoteDescription) await pc.addIceCandidate(data.candidate);
  } catch (error) {
    console.error("Error adding ICE candidate:", error);
  }
}

function triggerResourceUpload() {
  if (!currentUser || currentUser.role !== "teacher")
    return alert("Only teachers can upload resources");
  document.getElementById("resourceUpload")?.click();
}

function handleResourceUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  fetch("/upload-resource", { method: "POST", body: form })
    .then((r) => {
      if (!r.ok) throw new Error("Upload failed");
      return r.json();
    })
    .then((data) => {
      const res = data && data.resource;
      if (res) {
        addResourceToList(res);
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "CACHE_RESOURCE_URLS",
            payload: { urls: [res.url] },
          });
        }
      }
      event.target.value = "";
    })
    .catch((err) => alert("Resource upload failed: " + err.message));
}

function initResourcesIndex() {
  fetch("/resources-index")
    .then((r) => r.json())
    .then((data) => {
      const list = (data && data.resources) || [];
      const container = document.getElementById("resourcesList");
      if (container) container.innerHTML = "";
      list.forEach(addResourceToList);
      const urls = list.map((x) => x.url);
      if (
        urls.length &&
        navigator.serviceWorker &&
        navigator.serviceWorker.controller
      ) {
        navigator.serviceWorker.controller.postMessage({
          type: "CACHE_RESOURCE_URLS",
          payload: { urls },
        });
      }
    })
    .catch(() => {});
}

function addResourceToList(res) {
  const list = document.getElementById("resourcesList");
  if (!list || !res) return;
  const key = `${res.id || ""}:${res.name || res.safeName || res.url}`;
  if (Array.from(list.children).some((n) => n.dataset?.key === key)) {
    if (currentUser?.role === "teacher") ensureTeacherActionsOnResources();
    return;
  }
  const row = document.createElement("div");
  row.className = "resource-row";
  row.dataset.key = key;
  if (res.id) row.dataset.id = res.id;
  if (res.name || res.safeName) row.dataset.name = res.name || res.safeName;
  if (res.url) row.dataset.url = res.url;

  const nameEl = document.createElement("div");
  nameEl.className = "resource-name";
  nameEl.textContent = res.name || res.safeName || res.url;

  const actions = document.createElement("div");
  actions.className = "resource-actions";
  actions.dataset.actions = "true";

  const downloadBtn = document.createElement("a");
  downloadBtn.href = res.url;
  downloadBtn.textContent = "Download";
  downloadBtn.className = "resource-button";
  downloadBtn.setAttribute("download", res.safeName || "");

  actions.appendChild(downloadBtn);
  if (currentUser?.role === "teacher") appendRemoveButton(actions, res);

  row.appendChild(nameEl);
  row.appendChild(actions);
  list.appendChild(row);
}

function removeResourceFromList(res) {
  const list = document.getElementById("resourcesList");
  if (!list || !res) return;
  const key = `${res.id || ""}:${res.name || res.safeName || res.url}`;
  Array.from(list.children)
    .find((n) => n.dataset?.key === key)
    ?.remove();
}

function deleteResource(res) {
  if (!res.id || !res.name) {
    try {
      const parts = (res.url || "").split("/").filter(Boolean);
      const idx = parts.indexOf("resources");
      res.id = res.id || parts[idx + 1];
      res.name = res.name || parts[idx + 2];
    } catch {}
  }
  if (!res.id || !res.name) return alert("Invalid resource");

  fetch(
    `/resources/${encodeURIComponent(res.id)}/${encodeURIComponent(res.name)}`,
    { method: "DELETE" }
  )
    .then((r) => {
      if (!r.ok) throw new Error("Delete failed");
      removeResourceFromList(res);
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "DELETE_RESOURCE_URLS",
          payload: { urls: [res.url] },
        });
      }
    })
    .catch((err) => alert("Failed to delete resource: " + err.message));
}

function appendRemoveButton(actionsEl, res) {
  const removeBtn = document.createElement("button");
  removeBtn.textContent = "Remove";
  removeBtn.className = "resource-button remove";
  removeBtn.onclick = () => deleteResource(res);
  actionsEl.appendChild(removeBtn);
}

function ensureTeacherActionsOnResources() {
  if (currentUser?.role !== "teacher") return;
  const list = document.getElementById("resourcesList");
  if (!list) return;
  Array.from(list.children).forEach((row) => {
    const actions = row.querySelector('[data-actions="true"]');
    if (!actions) return;
    const hasRemove = Array.from(actions.children).some(
      (el) => el.tagName === "BUTTON"
    );
    if (!hasRemove) {
      const res = {
        id: row.dataset.id,
        name: row.dataset.name,
        url: row.dataset.url,
      };
      appendRemoveButton(actions, res);
    }
  });
}

// Clean up on page unload
window.addEventListener("beforeunload", () => {
  if (localStream) localStream.getTracks().forEach((track) => track.stop());
  peerConnections.forEach((pc) => pc.close());
  if (socket) socket.disconnect();
});
