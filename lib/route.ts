/**
 * Adventure ids exist only at runtime (IndexedDB), so a static export can't enumerate them.
 * One static shell serves /adventure/<id>/ and /adventure/<id>/complete/, and this parses the real URL.
 */
export function parseAdventurePath(pathname: string): { id: number | null; view: "session" | "complete" } {
  const parts = pathname.split("/").filter(Boolean);
  const id = Number(parts[1]);
  return { id: Number.isInteger(id) && id > 0 ? id : null, view: parts[2] === "complete" ? "complete" : "session" };
}
