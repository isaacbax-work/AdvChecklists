import { useRef, type ReactNode } from "react";
import type { FieldDef } from "../api";

interface Props {
  documentUrl: string;
  mimeType: string;
  fields: FieldDef[];
  renderField: (field: FieldDef) => ReactNode;
  onCanvasClick?: (xPercent: number, yPercent: number) => void;
  selectedFieldId?: string | null;
  onSelectField?: (fieldId: string) => void;
  /** Present only in the builder — enables dragging to move/resize a field. */
  onFieldChange?: (fieldId: string, patch: Partial<Pick<FieldDef, "x" | "y" | "width" | "height">>) => void;
}

const MIN_SIZE = 3; // percent, so a field can never be dragged down to nothing
const HANDLES = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
type Handle = (typeof HANDLES)[number];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface DragState {
  mode: "move" | "resize";
  handle?: Handle;
  fieldId: string;
  startClientX: number;
  startClientY: number;
  startField: { x: number; y: number; width: number; height: number };
  containerRect: DOMRect;
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
  onFieldChange,
}: Props) {
  const isImage = mimeType.startsWith("image/");
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCanvasClick) return;
    if ((e.target as HTMLElement).closest(".doc-field")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    onCanvasClick(xPercent, yPercent);
  };

  const onMouseMove = (e: MouseEvent) => {
    const state = dragRef.current;
    if (!state || !onFieldChange) return;
    const dxPercent = ((e.clientX - state.startClientX) / state.containerRect.width) * 100;
    const dyPercent = ((e.clientY - state.startClientY) / state.containerRect.height) * 100;
    const { x, y, width, height } = state.startField;

    if (state.mode === "move") {
      onFieldChange(state.fieldId, {
        x: clamp(x + dxPercent, 0, 100 - width),
        y: clamp(y + dyPercent, 0, 100 - height),
      });
      return;
    }

    let nx = x;
    let ny = y;
    let nw = width;
    let nh = height;
    if (state.handle?.includes("right")) nw = clamp(width + dxPercent, MIN_SIZE, 100 - x);
    if (state.handle?.includes("left")) {
      nw = clamp(width - dxPercent, MIN_SIZE, x + width);
      nx = x + width - nw;
    }
    if (state.handle?.includes("bottom")) nh = clamp(height + dyPercent, MIN_SIZE, 100 - y);
    if (state.handle?.includes("top")) {
      nh = clamp(height - dyPercent, MIN_SIZE, y + height);
      ny = y + height - nh;
    }
    onFieldChange(state.fieldId, { x: nx, y: ny, width: nw, height: nh });
  };

  const onMouseUp = () => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  const startDrag = (e: React.MouseEvent, field: FieldDef, mode: DragState["mode"], handle?: Handle) => {
    if (!onFieldChange) return;
    e.stopPropagation();
    e.preventDefault();
    onSelectField?.(field.id);
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    dragRef.current = {
      mode,
      handle,
      fieldId: field.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startField: { x: field.x, y: field.y, width: field.width, height: field.height },
      containerRect,
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className="doc-page" ref={containerRef} onClick={handleClick}>
      {isImage ? (
        <img src={documentUrl} alt="Document" className="doc-background" draggable={false} />
      ) : (
        <iframe src={documentUrl} title="Document" className="doc-background doc-pdf" />
      )}
      {fields
        .filter((f) => f.page === 1)
        .map((field) => {
          const isSelected = selectedFieldId === field.id;
          return (
            <div
              key={field.id}
              className={`doc-field doc-field-${field.type.toLowerCase()} ${isSelected ? "doc-field-selected" : ""} ${
                onFieldChange ? "doc-field-draggable" : ""
              }`}
              style={{
                left: `${field.x}%`,
                top: `${field.y}%`,
                width: `${field.width}%`,
                height: `${field.height}%`,
              }}
              onMouseDown={(e) => (onFieldChange ? startDrag(e, field, "move") : undefined)}
              onClick={(e) => {
                if (onSelectField && !onFieldChange) {
                  e.stopPropagation();
                  onSelectField(field.id);
                }
              }}
            >
              {renderField(field)}
              {isSelected &&
                onFieldChange &&
                HANDLES.map((handle) => (
                  <span
                    key={handle}
                    className={`doc-field-handle doc-field-handle-${handle}`}
                    onMouseDown={(e) => startDrag(e, field, "resize", handle)}
                  />
                ))}
            </div>
          );
        })}
    </div>
  );
}
