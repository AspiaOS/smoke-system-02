import { formatBRL } from "@/lib/money";
import { Field } from "./Field";
import { PAYMENTS, type PaymentMethod } from "./payment-methods";

export type Neighborhood = { id: string; name: string; delivery_fee: string };

export function CustomerForm({
  name,
  phone,
  address,
  neighborhoodId,
  payment,
  neighborhoods,
  onName,
  onPhone,
  onAddress,
  onNeighborhood,
  onPayment,
}: {
  name: string;
  phone: string;
  address: string;
  neighborhoodId: string;
  payment: PaymentMethod;
  neighborhoods: Neighborhood[];
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  onAddress: (v: string) => void;
  onNeighborhood: (v: string) => void;
  onPayment: (v: PaymentMethod) => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Seus dados
      </h2>
      <Field label="Nome" value={name} onChange={onName} placeholder="Como te chamamos?" />
      <Field
        label="WhatsApp"
        value={phone}
        onChange={onPhone}
        placeholder="(11) 99999-9999"
        inputMode="tel"
      />
      <Field
        label="Endereço"
        value={address}
        onChange={onAddress}
        placeholder="Rua, número, complemento"
      />

      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Bairro
        </label>
        <select
          value={neighborhoodId}
          onChange={(e) => onNeighborhood(e.target.value)}
          className="mt-2 w-full rounded-full border border-border bg-surface px-5 py-3.5 text-sm outline-none focus:border-primary"
        >
          <option value="">Selecione o bairro…</option>
          {neighborhoods.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} — {formatBRL(n.delivery_fee)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Pagamento
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {PAYMENTS.map((p) => {
            const active = payment === p.value;
            return (
              <button
                key={p.value}
                onClick={() => onPayment(p.value)}
                className={
                  "rounded-full border px-4 py-2 text-sm font-semibold transition " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-foreground hover:border-primary/50")
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}