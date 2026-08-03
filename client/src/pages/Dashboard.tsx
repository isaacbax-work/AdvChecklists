import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type TemplateSummary } from "../api";

export function Dashboard() {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    api
      .listTemplates()
      .then((res) => setTemplates(res.templates))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load templates"));
  };

  useEffect(load, []);

  return (
    <div>
      <div className="page-header">
        <h1>Checklist templates</h1>
        <button onClick={() => setShowCreate((v) => !v)}>{showCreate ? "Cancel" : "New template"}</button>
      </div>
      {error && <div className="error">{error}</div>}
      {showCreate && (
        <CreateTemplateForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      <div className="template-grid">
        {templates?.map((t) => (
          <Link to={`/templates/${t.id}`} key={t.id} className="card template-card">
            <h2>{t.title}</h2>
            {t.description && <p className="muted">{t.description}</p>}
            <p className="muted small">
              Owner: {t.owner.name} · v{t.latestVersion?.versionNumber ?? 1} · {t.instanceCount} instance
              {t.instanceCount === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
        {templates?.length === 0 && <p className="muted">No templates yet. Create one to get started.</p>}
      </div>
    </div>
  );
}

function CreateTemplateForm({ onCreated }: { onCreated: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a document (PDF, PNG, or JPEG) to upload.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("title", title);
      form.set("description", description);
      form.set("document", file);
      const created = await api.createTemplate(form);
      onCreated();
      navigate(`/templates/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create template");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={onSubmit}>
      {error && <div className="error">{error}</div>}
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Document (PDF, PNG or JPEG)
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Uploading…" : "Create template"}
      </button>
    </form>
  );
}
