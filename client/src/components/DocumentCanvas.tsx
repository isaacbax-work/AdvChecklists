import { type ReactNode } from "react";
import type { FieldDef } from "../api";

interface Props {
  documentUrl: string;
  mimeType: string;
  fields: FieldDef[];
  renderField: (field: FieldDef) => ReactNode;
  onCanvasClick?: (xPercent: number, yPercent: number) => void;
  selectedFieldId?: string | null;
  onSelectField?: (fieldId: string) => void;
}

/**
 * Renders the uploaded document as a background "page" and overlays fields at
 * their stored percentage-based positions. PDFs are shown at a fixed page
 * aspect ratio (letter portrait) since we don't render individual PDF pages;
 * field coordinates are relative to that box in both the builder and the
 * fill view, so placement stays consistent between the two.
 */
export function DocumentCanvas({
  documentUrl,
  mimeType,
  fields,
  renderField,
  onCanvasClick,
  selectedFieldId,
  onSelectField,
}: Props) {
  const isImage = mimeType.startsWith("image/");

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCanvasClick) return;
    if ((e.target as HTMLElement).closest(".doc-field")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    onCanvasClick(xPercent, yPercent);
  };

  return (
    <div className="doc-page" onClick={handleClick}>
      {isImage ? (
        <img src={documentUrl} alt="Document" className="doc-background" draggable={false} />
      ) : (
        <iframe src={documentUrl} title="Document" className="doc-background doc-pdf" />
      )}
      {fields
        .filter((f) => f.page === 1)
        .map((field) => (
          <div
            key={field.id}
            className={`doc-field doc-field-${field.type.toLowerCase()} ${
              selectedFieldId === field.id ? "doc-field-selected" : ""
            }`}
            style={{
              left: `${field.x}%`,
              top: `${field.y}%`,
              width: `${field.width}%`,
              height: `${field.height}%`,
            }}
            onClick={(e) => {
              if (onSelectField) {
                e.stopPropagation();
                onSelectField(field.id);
              }
            }}
          >
            {renderField(field)}
          </div>
        ))}
    </div>
  );
}
