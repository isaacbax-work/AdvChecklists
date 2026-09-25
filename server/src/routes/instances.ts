import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getRole, roleAtLeast } from "../services/access.js";
import {
  executeActions,
  type ActionDef,
  type CheckboxConfig,
  type ButtonConfig,
  type DateConfig,
  type TextConfig,
} from "../services/actions.js";

export const instancesRouter = Router();
instancesRouter.use(requireAuth);

function serializeInstance(instance: {
  id: string;
  title: string;
  status: string;
  templateId: string;
  templateVersionId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { id: string; name: string; email: string };
  template?: { title: string };
}) {
  return {
    id: instance.id,
    title: instance.title,
    status: instance.status,
    templateId: instance.templateId,
    templateTitle: instance.template?.title,
    templateVersionId: instance.templateVersionId,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
    createdBy: instance.createdBy,
  };
}

const createInstanceSchema = z.object({
  templateId: z.string().min(1),
  title: z.string().min(1),
  templateVersionId: z.string().optional(),
});

// Create a new instance ("run") of a template — a fillable copy that gets its own history.
instancesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createInstanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "templateId and title are required" });
  const { templateId, title } = parsed.data;

  const role = await getRole(templateId, req.userId!);
  if (!roleAtLeast(role, "FILLER")) return res.status(403).json({ error: "Access denied" });

  const version = parsed.data.templateVersionId
    ? await prisma.templateVersion.findFirst({
        where: { id: parsed.data.templateVersionId, templateId },
        include: { fields: true },
      })
    : await prisma.templateVersion.findFirst({
        where: { templateId },
        orderBy: { versionNumber: "desc" },
        include: { fields: true },
      });
  if (!version) return res.status(404).json({ error: "Template version not found" });

  const instance = await prisma.instance.create({
    data: {
      templateId,
      templateVersionId: version.id,
      title,
      createdById: req.userId!,
    },
  });

  // Auto-fill DATE fields configured to default to today's date.
  for (const field of version.fields) {
    if (field.type === "DATE") {
      const config: DateConfig = JSON.parse(field.config);
      if (config.autoFillToday) {
        await prisma.fieldValue.create({
          data: {
            instanceId: instance.id,
            fieldId: field.id,
            value: new Date().toISOString().slice(0, 10),
            updatedById: req.userId!,
          },
        });
      }
    }
  }

  res.status(201).json(serializeInstance(instance));
});

// List instances the caller can see: created by them, or on templates they have access to.
instancesRouter.get("/", async (req: AuthedRequest, res) => {
  const templateId = typeof req.query.templateId === "string" ? req.query.templateId : undefined;

  const accessibleTemplateIds = await prisma.template.findMany({
    where: {
      OR: [{ ownerId: req.userId! }, { collaborators: { some: { userId: req.userId! } } }],
      ...(templateId ? { id: templateId } : {}),
    },
    select: { id: true },
  });
  const ids = accessibleTemplateIds.map((t) => t.id);

  const instances = await prisma.instance.findMany({
    where: { templateId: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      template: { select: { title: true } },
    },
  });

  res.json({ instances: instances.map(serializeInstance) });
});

async function loadInstanceWithAccess(instanceId: string, userId: string) {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
  if (!instance) return { instance: null, role: null } as const;
  const role = await getRole(instance.templateId, userId);
  return { instance, role } as const;
}

instancesRouter.get("/:id", async (req: AuthedRequest, res) => {
  const { instance, role } = await loadInstanceWithAccess(req.params.id, req.userId!);
  if (!instance) return res.status(404).json({ error: "Instance not found" });
  if (!roleAtLeast(role, "FILLER")) return res.status(403).json({ error: "Access denied" });

  const [version, values] = await Promise.all([
    prisma.templateVersion.findUnique({
      where: { id: instance.templateVersionId },
      include: { fields: { orderBy: { order: "asc" } } },
    }),
    prisma.fieldValue.findMany({
      where: { instanceId: instance.id },
      include: { updatedBy: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  res.json({
    ...serializeInstance(instance),
    document: version
      ? {
          url: `/uploads/${version.documentFilename}`,
          mimeType: version.documentMimeType,
          versionNumber: version.versionNumber,
        }
      : null,
    fields: version?.fields.map((f) => ({
      id: f.id,
      type: f.type,
      label: f.label,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      order: f.order,
      config: JSON.parse(f.config),
    })),
    values: values.reduce<Record<string, { value: string | null; updatedAt: Date; updatedBy: unknown }>>(
      (acc, v) => {
        acc[v.fieldId] = { value: v.value, updatedAt: v.updatedAt, updatedBy: v.updatedBy };
        return acc;
      },
      {}
    ),
  });
});

const setFieldValueSchema = z.object({
  value: z.union([z.string(), z.boolean(), z.null()]),
});

// Update a single field's value on an instance. Checkbox toggles and button presses
// may trigger configured actions (send email, set another field's date, mark complete).
instancesRouter.patch("/:id/fields/:fieldId", async (req: AuthedRequest, res) => {
  const { instance, role } = await loadInstanceWithAccess(req.params.id, req.userId!);
  if (!instance) return res.status(404).json({ error: "Instance not found" });
  if (!roleAtLeast(role, "FILLER")) return res.status(403).json({ error: "Access denied" });

  const parsed = setFieldValueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "value is required" });

  const field = await prisma.field.findFirst({
    where: { id: req.params.fieldId, templateVersionId: instance.templateVersionId },
  });
  if (!field) return res.status(404).json({ error: "Field not found on this instance's template version" });

  const rawValue = parsed.data.value;
  const stringValue = rawValue === null ? null : typeof rawValue === "boolean" ? String(rawValue) : rawValue;

  const fieldValue = await prisma.fieldValue.upsert({
    where: { instanceId_fieldId: { instanceId: instance.id, fieldId: field.id } },
    create: { instanceId: instance.id, fieldId: field.id, value: stringValue, updatedById: req.userId! },
    update: { value: stringValue, updatedById: req.userId! },
  });

  // A TEXT field marked "use as checklist title" keeps the instance's title in
  // sync with whatever the filler types into it.
  if (field.type === "TEXT") {
    const config: TextConfig = JSON.parse(field.config);
    if (config.useAsTitle && stringValue && stringValue.trim()) {
      await prisma.instance.update({ where: { id: instance.id }, data: { title: stringValue.trim() } });
    }
  }

  let actionsToRun: ActionDef[] = [];
  if (field.type === "CHECKBOX") {
    const config: CheckboxConfig = JSON.parse(field.config);
    const checked = stringValue === "true";
    actionsToRun = checked ? config.checkedActions ?? [] : config.uncheckedActions ?? [];
  } else if (field.type === "BUTTON") {
    const config: ButtonConfig = JSON.parse(field.config);
    actionsToRun = config.actions ?? [];
  }

  if (actionsToRun.length > 0) {
    await executeActions(actionsToRun, { instance, field, userId: req.userId! });
  }

  const refreshedInstance = await prisma.instance.findUnique({ where: { id: instance.id } });
  res.json({
    fieldId: field.id,
    value: fieldValue.value,
    updatedAt: fieldValue.updatedAt,
    instanceStatus: refreshedInstance?.status,
    actionsTriggered: actionsToRun.map((a) => a.type),
  });
});

// Delete a checklist run entirely, along with its field values and action log.
// Allowed for template editors/owners, or whoever started the run themselves.
instancesRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const { instance, role } = await loadInstanceWithAccess(req.params.id, req.userId!);
  if (!instance) return res.status(404).json({ error: "Instance not found" });
  const canDelete = roleAtLeast(role, "EDITOR") || instance.createdById === req.userId;
  if (!canDelete) return res.status(403).json({ error: "Access denied" });

  await prisma.instance.delete({ where: { id: instance.id } });
  res.status(204).end();
});

// Full action/audit history for an instance — every send_email / set_date / mark_complete
// action that fired, in order, plus who triggered them and whether they succeeded.
instancesRouter.get("/:id/history", async (req: AuthedRequest, res) => {
  const { instance, role } = await loadInstanceWithAccess(req.params.id, req.userId!);
  if (!instance) return res.status(404).json({ error: "Instance not found" });
  if (!roleAtLeast(role, "FILLER")) return res.status(403).json({ error: "Access denied" });

  const logs = await prisma.actionLog.findMany({
    where: { instanceId: instance.id },
    orderBy: { performedAt: "asc" },
    include: {
      field: { select: { id: true, label: true } },
      performedBy: { select: { id: true, name: true, email: true } },
    },
  });

  res.json({
    history: logs.map((l) => ({
      id: l.id,
      actionType: l.actionType,
      status: l.status,
      detail: l.detail,
      field: l.field,
      performedBy: l.performedBy,
      performedAt: l.performedAt,
    })),
  });
});
