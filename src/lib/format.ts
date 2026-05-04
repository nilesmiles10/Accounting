export function formatEUR(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function formatQty(milli: number): string {
  const n = milli / 1000;
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export function formatDate(iso: string, lang: "nl" | "en" = "nl"): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function parseEuroInput(s: string): number {
  // "1.234,56" → 123456 cents; also accept "1234.56" or "1234,56".
  const cleaned = s.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(cleaned.replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function parseQtyInput(s: string): number {
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000);
}
