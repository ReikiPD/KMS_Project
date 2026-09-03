const crypto = require("crypto");
const path = require("path");
const fs = require("fs/promises");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { mediaOptimization } = require("../config/env");

const execFileAsync = promisify(execFile);
let activeJobs = 0;

const acquireSlot = () => {
  if (activeJobs >= mediaOptimization.concurrency) return false;
  activeJobs += 1;
  return true;
};

const releaseSlot = () => {
  activeJobs = Math.max(0, activeJobs - 1);
};

const runConverter = (binary, args) => execFileAsync(binary, args, {
  timeout: mediaOptimization.timeoutMs,
  windowsHide: true,
  maxBuffer: 2 * 1024 * 1024,
});

const optimizedName = (file, extension) => {
  const prefix = path.basename(file.filename, path.extname(file.filename)).replace(/[^a-zA-Z0-9_-]/g, "");
  return `${prefix}-optimized-${crypto.randomUUID()}${extension}`;
};

const shouldUseResult = ({ originalSize, optimizedSize, forceFormat = false }) => {
  if (!Number.isFinite(optimizedSize) || optimizedSize < 1) return false;
  if (forceFormat && optimizedSize <= originalSize * 1.15) return true;
  const saving = ((originalSize - optimizedSize) / Math.max(1, originalSize)) * 100;
  return saving >= mediaOptimization.minSavingsPercent;
};

const optimizePdf = async (file) => {
  const outputName = optimizedName(file, ".pdf");
  const outputPath = path.join(path.dirname(file.path), outputName);
  await runConverter(mediaOptimization.ghostscriptPath, [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.7",
    `-dPDFSETTINGS=/${mediaOptimization.pdfQuality}`,
    "-dSAFER",
    "-dDetectDuplicateImages=true",
    "-dCompressFonts=true",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    `-sOutputFile=${outputPath}`,
    file.path,
  ]);
  return { outputName, outputPath, mimetype: "application/pdf", forceFormat: false };
};

const optimizeVideo = async (file) => {
  const outputName = optimizedName(file, ".mp4");
  const outputPath = path.join(path.dirname(file.path), outputName);
  await runConverter(mediaOptimization.ffmpegPath, [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", file.path,
    "-map_metadata", "-1",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", String(mediaOptimization.videoCrf),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ]);
  return { outputName, outputPath, mimetype: "video/mp4", forceFormat: file.mimetype !== "video/mp4" };
};

const optimizeUploadedMedia = async (file) => {
  if (!mediaOptimization.enabled || !file?.path) return { optimized: false, reason: "disabled" };
  const isPdf = file.mimetype === "application/pdf";
  const isVideo = String(file.mimetype || "").startsWith("video/") || file.mimetype === "application/ogg";
  if (!isPdf && !isVideo) return { optimized: false, reason: "unsupported" };

  if (!acquireSlot()) return { optimized: false, reason: "converter_busy" };
  let generated;
  try {
    const original = await fs.stat(file.path);
    generated = isPdf ? await optimizePdf(file) : await optimizeVideo(file);
    const optimized = await fs.stat(generated.outputPath);
    if (!shouldUseResult({ originalSize: original.size, optimizedSize: optimized.size, forceFormat: generated.forceFormat })) {
      await fs.unlink(generated.outputPath).catch(() => undefined);
      return { optimized: false, reason: "no_meaningful_saving", originalBytes: original.size };
    }

    await fs.unlink(file.path);
    file.filename = generated.outputName;
    file.path = generated.outputPath;
    file.mimetype = generated.mimetype;
    file.size = optimized.size;
    return {
      optimized: true,
      originalBytes: original.size,
      optimizedBytes: optimized.size,
      savedBytes: Math.max(0, original.size - optimized.size),
      savedPercent: Math.max(0, Math.round(((original.size - optimized.size) / Math.max(1, original.size)) * 100)),
    };
  } catch (error) {
    if (generated?.outputPath) await fs.unlink(generated.outputPath).catch(() => undefined);
    return { optimized: false, reason: "converter_failed", error: error.code === "ENOENT" ? "converter_not_installed" : error.message };
  } finally {
    releaseSlot();
  }
};

module.exports = { optimizeUploadedMedia };
