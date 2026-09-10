import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { templatesRouter } from "./routes/templates.js";
import { instancesRouter } from "./routes/instances.js";
import { uploadsRouter } from "./routes/uploads.js";
import { UPLOAD_DIR } from "./services/upload.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use("/uploads", express.static(UPLOAD_DIR));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/templates", templatesRouter);
  app.use("/api/instances", instancesRouter);
  app.use("/api/uploads", uploadsRouter);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  });

  return app;
}
