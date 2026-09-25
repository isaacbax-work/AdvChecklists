import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type InstanceSummary } from "../api";

export function InProgress() {
  const [instances, setInstances] = useState<InstanceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .listInstances()
      .then((res) => setInstances(res.instances))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load checklists"));
  };

  useEffect(load, []);

  const remove = async (instance: InstanceSummary) => {
    const confirmed = window.confirm(`Delete "${instance.title}"? This can't be undone.`);
    if (!confirmed) return;
    try {
      await api.deleteInstance(instance.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete checklist");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>In progress</h1>
      </div>
      {error && <div className="error">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Checklist</th>
            <th>Template</th>
            <th>Status</th>
            <th>Started by</th>
            <th>Started</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {instances?.map((i) => (
            <tr key={i.id}>
              <td>
                <Link to={`/instances/${i.id}`}>{i.title}</Link>
              </td>
              <td>
                <Link to={`/templates/${i.templateId}`} className="muted">
                  {i.templateTitle ?? i.templateId}
                </Link>
              </td>
              <td>
                <span className={`status status-${i.status.toLowerCase()}`}>{i.status}</span>
              </td>
              <td>{i.createdBy?.name}</td>
              <td>{new Date(i.createdAt).toLocaleString()}</td>
              <td>
                <button className="link-danger" onClick={() => remove(i)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {instances?.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No checklists started yet. Start one from a template.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
