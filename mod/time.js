// Relative times. Pure.

/**
 * "5m", "3h", "2d" since an ISO time, or "" for a missing / bad one.
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!(s >= 0)) return "";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
