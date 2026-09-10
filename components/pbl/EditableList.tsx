"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

type EditableListProps = {
  items: string[];
  onSave: (newItems: string[]) => void;
  className?: string;
  bulletStyle?: "disc" | "decimal" | "none";
};

type EditableItemProps = {
  value: string;
  onSave: (newValue: string) => void;
};

function EditableItem({ value, onSave }: EditableItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

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
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commitSave(draft);
      }
    },
    [draft, commitSave, handleCancel],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitSave(draft)}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full rounded border border-blue-300 bg-white px-2 py-1 text-sm",
          "outline-hidden focus:ring-1 focus:ring-blue-300",
        )}
      />
    );
  }

  return (
    <span
      onDoubleClick={() => setEditing(true)}
      className={cn(
        "cursor-pointer rounded border border-transparent px-1",
        "hover:border-gray-300 hover:border-dashed",
        "transition-colors duration-150",
      )}
      title="双击编辑"
    >
      {value || "\u00A0"}
    </span>
  );
}

const LIST_STYLE_MAP = {
  disc: "list-disc",
  decimal: "list-decimal",
  none: "list-none",
} as const;

export function EditableList({
  items,
  onSave,
  className,
  bulletStyle = "disc",
}: EditableListProps) {
  const handleItemSave = useCallback(
    (index: number, newValue: string) => {
      const updated = items.map((item, i) => (i === index ? newValue : item));
      onSave(updated);
    },
    [items, onSave],
  );

  return (
    <ul className={cn(LIST_STYLE_MAP[bulletStyle], "ml-5 space-y-1", className)}>
      {items.map((item, index) => (
        <li key={index}>
          <EditableItem
            value={item}
            onSave={(newValue) => handleItemSave(index, newValue)}
          />
        </li>
      ))}
    </ul>
  );
}
