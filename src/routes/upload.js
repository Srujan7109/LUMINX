const express = require("express");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const { upload } = require("../middleware/uploads");
const { getIo } = require("../sockets/io");
const { classroomState } = require("../state/classroomState");
const { convertPdfToImages, convertPptToPdf } = require("../services/conversion");

const router = express.Router();

router.post("/upload", upload.single("file"), async (req, res) => {
  const io = getIo();
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const ext = path.extname(file.originalname).toLowerCase();
    const id = uuidv4();
    const outDir = path.join(__dirname, "..", "..", "slides", id);
    io.emit("upload-started", { classroomId: id, filename: file.originalname, timestamp: Date.now() });
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    let images = [];
    try {
      if (ext === ".pdf") {
        images = await convertPdfToImages(file.path, outDir, io, id);
      } else if (ext === ".pptx") {
        const pdfPath = file.path + ".pdf";
        await convertPptToPdf(file.path, pdfPath);
        images = await convertPdfToImages(pdfPath, outDir, io, id);
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
        const outPath = path.join(outDir, `slide-1.jpg`);
        await sharp(file.path).resize(1280, null, { withoutEnlargement: true }).jpeg({ quality: 60, mozjpeg: true, progressive: true }).toFile(outPath);
        io.emit("total-slides", { classroomId: id, totalSlides: 1 });
        io.emit("slide-ready", { classroomId: id, url: `/slides/${id}/slide-1.jpg`, index: 0 });
        images = [{ url: `/slides/${id}/slide-1.jpg`, name: "slide-1.jpg", index: 0 }];
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }

      if (images.length === 0) throw new Error("No slides generated from file");

      classroomState.slideData = images;
      classroomState.totalSlides = images.length;
      classroomState.currentSlide = 0;

      io.emit("upload-complete", { classroomId: id, totalSlides: images.length, timestamp: Date.now() });
      res.json({ success: true, slides: images, totalSlides: images.length, classroomId: id });
    } catch (processingError) {
      if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
      throw processingError;
    }
  } catch (err) {
    res.status(500).json({ error: err.message || "File processing failed", details: process.env.NODE_ENV === "development" ? err.stack : undefined });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  }
});

module.exports = router;


