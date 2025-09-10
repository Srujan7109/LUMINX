const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const pdfPoppler = require("pdf-poppler");
const { execFile, exec } = require("child_process");
const { classroomState } = require("../state/classroomState");

async function convertPdfToImages(pdfPath, outDir, io, classroomId) {
  const opts = {
    format: "png",
    out_dir: outDir,
    out_prefix: "page",
    page: null,
  };
  await pdfPoppler.convert(pdfPath, opts);
  let files = fs
    .readdirSync(outDir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || "0", 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || "0", 10);
      return numA - numB;
    });
  if (!files.length) throw new Error(`No slides generated from ${pdfPath}`);
  io.emit("total-slides", { classroomId, totalSlides: files.length });
  const images = [];
  classroomState.preloadedSlides = new Set();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(outDir, file);
    const outputFilename = `slide-${i + 1}.webp`;
    const outPath = path.join(outDir, outputFilename);
    await sharp(filePath)
      .resize({ width: 720, withoutEnlargement: true })
      .webp({ quality: 60 })
      .toFile(outPath);
    fs.unlinkSync(filePath);
    const slideData = {
      url: `/slides/${classroomId}/${outputFilename}`,
      name: outputFilename,
      index: i,
    };
    images.push(slideData);
    io.emit("slide-ready", { classroomId, url: slideData.url, index: i });
    if (i < 4) {
      classroomState.preloadedSlides.add(i);
      io.emit("slide-preloaded", {
        classroomId,
        slideIndex: i,
        url: slideData.url,
        timestamp: Date.now(),
      });
    }
  }
  return images;
}

function convertPptToPdf(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Try typical Windows path first, then fallback to PATH 'soffice'
    const winSoffice = path.join(
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
    );
    const bin = fs.existsSync(winSoffice) ? winSoffice : "soffice";

    const args = [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      inputPath,
    ];

    const child = execFile(
      bin,
      args,
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          // Provide clearer guidance if soffice missing
          if (err.code === "ENOENT") {
            return reject(
              new Error(
                "LibreOffice not found. Install it and ensure 'soffice' is on PATH or at C\\Program Files\\LibreOffice\\program\\soffice.exe."
              )
            );
          }
          return reject(
            new Error(`PPTX conversion failed: ${stderr || err.message}`)
          );
        }

        const inputBaseName = path.basename(inputPath, path.extname(inputPath));
        const generatedPdfPath = path.join(outputDir, inputBaseName + ".pdf");
        setTimeout(() => {
          try {
            if (fs.existsSync(generatedPdfPath)) {
              if (generatedPdfPath !== outputPath)
                fs.renameSync(generatedPdfPath, outputPath);
              resolve();
            } else {
              reject(
                new Error(
                  `PDF not generated at expected location: ${generatedPdfPath}`
                )
              );
            }
          } catch (e) {
            reject(new Error(`PPTX post-processing failed: ${e.message}`));
          }
        }, 1000);
      }
    );

    // Safety timeout
    setTimeout(() => {
      try {
        child.kill();
      } catch (_) {}
      reject(new Error("LibreOffice conversion timeout"));
    }, 45000);
  });
}

module.exports = { convertPdfToImages, convertPptToPdf };
