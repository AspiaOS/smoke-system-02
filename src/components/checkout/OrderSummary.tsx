import { formatBRL } from "@/lib/money";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function OrderSummary({
  subtotalCents,
  deliveryCents,
  totalCents,
  neighborhoodName,
}: {
  subtotalCents: number;
  deliveryCents: number;
  totalCents: number;
  neighborhoodName?: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <Row label="Subtotal" value={formatBRL(subtotalCents / 100)} />
      <Row
        label={neighborhoodName ? `Entrega · ${neighborhoodName}` : "Entrega"}
        value={neighborhoodName ? formatBRL(deliveryCents / 100) : "—"}
      />
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold uppercase tracking-[0.15em]">Total</span>
        <span className="font-display text-2xl font-bold text-primary">
          {formatBRL(totalCents / 100)}
        </span>
      </div>
    </section>
  );
}