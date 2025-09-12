// server.js
// Backend for Luminex — signaling + uploads + classroom state
const express = require("express");
const http = require("http");
const path = require("path");
const multer = require("multer");
const { Server } = require("socket.io");
const fs = require("fs");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// allow CORS from react dev server
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;

// make sure public/upload folders exist
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const RESOURCES_DIR = path.join(__dirname, "resources");

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(RESOURCES_DIR)) fs.mkdirSync(RESOURCES_DIR);

// Serve static frontend (if you build into public) and uploaded files
app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/resources", express.static(RESOURCES_DIR));
app.use(cors());

// ========================
// Multer storage (store in public/uploads)
// ========================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    // unique filename: timestamp-random-original
    const safeName = file.originalname.replace(/\s+/g, "_");
    const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

// ========================
// In-memory classroom state
// (for a production app you'd persist or use Redis)
// ========================
let classroomState = {
  currentSlide: 0,
  totalSlides: 0,
  slideData: [], // [{ url, name }]
  participants: [], // { id, name, role }
};

let resources = []; // { id, name, safeName, url }

// ========================
// API: Upload slides (accept multiple images)
// Endpoint expects field name: "files" (multiple) or single "file"
// ========================
app.post("/upload", upload.array("files"), (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  // Build slideData array pointing to /uploads/...
  const slideData = files.map((f) => ({
    url: `/uploads/${f.filename}`,
    name: f.originalname,
  }));

  classroomState.slideData = slideData;
  classroomState.totalSlides = slideData.length;
  classroomState.currentSlide = 0;

  // Emit slide-uploaded and classroom-state (so clients sync)
  io.emit("slide-uploaded", { slideData });
  io.emit("classroom-state", classroomState);

  return res.json({ slides: slideData });
});

// ========================
// Upload resource (single file) -> resources folder
// field name: "file"
// ========================
const resourceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RESOURCES_DIR),
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/\s+/g, "_");
      const id = Date.now().toString();
      cb(null, `${id}-${safeName}`);
    },
  }),
});

app.post("/upload-resource", resourceUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const safeName = req.file.filename; // includes id prefix
  const originalname = req.file.originalname;
  const id = safeName.split("-")[0];

  const resource = {
    id,
    name: originalname,
    safeName,
    url: `/resources/${safeName}`,
  };

  resources.push(resource);
  io.emit("resource-added", resource);

  return res.json({ resource });
});

// List resources
app.get("/resources-index", (req, res) => {
  return res.json({ resources });
});

// Delete resource
app.delete("/resources/:id/:name", (req, res) => {
  const { id, name } = req.params;
  const idx = resources.findIndex((r) => r.id === id && r.safeName === name);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  const resource = resources[idx];
  const fp = path.join(RESOURCES_DIR, resource.safeName);
  if (fs.existsSync(fp)) {
    try {
      fs.unlinkSync(fp);
    } catch (e) {
      console.warn("Failed to unlink resource file", e);
    }
  }

  resources.splice(idx, 1);
  io.emit("resource-removed", resource);
  return res.json({ success: true });
});

// ========================
// Socket.IO: signaling + classroom events
// ========================
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join classroom
  socket.on("join-classroom", ({ name, role }) => {
    // prevent duplicates
    classroomState.participants = classroomState.participants.filter(
      (p) => p.id !== socket.id
    );
    classroomState.participants.push({ id: socket.id, name, role });

    // send full state to new client
    socket.emit("classroom-state", classroomState);

    // broadcast participants list
    io.emit("participants-updated", classroomState.participants);
  });

  // Slide navigation
  socket.on("change-slide", ({ slideNumber }) => {
    classroomState.currentSlide = slideNumber;
    io.emit("slide-changed", { slideNumber });
    io.emit("classroom-state", classroomState);
  });

  // Chat
  socket.on("send-message", (message) => {
    // optionally stamp server time
    const msg = { ...message, ts: Date.now() };
    io.emit("new-message", msg);
  });

  // ---- WebRTC signaling (targeted) ----
  // Teacher creates offer: server will broadcast offer with from socket.id
  socket.on("webrtc-offer", ({ sdp }) => {
    // send to all others but include from id
    socket.broadcast.emit("webrtc-offer", { from: socket.id, sdp });
  });

  // Student answers -> should include "to" field (teacher id)
  socket.on("webrtc-answer", ({ to, sdp }) => {
    if (!to) {
      // if no target, broadcast (fallback)
      socket.broadcast.emit("webrtc-answer", { from: socket.id, sdp });
    } else {
      io.to(to).emit("webrtc-answer", { from: socket.id, sdp });
    }
  });

  // ICE candidates: always include sender id; if 'to' provided, forward to that socket
  socket.on("webrtc-ice-candidate", ({ to, candidate }) => {
    if (!candidate) return;
    const payload = { from: socket.id, candidate };
    if (to) {
      io.to(to).emit("webrtc-ice-candidate", payload);
    } else {
      socket.broadcast.emit("webrtc-ice-candidate", payload);
    }
  });

  // Optional: teacher left notification
  socket.on("disconnect", () => {
    const leaving = classroomState.participants.find((p) => p.id === socket.id);
    classroomState.participants = classroomState.participants.filter(
      (p) => p.id !== socket.id
    );

    if (leaving && leaving.role === "teacher") {
      io.emit("teacher-left");
    }

    io.emit("participants-updated", classroomState.participants);
    console.log("User disconnected:", socket.id);
  });
});

// ========================
// Start
// ========================
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
