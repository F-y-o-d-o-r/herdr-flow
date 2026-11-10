// Date formatting and quick date calculation helpers for Jira side panel editing.

/** @param {Date} date */
export function formatIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Quick date choices for inline date picker.
 * @param {Date} [baseDate]
 * @returns {{ label: string, value: string }[]}
 */
export function quickDateOptions(baseDate = new Date()) {
  const today = new Date(baseDate);
  const add = (/** @type {number} */ n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return formatIsoDate(d);
  };
  const toNextMon = (8 - today.getDay()) % 7 || 7;
  return [
    { label: "Today", value: formatIsoDate(today) },
    { label: "Tomorrow", value: add(1) },
    { label: "+2d", value: add(2) },
    { label: "Next Mon", value: add(toNextMon) },
  ];
}

/**
 * Parses user text as ISO date (YYYY-MM-DD or DD.MM or DD.MM.YYYY).
 * @param {string | null | undefined} raw
 * @param {Date} [baseDate]
 * @returns {string | null}
 */
export function parseDateInput(raw, baseDate = new Date()) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [, m, d] = s.split("-").map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? s : null;
  }
  const match = s.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}))?$/);
  if (match) {
    const d = Number(match[1]);
    const m = Number(match[2]);
    const y = match[3] ? Number(match[3]) : baseDate.getFullYear();
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}
