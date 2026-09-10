import path from "node:path";
import { prisma } from "../db.js";
import { sendEmail } from "./email.js";
import { UPLOAD_DIR } from "./upload.js";
import type { Field, Instance } from "@prisma/client";

export interface EmailAttachmentRef {
  filename: string;
  originalName: string;
}

export type ActionDef =
  | { type: "send_email"; to: string; subject: string; body: string; attachments?: EmailAttachmentRef[] }
  | { type: "set_date"; targetFieldId: string; value?: string }
  | { type: "mark_complete" };

export interface CheckboxConfig {
  checkedActions?: ActionDef[];
  uncheckedActions?: ActionDef[];
}

export interface ButtonConfig {
  actions?: ActionDef[];
}

export interface DateConfig {
  autoFillToday?: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function interpolate(template: string, vars: Record<string, string>, fieldVars: Record<string, string>): string {
  return template
    .replace(/\{\{\s*field:([^}]+?)\s*\}\}/g, (_match, label: string) => fieldVars[label] ?? "")
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

function formatFieldValue(type: string, raw: string | null): string {
  if (raw === null || raw === undefined) return "";
  if (type === "CHECKBOX") return raw === "true" ? "Yes" : "No";
  if (type === "BUTTON") return raw === "true" ? "Pressed" : "";
  return raw; // DATE (ISO yyyy-mm-dd) and TEXT are shown as entered
}

/** Builds a { fieldLabel: formattedValue } map for every field on the instance's
 * template version, so {{field:Some Label}} can pull in whatever the filler entered. */
async function buildFieldVars(instance: Instance): Promise<Record<string, string>> {
  const [fields, values] = await Promise.all([
    prisma.field.findMany({ where: { templateVersionId: instance.templateVersionId } }),
    prisma.fieldValue.findMany({ where: { instanceId: instance.id } }),
  ]);
  const valueByFieldId = new Map(values.map((v) => [v.fieldId, v.value]));
  const fieldVars: Record<string, string> = {};
  for (const f of fields) {
    fieldVars[f.label] = formatFieldValue(f.type, valueByFieldId.get(f.id) ?? null);
  }
  return fieldVars;
}

/** Executes a list of configured actions for a field event, logging each attempt. */
export async function executeActions(
  actions: ActionDef[],
  ctx: { instance: Instance; field: Field; userId: string | null }
): Promise<void> {
  const vars = {
    today: todayIso(),
    instanceTitle: ctx.instance.title,
    fieldLabel: ctx.field.label,
  };
  const fieldVars = await buildFieldVars(ctx.instance);

  for (const action of actions) {
    if (action.type === "send_email") {
      const attachments = action.attachments?.map((a) => ({
        filename: a.originalName,
        path: path.join(UPLOAD_DIR, a.filename),
      }));
      const result = await sendEmail({
        to: interpolate(action.to, vars, fieldVars),
        subject: interpolate(action.subject, vars, fieldVars),
        body: interpolate(action.body, vars, fieldVars),
        attachments,
      });
      await prisma.actionLog.create({
        data: {
          instanceId: ctx.instance.id,
          fieldId: ctx.field.id,
          actionType: "send_email",
          status: result.ok ? "SUCCESS" : "FAILED",
          detail: result.detail,
          performedById: ctx.userId,
        },
      });
    } else if (action.type === "set_date") {
      const value = action.value === "today" || !action.value ? todayIso() : action.value;
      await prisma.fieldValue.upsert({
        where: { instanceId_fieldId: { instanceId: ctx.instance.id, fieldId: action.targetFieldId } },
        create: {
          instanceId: ctx.instance.id,
          fieldId: action.targetFieldId,
          value,
          updatedById: ctx.userId,
        },
        update: { value, updatedById: ctx.userId },
      });
      await prisma.actionLog.create({
        data: {
          instanceId: ctx.instance.id,
          fieldId: ctx.field.id,
          actionType: "set_date",
          status: "SUCCESS",
          detail: `Set field ${action.targetFieldId} to ${value}`,
          performedById: ctx.userId,
        },
      });
    } else if (action.type === "mark_complete") {
      await prisma.instance.update({
        where: { id: ctx.instance.id },
        data: { status: "COMPLETED" },
      });
      await prisma.actionLog.create({
        data: {
          instanceId: ctx.instance.id,
          fieldId: ctx.field.id,
          actionType: "mark_complete",
          status: "SUCCESS",
          detail: "Instance marked complete",
          performedById: ctx.userId,
        },
      });
    }
  }
}
