"use client";

import { useCallback, useState } from "react";

export function useAgentWorkspaceFiles() {
  const [pendingMaterials, setPendingMaterials] = useState<File[]>([]);

  const addMaterials = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    setPendingMaterials((prev) => {
      const merged = [...prev];
      for (const file of incoming) {
        if (
          merged.some(
            (item) =>
              item.name === file.name &&
              item.size === file.size &&
              item.lastModified === file.lastModified,
          )
        ) {
          continue;
        }
        if (merged.length >= 2) break;
        merged.push(file);
      }
      return merged;
    });
  }, []);

  const removeMaterialAt = useCallback((index: number) => {
    setPendingMaterials((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index),
    );
  }, []);

  return {
    pendingMaterials,
    setPendingMaterials,
    addMaterials,
    removeMaterialAt,
  };
}
