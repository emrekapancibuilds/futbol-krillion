// Days are shown by their date ("October 14"), not their number (user, 2026-10-14). Dates are UTC days, so the label
// never shifts with the player's time zone.

const parse = (date: string): Date | null => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export function dayLabel(date: string): string {
  const d = parse(date);
  return d ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : "";
}

export function dayLabelShort(date: string): string {
  const d = parse(date);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase() : "";
}
