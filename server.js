const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Store classroom state
let classroomState = {
  currentSlide: 0,
  totalSlides: 0,
  slideData: null, // Will store slide image data
  isTeacherPresent: false,
  participants: []
};

// Store connected clients
let connectedClients = new Map();

io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  // Handle user joining as teacher or student
  socket.on('join-classroom', (data) => {
    const { role, name } = data;
    
    // Store client info
    connectedClients.set(socket.id, {
      role: role,
      name: name,
      socketId: socket.id
    });
    
    if (role === 'teacher') {
      classroomState.isTeacherPresent = true;
      console.log(`Teacher ${name} joined the classroom`);
    } else {
      console.log(`Student ${name} joined the classroom`);
    }
    
    // Update participants list
    classroomState.participants = Array.from(connectedClients.values());
    
    // Send current classroom state to the new client
    socket.emit('classroom-state', classroomState);
    
    // Notify all clients about updated participant list
    io.emit('participants-updated', classroomState.participants);
  });
  
  // Handle slide changes (teacher only)
  socket.on('change-slide', (data) => {
    const client = connectedClients.get(socket.id);
    if (client && client.role === 'teacher') {
      classroomState.currentSlide = data.slideNumber;
      
      // Broadcast slide change to all students
      socket.broadcast.emit('slide-changed', {
        slideNumber: data.slideNumber,
        timestamp: Date.now()
      });
      
      console.log(`Teacher changed to slide ${data.slideNumber}`);
    }
  });
  
  // Handle slide upload (teacher only)
  socket.on('upload-slide', (data) => {
    const client = connectedClients.get(socket.id);
    if (client && client.role === 'teacher') {
      classroomState.slideData = data.slideData;
      classroomState.totalSlides = data.totalSlides || 1;
      classroomState.currentSlide = data.currentSlide || 0;
      
      // Broadcast new slide to all students
      io.emit('slide-uploaded', {
        slideData: data.slideData,
        totalSlides: classroomState.totalSlides,
        currentSlide: classroomState.currentSlide,
        timestamp: Date.now()
      });
      
      console.log(`Teacher uploaded new slide`);
    }
  });
  
  // Handle chat messages
  socket.on('send-message', (data) => {
    const client = connectedClients.get(socket.id);
    if (client) {
      const message = {
        id: Date.now(),
        sender: client.name,
        role: client.role,
        text: data.text,
        timestamp: Date.now()
      };
      
      // Broadcast message to all clients
      io.emit('new-message', message);
      
      console.log(`${client.role} ${client.name}: ${data.text}`);
    }
  });
  
  // Handle WebRTC signaling for audio streaming
  socket.on('webrtc-offer', (data) => {
    // Forward WebRTC offer to all other clients (students)
    socket.broadcast.emit('webrtc-offer', {
      offer: data.offer,
      senderId: socket.id
    });
  });
  
  socket.on('webrtc-answer', (data) => {
    // Forward WebRTC answer back to specific client (teacher)
    io.to(data.targetId).emit('webrtc-answer', {
      answer: data.answer,
      senderId: socket.id
    });
  });
  
  socket.on('webrtc-ice-candidate', (data) => {
    // Forward ICE candidate to target client
    if (data.targetId) {
      io.to(data.targetId).emit('webrtc-ice-candidate', {
        candidate: data.candidate,
        senderId: socket.id
      });
    } else {
      // Broadcast to all if no specific target
      socket.broadcast.emit('webrtc-ice-candidate', {
        candidate: data.candidate,
        senderId: socket.id
      });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    const client = connectedClients.get(socket.id);
    if (client) {
      console.log(`${client.role} ${client.name} disconnected`);
      
      if (client.role === 'teacher') {
        classroomState.isTeacherPresent = false;
        // Notify students that teacher left
        socket.broadcast.emit('teacher-left');
      }
      
      // Remove from connected clients
      connectedClients.delete(socket.id);
      
      // Update participants list
      classroomState.participants = Array.from(connectedClients.values());
      
      // Notify remaining clients
      io.emit('participants-updated', classroomState.participants);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Virtual Classroom Server running on http://localhost:${PORT}`);
  console.log(`📚 Open multiple tabs to test teacher/student interaction`);
});