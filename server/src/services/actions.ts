import { prisma } from "../db.js";
import { sendEmail } from "./email.js";
import type { Field, Instance } from "@prisma/client";

export type ActionDef =
  | { type: "send_email"; to: string; subject: string; body: string }
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

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
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

  for (const action of actions) {
    if (action.type === "send_email") {
      const result = await sendEmail({
        to: action.to,
        subject: interpolate(action.subject, vars),
        body: interpolate(action.body, vars),
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
