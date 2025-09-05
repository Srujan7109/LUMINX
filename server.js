const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const sharp = require("sharp");
const pdfPoppler = require("pdf-poppler");
const { exec } = require("child_process");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Add this line after your other middleware (before your routes)
app.use('/slides', express.static(path.join(__dirname, 'slides')));

// app.use('/slides', (req, res, next) => {
//   console.log('🔍 Slide request:', req.url);
  
//   // Convert URL path to proper file system path
//   const requestPath = req.url.replace(/\//g, path.sep);
//   const fullPath = path.join(__dirname, 'slides', requestPath);
  
//   console.log('🔍 Converted path:', fullPath);
//   console.log('🔍 File exists:', fs.existsSync(fullPath));
  
//   // If file exists, serve it manually to avoid path issues
//   if (fs.existsSync(fullPath)) {
//     console.log('✅ Serving file manually:', fullPath);
    
//     // Set proper headers
//     res.setHeader('Content-Type', 'image/jpeg');
//     res.setHeader('Cache-Control', 'public, max-age=3600');
    
//     // Read and send file
//     const fileStream = fs.createReadStream(fullPath);
//     fileStream.pipe(res);
    
//     fileStream.on('error', (err) => {
//       console.error('❌ Error reading file:', err);
//       res.status(500).send('Error reading file');
//     });
    
//     fileStream.on('end', () => {
//       console.log('✅ File sent successfully');
//     });
    
//     return; // Don't call next()
//   }
  
//   // If file doesn't exist, log details and continue to static middleware
//   console.log('❌ File not found, trying static middleware');
//   next();
// });

// // Keep the static middleware as backup

// app.use(express.static(path.join(__dirname, 'public')));

// Add this route - it will handle /slides/:id/:filename manually
// REPLACE your current slides routing with this:

// 1. REMOVE all the app.use('/slides', ...) middleware

// 2. KEEP ONLY this specific route:
app.get('/slides/:id/:filename', (req, res) => {
  console.log('🎯 MANUAL ROUTE CALLED for:', req.params);
  
  const { id, filename } = req.params;
  const filePath = path.join(__dirname, 'slides', id, filename);
  
  console.log('🎯 Looking for file:', filePath);
  console.log('🎯 File exists:', fs.existsSync(filePath));
  
  if (fs.existsSync(filePath)) {
    console.log('✅ File found, sending...');
    
    // Set proper headers
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (ext === '.png') {
      res.setHeader('Content-Type', 'image/png');
    }
    
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // Send file using absolute path
    res.sendFile(path.resolve(filePath), (err) => {
      if (err) {
        console.error('❌ Error sending file:', err);
        res.status(500).send('Error sending file');
      } else {
        console.log('✅ File sent successfully!');
      }
    });
    
  } else {
    console.log('❌ File not found');
    
    // Debug: show what files exist in that directory
    const dirPath = path.join(__dirname, 'slides', id);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      console.log('📂 Available files in directory:', files);
      
      res.status(404).json({
        error: 'File not found',
        requested: filename,
        directory: id,
        availableFiles: files
      });
    } else {
      console.log('📂 Directory does not exist:', dirPath);
      
      // Show all available slide directories
      const slidesDir = path.join(__dirname, 'slides');
      const availableDirs = fs.existsSync(slidesDir) ? fs.readdirSync(slidesDir) : [];
      
      res.status(404).json({
        error: 'Directory not found',
        requested: id,
        availableDirectories: availableDirs
      });
    }
  }
});

// 3. KEEP your public static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/slides', express.static(path.join(__dirname, 'slides'), {
  setHeaders: (res, filePath) => {
    console.log('📤 Static middleware serving:', filePath);
  }
}));

// 4. ADD a test route to verify everything works
app.get('/test-slides', (req, res) => {
  const slidesDir = path.join(__dirname, 'slides');
  
  if (!fs.existsSync(slidesDir)) {
    return res.json({ error: 'Slides directory does not exist' });
  }
  
  try {
    const directories = fs.readdirSync(slidesDir).filter(item => {
      return fs.statSync(path.join(slidesDir, item)).isDirectory();
    });
    
    const result = {};
    directories.forEach(dir => {
      const dirPath = path.join(slidesDir, dir);
      result[dir] = fs.readdirSync(dirPath);
    });
    
    res.json({
      success: true,
      slidesDirectory: slidesDir,
      slideDirectories: result,
      totalDirectories: directories.length
    });
    
  } catch (error) {
    res.json({
      error: error.message,
      slidesDirectory: slidesDir
    });
  }
});
// Make sure you don't have duplicate /slides routes!

// Store classroom state
let classroomState = {
  currentSlide: 0,
  totalSlides: 0,
  slideData: [], // Array of slide URLs
  isTeacherPresent: false,
  participants: [],
  preloadedSlides: new Set(), // Track which slides are ready
  preloadQueue: [], // Queue of slides being processed
  preloadBuffer: 3, // How many slides ahead to preload
  isPreloading: false
};

// Store connected clients
let connectedClients = new Map();

// Enhanced multer configuration with limits
const upload = multer({ 
  dest: "uploads/",
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.pptx', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});


async function autoPreloadSlides(currentSlide, classroomId, io) {
  if (classroomState.isPreloading) {
    console.log("⏳ Already preloading, skipping...");
    return;
  }

  classroomState.isPreloading = true;
  
  try {
    const slidesToPreload = [];
    
    // Determine which slides need preloading
    for (let i = 1; i <= classroomState.preloadBuffer; i++) {
      const nextSlideIndex = currentSlide + i;
      
      if (nextSlideIndex < classroomState.totalSlides && 
          !classroomState.preloadedSlides.has(nextSlideIndex)) {
        
        slidesToPreload.push(nextSlideIndex);
      }
    }

    if (slidesToPreload.length === 0) {
      console.log("✅ All nearby slides already preloaded");
      classroomState.isPreloading = false;
      return;
    }

    console.log(`🚀 Auto-preloading slides: ${slidesToPreload.map(s => s + 1).join(', ')}`);

    // Emit preload start notification
    io.emit("preload-started", {
      classroomId,
      slidesToPreload,
      currentSlide,
      timestamp: Date.now()
    });

    // Process slides in parallel but with controlled concurrency
    await processSlidePreloads(slidesToPreload, classroomId, io);

    console.log("✅ Auto-preloading completed");
    
  } catch (error) {
    console.error("❌ Auto-preload failed:", error);
  } finally {
    classroomState.isPreloading = false;
  }
}

async function preloadSingleSlide(slideIndex, classroomId, io) {
  try {
    if (classroomState.preloadedSlides.has(slideIndex)) {
      return; // Already preloaded
    }

    const slideData = classroomState.slideData[slideIndex];
    if (!slideData) {
      console.warn(`⚠️ Slide ${slideIndex + 1} data not found`);
      return;
    }

    // Get the actual file path
    const slidePath = path.join(__dirname, 'slides', classroomId, slideData.name);
    
    if (!fs.existsSync(slidePath)) {
      console.warn(`⚠️ Slide file not found: ${slidePath}`);
      return;
    }

    // Mark as preloaded (the file is already processed and ready)
    classroomState.preloadedSlides.add(slideIndex);
    
    // Notify clients that slide is ready for instant loading
    io.emit("slide-preloaded", {
      classroomId,
      slideIndex,
      url: slideData.url,
      fileSize: fs.statSync(slidePath).size,
      timestamp: Date.now()
    });

    console.log(`✅ Slide ${slideIndex + 1} preloaded and ready`);
    
  } catch (error) {
    console.error(`❌ Failed to preload slide ${slideIndex + 1}:`, error);
  }
}


// Enhanced upload endpoint with better error handling
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const id = uuidv4();
    const outDir = path.join(__dirname, "slides", id);

    // Emit upload started
    io.emit("upload-started", {
      classroomId: id,
      filename: file.originalname,
      timestamp: Date.now()
    });

    // Create output directory
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    let images = [];

    try {
      if (ext === ".pdf") {
        console.log("📄 Converting PDF...");
        images = await convertPdfToImages(file.path, outDir, io, id);
      } else if (ext === ".pptx") {
        console.log("📊 Converting PPTX to PDF...");
        const pdfPath = file.path + ".pdf";
        await convertPptToPdf(file.path, pdfPath);
        images = await convertPdfToImages(pdfPath, outDir, io, id);
        
        // Clean up temporary PDF
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
        console.log("🖼️ Processing image...");
        const outPath = path.join(outDir, `slide-1.jpg`);
        
        // Process and compress image
        await sharp(file.path)
          .resize(1280, null, { withoutEnlargement: true })
          .jpeg({ quality: 60, mozjpeg: true, progressive: true })
          .toFile(outPath);

        // Emit total slides for single image
        io.emit("total-slides", {
          classroomId: id,
          totalSlides: 1
        });

        // Emit slide ready
        io.emit("slide-ready", {
          classroomId: id,
          url: `/slides/${id}/slide-1.jpg`,
          index: 0
        });

        // Add to images array
        images = [{
          url: `/slides/${id}/slide-1.jpg`,
          name: 'slide-1.jpg',
          index: 0
        }];
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }

      if (images.length === 0) {
        throw new Error("No slides generated from file");
      }

      // Update classroom state
      classroomState.slideData = images;
      classroomState.totalSlides = images.length;
      classroomState.currentSlide = 0;

      console.log("✅ Generated images:", images.length);

      res.json({ 
        success: true, 
        slides: images,
        totalSlides: images.length,
        classroomId: id
      });

    } catch (processingError) {
      console.error("File processing error:", processingError);
      
      // Clean up on error
      if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
      
      throw processingError;
    }

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ 
      error: err.message || "File processing failed",
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    // Always clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// Utility function to sanitize filenames
function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
}

// Enhanced PDF to images conversion - NOW RETURNS IMAGE ARRAY
// async function convertPdfToImages(pdfPath, outDir, io, classroomId) {
//   try {
//     const opts = {
//       format: "png",
//       out_dir: outDir,
//       out_prefix: "page",
//       page: null,
//     };

//     // Convert PDF → PNGs
//     await pdfPoppler.convert(pdfPath, opts);

//     let files = fs.readdirSync(outDir)
//       .filter(f => f.toLowerCase().endsWith('.png'))
//       .sort((a, b) => {
//         const numA = parseInt(a.match(/\d+/)?.[0] || "0", 10);
//         const numB = parseInt(b.match(/\d+/)?.[0] || "0", 10);
//         return numA - numB;
//       });

//     if (!files.length) throw new Error(`No slides generated from ${pdfPath}`);

//     console.log(`📊 Total slides to process: ${files.length}`);
//     io.emit("total-slides", {
//       classroomId,
//       totalSlides: files.length
//     });

//     const images = []; // Array to collect processed slides

//     // Process slides one by one (so order is preserved)
//     for (let i = 0; i < files.length; i++) {
//       const file = files[i];
//       const filePath = path.join(outDir, file);
//       const outputFilename = `slide-${i + 1}.webp`;
//       const outPath = path.join(outDir, outputFilename);

//       await sharp(filePath)
//         .resize({ width: 720, withoutEnlargement: true })
//         .webp({ quality: 60 })
//         .toFile(outPath);

//       // Delete original PNG
//       fs.unlinkSync(filePath);

//       // Add to images array
//       const slideData = {
//         url: `/slides/${classroomId}/${outputFilename}`,
//         name: outputFilename,
//         index: i
//       };
//       images.push(slideData);

//       // Emit slide immediately after it's ready
//       io.emit("slide-ready", {
//         classroomId,
//         url: slideData.url,
//         index: i
//       });
//     }

//     console.log(`✅ PDF converted progressively in ${outDir}`);
//     return images; // Return the processed images array
//   } catch (err) {
//     console.error("PDF conversion failed:", err);
//     throw err;
//   }
// }


async function convertPdfToImages(pdfPath, outDir, io, classroomId) {
  try {
    const opts = {
      format: "png",
      out_dir: outDir,
      out_prefix: "page",
      page: null,
    };

    // Convert PDF → PNGs
    await pdfPoppler.convert(pdfPath, opts);

    let files = fs.readdirSync(outDir)
      .filter(f => f.toLowerCase().endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || "0", 10);
        const numB = parseInt(b.match(/\d+/)?.[0] || "0", 10);
        return numA - numB;
      });

    if (!files.length) throw new Error(`No slides generated from ${pdfPath}`);

    console.log(`📊 Total slides to process: ${files.length}`);
    io.emit("total-slides", {
      classroomId,
      totalSlides: files.length
    });

    const images = [];
    classroomState.preloadedSlides = new Set();

    // Process slides one by one
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(outDir, file);
      const outputFilename = `slide-${i + 1}.webp`;
      const outPath = path.join(outDir, outputFilename);

      await sharp(filePath)
        .resize({ width: 720, withoutEnlargement: true })
        .webp({ quality: 60 })
        .toFile(outPath);

      // Delete original PNG
      fs.unlinkSync(filePath);

      const slideData = {
        url: `/slides/${classroomId}/${outputFilename}`,
        name: outputFilename,
        index: i
      };
      images.push(slideData);

      // Emit slide immediately after it's ready
      io.emit("slide-ready", {
        classroomId,
        url: slideData.url,
        index: i
      });

      // Preload first 4 slides
      if (i < 4) {
        classroomState.preloadedSlides.add(i);

        io.emit("slide-preloaded", {
          classroomId,
          slideIndex: i,
          url: slideData.url,
          timestamp: Date.now()
        });
      }
    }

    console.log(`✅ PDF converted progressively in ${outDir}`);
    return images;
  } catch (err) {
    console.error("PDF conversion failed:", err);
    throw err;
  }
}


function convertPptToPdf(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('LibreOffice conversion timeout'));
    }, 30000); // 30 second timeout

    // Extract directory from outputPath for LibreOffice
    const outputDir = path.dirname(outputPath);
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    console.log(`Converting PPTX: ${inputPath} -> ${outputPath}`);
    
    const command = `soffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;
    console.log('Executing LibreOffice command:', command);
    
    exec(command, (err, stdout, stderr) => {
      clearTimeout(timeout);
      
      if (err) {
        console.error('LibreOffice error:', err);
        console.error('LibreOffice stderr:', stderr);
        reject(new Error(`PPTX conversion failed: ${err.message}`));
        return;
      }
      
      console.log('LibreOffice stdout:', stdout);
      
      // LibreOffice creates PDF with same base name as input file
      const inputBaseName = path.basename(inputPath, path.extname(inputPath));
      const generatedPdfPath = path.join(outputDir, inputBaseName + '.pdf');
      
      console.log('Looking for generated PDF at:', generatedPdfPath);
      
      // Wait a moment for file system to update
      setTimeout(() => {
        if (fs.existsSync(generatedPdfPath)) {
          // Move to desired output path if different
          if (generatedPdfPath !== outputPath) {
            try {
              fs.renameSync(generatedPdfPath, outputPath);
              console.log('✅ PDF successfully renamed to:', outputPath);
            } catch (renameErr) {
              console.error('Failed to rename PDF:', renameErr);
              reject(new Error(`Failed to rename PDF: ${renameErr.message}`));
              return;
            }
          }
          resolve();
        } else {
          // List all files in output directory for debugging
          console.error('Generated PDF not found. Files in output directory:');
          try {
            const files = fs.readdirSync(outputDir);
            console.error('Files:', files);
          } catch (listErr) {
            console.error('Could not list directory:', listErr);
          }
          reject(new Error(`PDF not generated at expected location: ${generatedPdfPath}`));
        }
      }, 1000); // Wait 1 second for file system
    });
  });
}

io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  socket.on('join-classroom', (data) => {
    const { role, name } = data;
    
    if (!role || !name) {
      socket.emit('error', { message: 'Role and name are required' });
      return;
    }
    
    connectedClients.set(socket.id, { role, name, socketId: socket.id, joinedAt: Date.now() });
    
    if (role === 'teacher') classroomState.isTeacherPresent = true;
    
    // Update participants list
    classroomState.participants = Array.from(connectedClients.values());
    
    // Send current classroom state to the new client
    socket.emit('classroom-state', classroomState);
    
    // Notify all clients about updated participant list
    io.emit('participants-updated', classroomState.participants);

    console.log("User connected:", socket.id);

  // When teacher changes slide, trigger auto-preloading
  socket.on("teacher-slide-change", (data) => {
    const { classroomId, currentSlide, totalSlides } = data;
    
    // Update classroom state
    classroomState.currentSlide = currentSlide;
    
    // Broadcast to all clients
    socket.broadcast.emit("slide-changed", {
      classroomId,
      currentSlide,
      totalSlides,
      timestamp: Date.now()
    });

    // NEW: Trigger auto-preloading for upcoming slides
    setTimeout(() => {
      autoPreloadSlides(currentSlide, classroomId, io);
    }, 100); // Small delay to let slide change complete

    console.log(`📊 Changed to slide ${currentSlide + 1}/${totalSlides}`);
  });

  // NEW: Manual preload trigger (optional)
  socket.on("trigger-preload", (data) => {
    const { classroomId, currentSlide } = data;
    autoPreloadSlides(currentSlide, classroomId, io);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
  });

  // **Handle client disconnect**
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    const client = connectedClients.get(socket.id);
    if (client) {
      connectedClients.delete(socket.id);
      
      // Update teacher presence if needed
      if (client.role === 'teacher') classroomState.isTeacherPresent = false;
      
      // Update participants list
      classroomState.participants = Array.from(connectedClients.values());
      
      // Notify all clients about updated participant list
      io.emit('participants-updated', classroomState.participants);
    }
  });


  // Handle slide changes (teacher only)
  socket.on('change-slide', (data) => {
    const client = connectedClients.get(socket.id);

    if (!client || client.role !== 'teacher') {
      socket.emit('error', { message: 'Only teachers can change slides' });
      return;
    }

    const slideNumber = parseInt(data.slideNumber);
    if (isNaN(slideNumber) || slideNumber < 0 || slideNumber >= classroomState.totalSlides) {
      socket.emit('error', { message: 'Invalid slide number' });
      return;
    }

    classroomState.currentSlide = slideNumber;

    // Send update to all clients
    io.emit('slide-changed', {
      slideNumber: slideNumber,
      timestamp: Date.now()
    });

    console.log(`Teacher changed to slide ${slideNumber}`);
  });
  
  // Handle chat messages
  socket.on('send-message', (data) => {
    const client = connectedClients.get(socket.id);
    if (!client) {
      return;
    }

    if (!data.text || data.text.trim().length === 0) {
      socket.emit('error', { message: 'Message cannot be empty' });
      return;
    }

    // Limit message length
    const messageText = data.text.trim().substring(0, 500);
    
    const message = {
      id: Date.now(),
      sender: client.name,
      role: client.role,
      text: messageText,
      timestamp: Date.now()
    };
    
    // Broadcast message to all clients
    io.emit('new-message', message);
    
    console.log(`${client.role} ${client.name}: ${messageText}`);
  });
  
  // Handle WebRTC signaling for audio streaming
  socket.on('webrtc-offer', (data) => {
    const client = connectedClients.get(socket.id);
    if (client && client.role === 'teacher') {
      socket.broadcast.emit('webrtc-offer', {
        offer: data.offer,
        senderId: socket.id
      });
    }
  });
  
  socket.on('webrtc-answer', (data) => {
    if (data.targetId && connectedClients.has(data.targetId)) {
      io.to(data.targetId).emit('webrtc-answer', {
        answer: data.answer,
        senderId: socket.id
      });
    }
  });
  
  socket.on('webrtc-ice-candidate', (data) => {
    if (data.targetId && connectedClients.has(data.targetId)) {
      io.to(data.targetId).emit('webrtc-ice-candidate', {
        candidate: data.candidate,
        senderId: socket.id
      });
    } else {
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
        socket.broadcast.emit('teacher-left');
      }
      
      connectedClients.delete(socket.id);
      classroomState.participants = Array.from(connectedClients.values());
      
      io.emit('participants-updated', classroomState.participants);
    }
  });
});

// Cleanup function for old slides (call periodically)
function cleanupOldSlides() {
  const slidesDir = path.join(__dirname, 'slides');
  if (!fs.existsSync(slidesDir)) return;

  const dirs = fs.readdirSync(slidesDir);
  const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

  dirs.forEach(dir => {
    const dirPath = path.join(slidesDir, dir);
    try {
      const stats = fs.statSync(dirPath);
      if (stats.isDirectory() && stats.mtime.getTime() < cutoffTime) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`Cleaned up old slides directory: ${dir}`);
      }
    } catch (err) {
      console.error(`Error cleaning up ${dir}:`, err.message);
    }
  });
}

// Run cleanup every hour
setInterval(cleanupOldSlides, 60 * 60 * 1000);

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
  }
  res.status(500).json({ error: error.message });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Virtual Classroom Server running on http://localhost:${PORT}`);
  console.log(`📚 Open multiple tabs to test teacher/student interaction`);
  
  // Create necessary directories
  const dirs = ['uploads', 'slides'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
});