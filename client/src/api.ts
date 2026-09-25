export type FieldType = "CHECKBOX" | "BUTTON" | "DATE" | "TEXT" | "SELECT" | "NUMBER";
export type Role = "OWNER" | "EDITOR" | "FILLER";
export type InstanceStatus = "IN_PROGRESS" | "COMPLETED";

export interface EmailAttachment {
  filename: string;
  originalName: string;
  mimeType: string;
  size?: number;
}

export type ActionDef =
  | { type: "send_email"; to: string; subject: string; body: string; attachments?: EmailAttachment[] }
  | { type: "set_date"; targetFieldId: string; value?: string }
  | { type: "set_text"; targetFieldId: string; value: string }
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
export interface SelectConfig {
  options?: string[];
}
export interface TextConfig {
  useAsTitle?: boolean;
}

export interface FieldDef {
  id: string;
  type: FieldType;
  label: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  order: number;
  config: CheckboxConfig | ButtonConfig | DateConfig | SelectConfig | TextConfig | Record<string, unknown>;
}

export interface TemplateVersion {
  id: string;
  versionNumber: number;
  documentUrl: string;
  documentOriginalName: string;
  documentMimeType: string;
  createdAt: string;
  createdById: string;
  createdBy?: { id: string; name: string; email: string };
  fields: FieldDef[];
}

export interface TemplateSummary {
  id: string;
  title: string;
  description: string | null;
  owner: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
  instanceCount: number;
  latestVersion: TemplateVersion | null;
}

export interface Collaborator {
  userId: string;
  name: string;
  email: string;
  role: Role;
  invitedAt: string;
}

export interface TemplateDetail {
  id: string;
  title: string;
  description: string | null;
  owner: { id: string; name: string; email: string };
  myRole: Role;
  createdAt: string;
  updatedAt: string;
  versions: TemplateVersion[];
  currentVersion: TemplateVersion;
  collaborators: Collaborator[];
}

export interface InstanceSummary {
  id: string;
  title: string;
  status: InstanceStatus;
  templateId: string;
  templateTitle?: string;
  templateVersionId: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string; email: string };
  versionNumber?: number;
}

export interface InstanceDetail extends InstanceSummary {
  document: { url: string; mimeType: string; versionNumber: number } | null;
  fields: FieldDef[];
  values: Record<string, { value: string | null; updatedAt: string; updatedBy: unknown }>;
}

export interface HistoryEntry {
  id: string;
  actionType: string;
  status: "SUCCESS" | "FAILED";
  detail: string | null;
  field: { id: string; label: string } | null;
  performedBy: { id: string; name: string; email: string } | null;
  performedAt: string;
}

const TOKEN_KEY = "advchecklists_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(options.body instanceof FormData) && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const api = {
  register: (email: string, password: string, name: string) =>
    request<{ token: string; user: { id: string; email: string; name: string } }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; name: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: { id: string; email: string; name: string } }>("/api/auth/me"),

  listTemplates: () => request<{ templates: TemplateSummary[] }>("/api/templates"),
  getTemplate: (id: string) => request<TemplateDetail>(`/api/templates/${id}`),
  createTemplate: (form: FormData) =>
    request<{ id: string }>("/api/templates", { method: "POST", body: form }),
  updateFields: (id: string, form: FormData) =>
    request<{ currentVersion: TemplateVersion }>(`/api/templates/${id}/fields`, {
      method: "PUT",
      body: form,
    }),
  listVersions: (id: string) => request<{ versions: TemplateVersion[] }>(`/api/templates/${id}/versions`),
  listCollaborators: (id: string) =>
    request<{ collaborators: Collaborator[] }>(`/api/templates/${id}/collaborators`),
  addCollaborator: (id: string, email: string, role: "EDITOR" | "FILLER") =>
    request<Collaborator>(`/api/templates/${id}/collaborators`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  removeCollaborator: (id: string, userId: string) =>
    request<void>(`/api/templates/${id}/collaborators/${userId}`, { method: "DELETE" }),
  listTemplateInstances: (id: string) =>
    request<{ instances: InstanceSummary[] }>(`/api/templates/${id}/instances`),
  deleteTemplate: (id: string) => request<void>(`/api/templates/${id}`, { method: "DELETE" }),

  createInstance: (templateId: string, title: string, templateVersionId?: string) =>
    request<InstanceSummary>("/api/instances", {
      method: "POST",
      body: JSON.stringify({ templateId, title, templateVersionId }),
    }),
  listInstances: (templateId?: string) =>
    request<{ instances: InstanceSummary[] }>(
      templateId ? `/api/instances?templateId=${templateId}` : "/api/instances"
    ),
  getInstance: (id: string) => request<InstanceDetail>(`/api/instances/${id}`),
  setFieldValue: (instanceId: string, fieldId: string, value: string | boolean | null) =>
    request<{ fieldId: string; value: string | null; instanceStatus: InstanceStatus; actionsTriggered: string[] }>(
      `/api/instances/${instanceId}/fields/${fieldId}`,
      { method: "PATCH", body: JSON.stringify({ value }) }
    ),
  getInstanceHistory: (id: string) => request<{ history: HistoryEntry[] }>(`/api/instances/${id}/history`),
  deleteInstance: (id: string) => request<void>(`/api/instances/${id}`, { method: "DELETE" }),

  uploadAttachment: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<EmailAttachment>("/api/uploads/attachments", { method: "POST", body: form });
  },
};

export { ApiError };
