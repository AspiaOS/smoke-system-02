// Money helpers — always work in integer cents; convert only at the edges.

export function reaisToCents(value: number | string): number {
  const s = typeof value === "number" ? value.toFixed(2) : String(value).trim().replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToNumeric(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const int = Math.trunc(abs / 100);
  const dec = abs % 100;
  return `${sign}${int}.${dec.toString().padStart(2, "0")}`;
}

export function numericToCents(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const s = typeof value === "number" ? String(value) : value;
  return reaisToCents(s);
}

export function formatBRL(value: string | number | null | undefined): string {
  const cents = numericToCents(value);
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function margin(price: string | number, cost: string | number): number {
  const p = numericToCents(price);
  const c = numericToCents(cost);
  if (p <= 0) return 0;
  return (p - c) / p;
}
