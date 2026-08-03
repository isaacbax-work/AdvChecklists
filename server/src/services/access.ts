import { prisma } from "../db.js";

export type EffectiveRole = "OWNER" | "EDITOR" | "FILLER" | null;

const RANK: Record<Exclude<EffectiveRole, null>, number> = {
  OWNER: 3,
  EDITOR: 2,
  FILLER: 1,
};

/** Returns the caller's effective role on a template, or null if they have no access. */
export async function getRole(templateId: string, userId: string): Promise<EffectiveRole> {
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) return null;
  if (template.ownerId === userId) return "OWNER";
  const collab = await prisma.templateCollaborator.findUnique({
    where: { templateId_userId: { templateId, userId } },
  });
  return (collab?.role as EffectiveRole) ?? null;
}

export function roleAtLeast(role: EffectiveRole, required: Exclude<EffectiveRole, null>): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[required];
}
