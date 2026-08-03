import type { ActionDef } from "../api";

interface Props {
  actions: ActionDef[];
  onChange: (actions: ActionDef[]) => void;
  dateFieldOptions: { id: string; label: string }[];
}

function defaultForType(type: ActionDef["type"]): ActionDef {
  if (type === "send_email") return { type, to: "", subject: "", body: "" };
  if (type === "set_date") return { type, targetFieldId: "", value: "today" };
  return { type: "mark_complete" };
}

export function ActionListEditor({ actions, onChange, dateFieldOptions }: Props) {
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
            <div className="action-fields">
              <span className="action-badge">Send email</span>
              <input
                placeholder="To (email address)"
                value={action.to}
                onChange={(e) => update(i, { ...action, to: e.target.value })}
              />
              <input
                placeholder="Subject (supports {{today}}, {{instanceTitle}}, {{fieldLabel}})"
                value={action.subject}
                onChange={(e) => update(i, { ...action, subject: e.target.value })}
              />
              <textarea
                placeholder="Body"
                value={action.body}
                onChange={(e) => update(i, { ...action, body: e.target.value })}
              />
            </div>
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
        <button type="button" onClick={() => add("mark_complete")}>
          + Mark complete
        </button>
      </div>
    </div>
  );
}
