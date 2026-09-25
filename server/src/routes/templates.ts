import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { upload } from "../services/upload.js";
import { getRole, roleAtLeast } from "../services/access.js";

export const templatesRouter = Router();
templatesRouter.use(requireAuth);

const fieldSchema = z.object({
  id: z.string().optional(), // present when editing an existing field, ignored on create
  type: z.enum(["CHECKBOX", "BUTTON", "DATE", "TEXT", "SELECT", "NUMBER"]),
  label: z.string().min(1),
  page: z.number().int().min(1).default(1),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  order: z.number().int().default(0),
  config: z.record(z.any()).default({}),
});

function serializeVersion(version: {
  id: string;
  versionNumber: number;
  documentFilename: string;
  documentOriginalName: string;
  documentMimeType: string;
  createdAt: Date;
  createdById: string;
  fields?: {
    id: string;
    type: string;
    label: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    order: number;
    config: string;
  }[];
}) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    documentUrl: `/uploads/${version.documentFilename}`,
    documentOriginalName: version.documentOriginalName,
    documentMimeType: version.documentMimeType,
    createdAt: version.createdAt,
    createdById: version.createdById,
    fields: version.fields?.map((f) => ({ ...f, config: JSON.parse(f.config) })),
  };
}

// Create a new template with its first version (document upload + initial fields).
templatesRouter.post("/", upload.single("document"), async (req: AuthedRequest, res) => {
  const title = String(req.body.title ?? "").trim();
  const description = req.body.description ? String(req.body.description) : null;
  if (!title) return res.status(400).json({ error: "title is required" });
  if (!req.file) return res.status(400).json({ error: "document file is required" });

  let fields: z.infer<typeof fieldSchema>[] = [];
  if (req.body.fields) {
    try {
      const parsed = JSON.parse(req.body.fields);
      fields = z.array(fieldSchema).parse(parsed);
    } catch {
      return res.status(400).json({ error: "fields must be valid JSON matching the field schema" });
    }
  }

  const template = await prisma.template.create({
    data: {
      title,
      description,
      ownerId: req.userId!,
      versions: {
        create: {
          versionNumber: 1,
          documentFilename: req.file.filename,
          documentOriginalName: req.file.originalname,
          documentMimeType: req.file.mimetype,
          createdById: req.userId!,
          fields: {
            create: fields.map((f) => ({
              ...(f.id ? { id: f.id } : {}),
              type: f.type,
              label: f.label,
              page: f.page,
              x: f.x,
              y: f.y,
              width: f.width,
              height: f.height,
              order: f.order,
              config: JSON.stringify(f.config),
            })),
          },
        },
      },
    },
    include: { versions: { include: { fields: true } } },
  });

  res.status(201).json({
    id: template.id,
    title: template.title,
    description: template.description,
    ownerId: template.ownerId,
    createdAt: template.createdAt,
    currentVersion: serializeVersion(template.versions[0]),
  });
});

// List templates the caller owns or collaborates on.
templatesRouter.get("/", async (req: AuthedRequest, res) => {
  const templates = await prisma.template.findMany({
    where: {
      OR: [{ ownerId: req.userId! }, { collaborators: { some: { userId: req.userId! } } }],
    },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { instances: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  res.json({
    templates: templates.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      owner: t.owner,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      instanceCount: t._count.instances,
      latestVersion: t.versions[0] ? serializeVersion(t.versions[0]) : null,
    })),
  });
});

async function loadTemplateOr404(templateId: string, res: import("express").Response) {
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return null;
  }
  return template;
}

templatesRouter.get("/:id", async (req: AuthedRequest, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!roleAtLeast(role, "FILLER")) return res.status(403).json({ error: "Access denied" });

  const template = await prisma.template.findUnique({
    where: { id: req.params.id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      versions: { orderBy: { versionNumber: "desc" }, include: { fields: true } },
      collaborators: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!template) return res.status(404).json({ error: "Template not found" });

  res.json({
    id: template.id,
    title: template.title,
    description: template.description,
    owner: template.owner,
    myRole: role,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    versions: template.versions.map(serializeVersion),
    currentVersion: serializeVersion(template.versions[0]),
    collaborators: template.collaborators.map((c) => ({
      userId: c.userId,
      name: c.user.name,
      email: c.user.email,
      role: c.role,
      invitedAt: c.invitedAt,
    })),
  });
});

// Delete a template entirely — every version, field, collaborator, checklist run,
// and action log under it goes with it (enforced by cascading foreign keys).
templatesRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!roleAtLeast(role, "OWNER")) return res.status(403).json({ error: "Access denied" });

  await prisma.template.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

const updateFieldsSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  fields: z.array(fieldSchema),
});

// Publishing a new set of fields (optionally with a replacement document) creates a
// new TemplateVersion, preserving prior versions as history.
templatesRouter.put("/:id/fields", upload.single("document"), async (req: AuthedRequest, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!roleAtLeast(role, "EDITOR")) return res.status(403).json({ error: "Access denied" });

  const template = await loadTemplateOr404(req.params.id, res);
  if (!template) return;

  let body: z.infer<typeof updateFieldsSchema>;
  try {
    const raw = req.body.fields ? JSON.parse(req.body.fields) : req.body;
    body = updateFieldsSchema.parse(raw);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid payload" });
  }

  const latest = await prisma.templateVersion.findFirst({
    where: { templateId: template.id },
    orderBy: { versionNumber: "desc" },
  });
  if (!latest) return res.status(500).json({ error: "Template has no versions" });

  const documentFilename = req.file?.filename ?? latest.documentFilename;
  const documentOriginalName = req.file?.originalname ?? latest.documentOriginalName;
  const documentMimeType = req.file?.mimetype ?? latest.documentMimeType;

  const newVersion = await prisma.templateVersion.create({
    data: {
      templateId: template.id,
      versionNumber: latest.versionNumber + 1,
      documentFilename,
      documentOriginalName,
      documentMimeType,
      createdById: req.userId!,
      fields: {
        create: body.fields.map((f) => ({
          ...(f.id ? { id: f.id } : {}),
          type: f.type,
          label: f.label,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          order: f.order,
          config: JSON.stringify(f.config),
        })),
      },
    },
    include: { fields: true },
  });

  if (body.title !== undefined || body.description !== undefined) {
    await prisma.template.update({
      where: { id: template.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });
  }

  res.status(201).json({ currentVersion: serializeVersion(newVersion) });
});

templatesRouter.get("/:id/versions", async (req: AuthedRequest, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!roleAtLeast(role, "FILLER")) return res.status(403).json({ error: "Access denied" });

  const versions = await prisma.templateVersion.findMany({
    where: { templateId: req.params.id },
    orderBy: { versionNumber: "desc" },
    include: { fields: true, createdBy: { select: { id: true, name: true, email: true } } },
  });
  res.json({ versions: versions.map((v) => ({ ...serializeVersion(v), createdBy: v.createdBy })) });
});

const addCollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(["EDITOR", "FILLER"]),
});

templatesRouter.get("/:id/collaborators", async (req: AuthedRequest, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!roleAtLeast(role, "FILLER")) return res.status(403).json({ error: "Access denied" });

  const collaborators = await prisma.templateCollaborator.findMany({
    where: { templateId: req.params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json({
    collaborators: collaborators.map((c) => ({
      userId: c.userId,
      name: c.user.name,
      email: c.user.email,
      role: c.role,
      invitedAt: c.invitedAt,
    })),
  });
});

templatesRouter.post("/:id/collaborators", async (req: AuthedRequest, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!roleAtLeast(role, "OWNER")) return res.status(403).json({ error: "Only the owner can manage collaborators" });

  const parsed = addCollaboratorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "email and role are required" });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return res.status(404).json({ error: "No user found with that email. They must register first." });

  const collaborator = await prisma.templateCollaborator.upsert({
    where: { templateId_userId: { templateId: req.params.id, userId: user.id } },
    create: { templateId: req.params.id, userId: user.id, role: parsed.data.role },
    update: { role: parsed.data.role },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  res.status(201).json({
    userId: collaborator.userId,
    name: collaborator.user.name,
    email: collaborator.user.email,
    role: collaborator.role,
    invitedAt: collaborator.invitedAt,
  });
});

templatesRouter.delete("/:id/collaborators/:userId", async (req: AuthedRequest, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!roleAtLeast(role, "OWNER")) return res.status(403).json({ error: "Only the owner can manage collaborators" });

  await prisma.templateCollaborator.deleteMany({
    where: { templateId: req.params.id, userId: req.params.userId },
  });
  res.status(204).send();
});

// History of every instance (completed document) ever created from this template.
templatesRouter.get("/:id/instances", async (req: AuthedRequest, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!roleAtLeast(role, "FILLER")) return res.status(403).json({ error: "Access denied" });

  const instances = await prisma.instance.findMany({
    where: { templateId: req.params.id },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      templateVersion: { select: { versionNumber: true } },
    },
  });

  res.json({
    instances: instances.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      versionNumber: i.templateVersion.versionNumber,
      createdBy: i.createdBy,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    })),
  });
});
