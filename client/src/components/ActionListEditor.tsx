import { useState } from "react";
import { api, ApiError, type ActionDef, type EmailAttachment } from "../api";

interface Props {
  actions: ActionDef[];
  onChange: (actions: ActionDef[]) => void;
  dateFieldOptions: { id: string; label: string }[];
  textFieldOptions: { id: string; label: string }[];
  fieldOptions: { id: string; label: string }[];
}

function defaultForType(type: ActionDef["type"]): ActionDef {
  if (type === "send_email") return { type, to: "", subject: "", body: "" };
  if (type === "set_date") return { type, targetFieldId: "", value: "today" };
  if (type === "set_text") return { type, targetFieldId: "", value: "" };
  return { type: "mark_complete" };
}

export function ActionListEditor({ actions, onChange, dateFieldOptions, textFieldOptions, fieldOptions }: Props) {
  const update = (index: number, next: ActionDef) => {
    const copy = actions.slice();
    copy[index] = next;
    onChange(copy);
  };
  const remove = (index: number) => onChange(actions.filter((_, i) => i !== index));
  const add = (type: ActionDef["type"]) => onChange([...actions, defaultForType(type)]);

  return (
    <div className="action-list">
      {actions.map((action, i) => (
        <div className="action-row" key={i}>
          {action.type === "send_email" && (
            <SendEmailFields
              action={action}
              fieldOptions={fieldOptions}
              onChange={(next) => update(i, next)}
            />
          )}
          {action.type === "set_date" && (
            <div className="action-fields">
              <span className="action-badge">Set date field</span>
              <select
                value={action.targetFieldId}
                onChange={(e) => update(i, { ...action, targetFieldId: e.target.value })}
              >
                <option value="">Choose a date field…</option>
                {dateFieldOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <span className="hint">to today's date</span>
            </div>
          )}
          {action.type === "set_text" && (
            <div className="action-fields">
              <span className="action-badge">Set text field</span>
              <select
                value={action.targetFieldId}
                onChange={(e) => update(i, { ...action, targetFieldId: e.target.value })}
              >
                <option value="">Choose a text or dropdown field…</option>
                {textFieldOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                placeholder="Value (supports {{today}}, {{instanceTitle}}, {{fieldLabel}}, {{field:Label}})"
                value={action.value}
                onChange={(e) => update(i, { ...action, value: e.target.value })}
              />
            </div>
          )}
          {action.type === "mark_complete" && (
            <div className="action-fields">
              <span className="action-badge">Mark the checklist as complete</span>
            </div>
          )}
          <button type="button" className="link-danger" onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
      <div className="action-add">
        <button type="button" onClick={() => add("send_email")}>
          + Send email
        </button>
        <button type="button" onClick={() => add("set_date")}>
          + Set date field
        </button>
        <button type="button" onClick={() => add("set_text")}>
          + Set text field
        </button>
        <button type="button" onClick={() => add("mark_complete")}>
          + Mark complete
        </button>
      </div>
    </div>
  );
}

function SendEmailFields({
  action,
  fieldOptions,
  onChange,
}: {
  action: Extract<ActionDef, { type: "send_email" }>;
  fieldOptions: { id: string; label: string }[];
  onChange: (next: Extract<ActionDef, { type: "send_email" }>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const insertIntoBody = (placeholder: string) => {
    onChange({ ...action, body: `${action.body}${action.body && !action.body.endsWith(" ") ? " " : ""}${placeholder}` });
  };

  const addAttachment = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await api.uploadAttachment(file);
      onChange({ ...action, attachments: [...(action.attachments ?? []), uploaded] });
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Failed to upload attachment");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (attachment: EmailAttachment) => {
    onChange({ ...action, attachments: (action.attachments ?? []).filter((a) => a.filename !== attachment.filename) });
  };

  return (
    <div className="action-fields">
      <span className="action-badge">Send email</span>
      <input
        placeholder="To (email address, or {{field:Label}} to pull it from a text field)"
        value={action.to}
        onChange={(e) => onChange({ ...action, to: e.target.value })}
      />
      <input
        placeholder="Subject (supports {{today}}, {{instanceTitle}}, {{fieldLabel}}, {{field:Label}})"
        value={action.subject}
        onChange={(e) => onChange({ ...action, subject: e.target.value })}
      />
      <textarea
        placeholder="Body"
        value={action.body}
        onChange={(e) => onChange({ ...action, body: e.target.value })}
      />

      {fieldOptions.length > 0 && (
        <label className="hint">
          Insert a filled-in field's value into the body
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) insertIntoBody(`{{field:${e.target.value}}}`);
              e.target.value = "";
            }}
          >
            <option value="">Choose a field…</option>
            {fieldOptions.map((f) => (
              <option key={f.id} value={f.label}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="attachment-list">
        {(action.attachments ?? []).map((a) => (
          <div className="attachment-row" key={a.filename}>
            <span>{a.originalName}</span>
            <button type="button" className="link-danger" onClick={() => removeAttachment(a)}>
              Remove
            </button>
          </div>
        ))}
        <label className="attachment-add">
          {uploading ? "Uploading…" : "+ Attach a file"}
          <input
            type="file"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addAttachment(file);
              e.target.value = "";
            }}
          />
        </label>
        {uploadError && <div className="error">{uploadError}</div>}
      </div>
    </div>
  );
}
