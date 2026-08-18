const fs = require("fs/promises");
const path = require("path");
const { PDFParse } = require("pdf-parse");

const uploadsDirectory = path.join(__dirname, "../uploads");
const MAX_EXTRACTED_TEXT = 200000;

const extractPdfText = async (fileName) => {
  if (!fileName) return "";
  let parser;
  try {
    const data = await fs.readFile(path.join(uploadsDirectory, fileName));
    parser = new PDFParse({ data });
    const result = await parser.getText();
    return (result.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_EXTRACTED_TEXT);
  } catch (error) {
    // A scanned or malformed PDF is still a legitimate upload; it simply has no searchable text.
    console.warn(`PDF text extraction skipped for ${fileName}: ${error.message}`);
    return "";
  } finally {
    await parser?.destroy?.().catch(() => undefined);
  }
};

module.exports = { extractPdfText, uploadsDirectory };
