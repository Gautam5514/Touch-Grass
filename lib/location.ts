/** Rounds to 2 decimal places (~1 km) so we never store a precise position. */
export const approximate = (n: number) => Math.round(n * 100) / 100;

export type LocationResult = { ok: true; lat: number; lon: number } | { ok: false; reason: "unsupported" | "denied" | "unavailable" | "timeout" };

/** Only call this from an explicit user action or an adventure the user enabled location for. */
export function getApproxLocation(timeoutMs = 5000): Promise<LocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return resolve({ ok: false, reason: "unsupported" });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ ok: true, lat: approximate(p.coords.latitude), lon: approximate(p.coords.longitude) }),
      (e) => resolve({ ok: false, reason: e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable" }),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60_000 },
    );
  });
}
