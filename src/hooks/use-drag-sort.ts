import { useState } from "react";

/**
 * R21: drag-and-drop for a short list, using the browser's own drag and drop.
 * Up/Down buttons stay alongside for keyboards and touch screens.
 */
export function useDragSort(onDrop: (fromId: string, toId: string) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const itemProps = (id: string, enabled = true) => enabled ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragId(id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overId !== id) setOverId(id);
    },
    onDragLeave: () => { if (overId === id) setOverId(null); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const from = dragId ?? e.dataTransfer.getData("text/plain");
      setDragId(null); setOverId(null);
      if (from && from !== id) onDrop(from, id);
    },
    onDragEnd: () => { setDragId(null); setOverId(null); },
  } : {};
  return { dragId, overId, itemProps };
}
