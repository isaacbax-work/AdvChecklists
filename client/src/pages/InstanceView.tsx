import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type FieldDef, type HistoryEntry, type InstanceDetail } from "../api";
import { DocumentCanvas } from "../components/DocumentCanvas";

export function InstanceView() {
  const { id } = useParams<{ id: string }>();
  const [instance, setInstance] = useState<InstanceDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingFieldId, setPendingFieldId] = useState<string | null>(null);

  const load = () => {
    if (!id) return;
    api.getInstance(id).then(setInstance).catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
    api.getInstanceHistory(id).then((res) => setHistory(res.history)).catch(() => {});
  };

  useEffect(load, [id]);

  if (!instance) return <div>{error ?? "Loading…"}</div>;

  const setValue = async (fieldId: string, value: string | boolean | null) => {
    if (!id) return;
    setPendingFieldId(fieldId);
    setError(null);
    try {
      await api.setFieldValue(id, fieldId, value);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setPendingFieldId(null);
    }
  };

  const renderField = (field: FieldDef) => {
    const current = instance.values[field.id]?.value ?? null;
    const busy = pendingFieldId === field.id;

    if (field.type === "CHECKBOX") {
      return (
        <label className="fill-checkbox">
          <input
            type="checkbox"
            disabled={busy}
            checked={current === "true"}
            onChange={(e) => setValue(field.id, e.target.checked)}
          />
          {field.label}
        </label>
      );
    }
    if (field.type === "BUTTON") {
      return (
        <button type="button" disabled={busy} onClick={() => setValue(field.id, true)}>
          {field.label}
        </button>
      );
    }
    if (field.type === "DATE") {
      return (
        <label className="fill-date">
          <span>{field.label}</span>
          <input
            type="date"
            disabled={busy}
            value={current ?? ""}
            onChange={(e) => setValue(field.id, e.target.value)}
          />
        </label>
      );
    }
    return (
      <label className="fill-text">
        <span>{field.label}</span>
        <input
          type="text"
          disabled={busy}
          defaultValue={current ?? ""}
          onBlur={(e) => setValue(field.id, e.target.value)}
        />
      </label>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to={`/templates/${instance.templateId}`} className="muted small">
            ← Template
          </Link>
          <h1>{instance.title}</h1>
          <p className="muted small">
            <span className={`status status-${instance.status.toLowerCase()}`}>{instance.status}</span> · started by{" "}
            {instance.createdBy?.name}
          </p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="builder-layout">
        <div className="builder-canvas-col">
          {instance.document && (
            <DocumentCanvas
              documentUrl={instance.document.url}
              mimeType={instance.document.mimeType}
              fields={instance.fields}
              renderField={renderField}
            />
          )}
        </div>
        <div className="builder-sidebar">
          <section className="card">
            <h3>Action history</h3>
            <ul className="history-list">
              {history.map((h) => (
                <li key={h.id} className={`history-item history-${h.status.toLowerCase()}`}>
                  <div>
                    <strong>{h.actionType}</strong>
                    {h.field && <span className="muted"> · {h.field.label}</span>}
                  </div>
                  {h.detail && <div className="muted small">{h.detail}</div>}
                  <div className="muted small">
                    {h.performedBy?.name} · {new Date(h.performedAt).toLocaleString()}
                  </div>
                </li>
              ))}
              {history.length === 0 && <li className="muted">No actions have fired yet.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
