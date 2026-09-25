import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  ApiError,
  type ActionDef,
  type ButtonConfig,
  type CheckboxConfig,
  type Collaborator,
  type DateConfig,
  type FieldDef,
  type FieldType,
  type InstanceSummary,
  type TemplateDetail,
} from "../api";
import { DocumentCanvas } from "../components/DocumentCanvas";
import { ActionListEditor } from "../components/ActionListEditor";
import { uuid } from "../uuid";

/**
 * Every published version gets brand-new Field rows (so old versions stay
 * intact as history), so when we load existing fields into the editor we
 * mint fresh client-side ids for all of them up front and rewrite any
 * `set_date` action references to match. Those same ids are then sent to
 * the server and become the new rows' real ids.
 */
function remapFieldsForEditing(fields: FieldDef[]): FieldDef[] {
  const idMap = new Map(fields.map((f) => [f.id, uuid()]));
  const remapActions = (actions: ActionDef[] | undefined): ActionDef[] | undefined =>
    actions?.map((a) =>
      a.type === "set_date" ? { ...a, targetFieldId: idMap.get(a.targetFieldId) ?? a.targetFieldId } : a
    );

  return fields.map((f) => {
    const newField = { ...f, id: idMap.get(f.id)! };
    if (f.type === "CHECKBOX") {
      const c = f.config as CheckboxConfig;
      newField.config = { checkedActions: remapActions(c.checkedActions), uncheckedActions: remapActions(c.uncheckedActions) };
    } else if (f.type === "BUTTON") {
      const c = f.config as ButtonConfig;
      newField.config = { actions: remapActions(c.actions) };
    }
    return newField;
  });
}

const DEFAULT_SIZE = { width: 18, height: 6 };

export function TemplateBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = () => {
    if (!id) return;
    api
      .getTemplate(id)
      .then((t) => {
        setTemplate(t);
        setFields(remapFieldsForEditing(t.currentVersion.fields));
        setReloadKey((k) => k + 1);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load template"));
    api.listTemplateInstances(id).then((res) => setInstances(res.instances)).catch(() => {});
  };

  useEffect(load, [id]);

  if (!template) return <div>{error ?? "Loading…"}</div>;

  const canEdit = template.myRole === "OWNER" || template.myRole === "EDITOR";
  const isOwner = template.myRole === "OWNER";
  const selectedField = fields.find((f) => f.id === selectedId) ?? null;
  const dateFieldOptions = fields.filter((f) => f.type === "DATE").map((f) => ({ id: f.id, label: f.label }));
  const fieldOptions = fields.map((f) => ({ id: f.id, label: f.label }));

  const addField = (xPercent: number, yPercent: number) => {
    if (!canEdit) return;
    const newField: FieldDef = {
      id: uuid(),
      type: "CHECKBOX",
      label: "New field",
      page: 1,
      x: Math.max(0, Math.min(100 - DEFAULT_SIZE.width, xPercent)),
      y: Math.max(0, Math.min(100 - DEFAULT_SIZE.height, yPercent)),
      width: DEFAULT_SIZE.width,
      height: DEFAULT_SIZE.height,
      order: fields.length,
      config: {},
    };
    setFields((prev) => [...prev, newField]);
    setSelectedId(newField.id);
  };

  const updateSelected = (patch: Partial<FieldDef>) => {
    if (!selectedId) return;
    setFields((prev) => prev.map((f) => (f.id === selectedId ? { ...f, ...patch } : f)));
  };

  const changeType = (type: FieldType) => {
    if (!selectedId) return;
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== selectedId) return f;
        const config: FieldDef["config"] =
          type === "CHECKBOX" ? {} : type === "BUTTON" ? { actions: [] } : type === "DATE" ? { autoFillToday: false } : {};
        return { ...f, type, config };
      })
    );
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setFields((prev) => prev.filter((f) => f.id !== selectedId));
    setSelectedId(null);
  };

  const publish = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("fields", JSON.stringify({ fields }));
      if (replaceFile) form.set("document", replaceFile);
      await api.updateFields(id, form);
      setReplaceFile(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to publish new version");
    } finally {
      setSaving(false);
    }
  };

  const startInstance = async () => {
    if (!id) return;
    const title = window.prompt("Name this checklist run", `${template.title} - ${new Date().toLocaleDateString()}`);
    if (!title) return;
    try {
      const instance = await api.createInstance(id, title);
      navigate(`/instances/${instance.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start instance");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/" className="muted small">
            ← All templates
          </Link>
          <h1>{template.title}</h1>
          {template.description && <p className="muted">{template.description}</p>}
          <p className="muted small">Your role: {template.myRole}</p>
        </div>
        <div className="header-actions">
          <button onClick={startInstance}>Start new checklist</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="builder-layout">
        <div className="builder-canvas-col">
          {canEdit && <p className="muted small">Click anywhere on the document to place a new field.</p>}
          <DocumentCanvas
            documentUrl={template.currentVersion.documentUrl}
            mimeType={template.currentVersion.documentMimeType}
            fields={fields}
            selectedFieldId={selectedId}
            onSelectField={canEdit ? setSelectedId : undefined}
            onCanvasClick={canEdit ? addField : undefined}
            renderField={(f) => <span className="doc-field-label">{f.label}</span>}
          />
          {canEdit && (
            <div className="card publish-card">
              <label>
                Replace document (optional)
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button onClick={publish} disabled={saving}>
                {saving ? "Publishing…" : "Publish new version"}
              </button>
              <p className="hint">Publishing saves the current field layout as a new version and keeps prior versions in history.</p>
            </div>
          )}
        </div>

        {canEdit && (
          <div className="builder-sidebar">
            {selectedField ? (
              <FieldEditor
                key={selectedField.id}
                field={selectedField}
                dateFieldOptions={dateFieldOptions.filter((d) => d.id !== selectedField.id)}
                fieldOptions={fieldOptions}
                onChangeType={changeType}
                onPatch={updateSelected}
                onDelete={removeSelected}
              />
            ) : (
              <div className="card">
                <p className="muted">Select a field on the document to edit it, or click the document to add one.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <VersionsHistory key={`versions-${reloadKey}`} templateId={template.id} />
      {isOwner && (
        <CollaboratorsPanel
          key={`collaborators-${reloadKey}`}
          templateId={template.id}
          initial={template.collaborators}
        />
      )}
      <InstancesHistory instances={instances} />
    </div>
  );
}

function FieldEditor({
  field,
  dateFieldOptions,
  fieldOptions,
  onChangeType,
  onPatch,
  onDelete,
}: {
  field: FieldDef;
  dateFieldOptions: { id: string; label: string }[];
  fieldOptions: { id: string; label: string }[];
  onChangeType: (type: FieldType) => void;
  onPatch: (patch: Partial<FieldDef>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="card field-editor">
      <h3>Field settings</h3>
      <label>
        Label
        <input value={field.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </label>
      <label>
        Type
        <select value={field.type} onChange={(e) => onChangeType(e.target.value as FieldType)}>
          <option value="CHECKBOX">Checkbox</option>
          <option value="BUTTON">Button</option>
          <option value="DATE">Date</option>
          <option value="TEXT">Text</option>
        </select>
      </label>
      <div className="grid-2">
        <label>
          X %
          <input type="number" value={field.x} onChange={(e) => onPatch({ x: Number(e.target.value) })} />
        </label>
        <label>
          Y %
          <input type="number" value={field.y} onChange={(e) => onPatch({ y: Number(e.target.value) })} />
        </label>
        <label>
          Width %
          <input type="number" value={field.width} onChange={(e) => onPatch({ width: Number(e.target.value) })} />
        </label>
        <label>
          Height %
          <input type="number" value={field.height} onChange={(e) => onPatch({ height: Number(e.target.value) })} />
        </label>
      </div>

      {field.type === "CHECKBOX" && (
        <div>
          <h4>When checked</h4>
          <ActionListEditor
            actions={(field.config as CheckboxConfig).checkedActions ?? []}
            dateFieldOptions={dateFieldOptions}
            fieldOptions={fieldOptions}
            onChange={(actions) =>
              onPatch({ config: { ...(field.config as CheckboxConfig), checkedActions: actions } })
            }
          />
          <h4>When unchecked</h4>
          <ActionListEditor
            actions={(field.config as CheckboxConfig).uncheckedActions ?? []}
            dateFieldOptions={dateFieldOptions}
            fieldOptions={fieldOptions}
            onChange={(actions) =>
              onPatch({ config: { ...(field.config as CheckboxConfig), uncheckedActions: actions } })
            }
          />
        </div>
      )}

      {field.type === "BUTTON" && (
        <div>
          <h4>When pressed</h4>
          <ActionListEditor
            actions={(field.config as ButtonConfig).actions ?? []}
            dateFieldOptions={dateFieldOptions}
            fieldOptions={fieldOptions}
            onChange={(actions) => onPatch({ config: { actions } })}
          />
        </div>
      )}

      {field.type === "DATE" && (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={(field.config as DateConfig).autoFillToday ?? false}
            onChange={(e) => onPatch({ config: { autoFillToday: e.target.checked } })}
          />
          Auto-fill with today's date on new checklists
        </label>
      )}

      <button className="link-danger" onClick={onDelete}>
        Delete field
      </button>
    </div>
  );
}

function VersionsHistory({ templateId }: { templateId: string }) {
  const [versions, setVersions] = useState<TemplateDetail["versions"] | null>(null);
  useEffect(() => {
    api.listVersions(templateId).then((res) => setVersions(res.versions));
  }, [templateId]);
  if (!versions) return null;
  return (
    <section className="card">
      <h3>Version history</h3>
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>Document</th>
            <th>Fields</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id}>
              <td>v{v.versionNumber}</td>
              <td>
                <a href={v.documentUrl} target="_blank" rel="noreferrer">
                  {v.documentOriginalName}
                </a>
              </td>
              <td>{v.fields.length}</td>
              <td>{new Date(v.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CollaboratorsPanel({ templateId, initial }: { templateId: string; initial: Collaborator[] }) {
  const [collaborators, setCollaborators] = useState(initial);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"EDITOR" | "FILLER">("FILLER");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.listCollaborators(templateId).then((res) => setCollaborators(res.collaborators));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.addCollaborator(templateId, email, role);
      setEmail("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add collaborator");
    }
  };

  const remove = async (userId: string) => {
    await api.removeCollaborator(templateId, userId);
    refresh();
  };

  return (
    <section className="card">
      <h3>Collaborators</h3>
      {error && <div className="error">{error}</div>}
      <ul className="collaborator-list">
        {collaborators.map((c) => (
          <li key={c.userId}>
            {c.name} ({c.email}) — {c.role}
            <button className="link-danger" onClick={() => remove(c.userId)}>
              Remove
            </button>
          </li>
        ))}
        {collaborators.length === 0 && <li className="muted">No collaborators yet.</li>}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <input
          type="email"
          placeholder="Collaborator's email (must already have an account)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value as "EDITOR" | "FILLER")}>
          <option value="FILLER">Filler (can complete checklists)</option>
          <option value="EDITOR">Editor (can also edit the template)</option>
        </select>
        <button type="submit">Add</button>
      </form>
    </section>
  );
}

function InstancesHistory({ instances }: { instances: InstanceSummary[] }) {
  return (
    <section className="card">
      <h3>Checklist history</h3>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Created by</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {instances.map((i) => (
            <tr key={i.id}>
              <td>
                <Link to={`/instances/${i.id}`}>{i.title}</Link>
              </td>
              <td>
                <span className={`status status-${i.status.toLowerCase()}`}>{i.status}</span>
              </td>
              <td>{i.createdBy?.name}</td>
              <td>{new Date(i.createdAt).toLocaleString()}</td>
            </tr>
          ))}
          {instances.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No checklists have been started from this template yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
