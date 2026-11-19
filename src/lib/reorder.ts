// R21: drag-and-drop ordering. Pure helpers so the maths is testable.

/** Move `fromId` to where `toId` is (before it when moving up, after it when moving down). */
export function reorder<T extends { id: string }>(list: T[], fromId: string, toId: string): T[] {
  const from = list.findIndex((x) => x.id === fromId);
  const to = list.findIndex((x) => x.id === toId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** New sort orders (10, 20, 30…) for the items whose position changed. */
export function sortOrderChanges<T extends { id: string; sort_order: number }>(next: T[]): Array<{ id: string; sort_order: number }> {
  return next.map((x, i) => ({ id: x.id, sort_order: (i + 1) * 10, was: x.sort_order }))
    .filter((x) => x.sort_order !== x.was)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}
