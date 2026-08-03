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
