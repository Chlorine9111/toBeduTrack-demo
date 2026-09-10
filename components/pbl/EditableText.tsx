"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

type EditableTextProps = {
  value: string;
  onSave: (newValue: string) => void;
  as?: "p" | "span" | "h3" | "li";
  className?: string;
  multiline?: boolean;
};

export function EditableText({
  value,
  onSave,
  as: Tag = "span",
  className,
  multiline = false,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length);
  }, [editing]);

  const commitSave = useCallback(
    (newValue: string) => {
      setEditing(false);
      const trimmed = newValue.trim();
      if (trimmed !== value) {
        onSave(trimmed);
      }
    },
    [value, onSave],
  );

  const handleCancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
        return;
      }

      if (multiline) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          commitSave(draft);
        }
      } else {
        if (e.key === "Enter") {
          e.preventDefault();
          commitSave(draft);
        }
      }
    },
    [multiline, draft, commitSave, handleCancel],
  );

  if (editing) {
    const sharedClass = cn(
      "w-full rounded border border-blue-300 bg-white px-2 py-1 text-sm",
      "outline-hidden focus:ring-1 focus:ring-blue-300",
      className,
    );

    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitSave(draft)}
          onKeyDown={handleKeyDown}
          className={cn(sharedClass, "min-h-16 resize-y")}
          rows={3}
        />
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitSave(draft)}
        onKeyDown={handleKeyDown}
        className={sharedClass}
      />
    );
  }

  return (
    <Tag
      onDoubleClick={() => setEditing(true)}
      className={cn(
        "cursor-pointer rounded border border-transparent px-1",
        "hover:border-gray-300 hover:border-dashed",
        "transition-colors duration-150",
        className,
      )}
      title="双击编辑"
    >
      {value || "\u00A0"}
    </Tag>
  );
}
