import multer from "multer";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import fs from "node:fs";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Unsupported file type. Allowed: PDF, PNG, JPEG."));
      return;
    }
    cb(null, true);
  },
});

// Broader allow-list for files attached to outgoing emails — these aren't
// rendered as a checklist document, so office/text/archive formats are fine.
const ALLOWED_ATTACHMENT_MIME = new Set([
  ...ALLOWED_MIME,
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);

export const attachmentUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIME.has(file.mimetype)) {
      cb(new Error("Unsupported attachment type."));
      return;
    }
    cb(null, true);
  },
});
