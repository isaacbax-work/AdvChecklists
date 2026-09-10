import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { attachmentUpload } from "../services/upload.js";

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

// Upload a file to attach to a "send email" action, independent of any template
// document. Returns the stored filename so it can be referenced from a Field's
// send_email action config and re-attached every time that action fires.
uploadsRouter.post("/attachments", attachmentUpload.single("file"), (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  res.status(201).json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
});
