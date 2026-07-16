import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Minus, Plus, Trash2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createPublicOrder } from "@/lib/checkout.functions";
import { formatBRL } from "@/lib/money";
import { normalizePhoneBR } from "@/lib/phone";
import { useCart } from "@/hooks/use-cart";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
});

type Neighborhood = { id: string; name: string; delivery_fee: string };
type PaymentMethod = "pix" | "cash" | "debit" | "credit";

const PAYMENTS: { value: PaymentMethod; label: string }[] = [
  { value: "pix", label: "Pix" },
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
];

function Checkout() {
  const navigate = useNavigate();
  const { items, setQty, remove, clear, subtotalCents } = useCart();
  const submitOrder = useServerFn(createPublicOrder);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("pix");

  const { data: neighborhoods = [] } = useQuery({
    queryKey: ["neighborhoods_public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("neighborhoods")
        .select("id, name, delivery_fee")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Neighborhood[];
    },
  });

  const neighborhood = neighborhoods.find((n) => n.id === neighborhoodId);
  const deliveryCents = neighborhood ? Math.round(Number(neighborhood.delivery_fee) * 100) : 0;
  const totalCents = subtotalCents + deliveryCents;

  const submit = useMutation({
    mutationFn: async () => {
      const normalized = normalizePhoneBR(phone);
      if (!normalized) throw new Error("Telefone inválido");
      if (!name.trim()) throw new Error("Informe seu nome");
      if (!address.trim()) throw new Error("Informe o endereço");
      if (!neighborhoodId) throw new Error("Escolha o bairro");
      if (items.length === 0) throw new Error("Carrinho vazio");

      const row = await submitOrder({
        data: {
          customer_name: name.trim(),
          customer_phone: normalized,
          address: address.trim(),
          neighborhood_id: neighborhoodId,
          payment_method: payment,
          items: items.map((i) => ({ variation_id: i.variationId, quantity: i.quantity })),
          hp: honeypotRef.current?.value ?? "",
        },
      });
      return row;
    },
    onSuccess: (row) => {
      const msg = buildWhatsAppMessage({
        name,
        phone,
        address,
        neighborhood: neighborhood?.name ?? "",
        payment,
        items,
        subtotal: row.subtotal,
        deliveryFee: row.delivery_fee,
        total: row.total,
      });
      const to = (row.whatsapp_number ?? "").replace(/\D/g, "");
      const url = to
        ? `https://wa.me/${to}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      clear();
      window.open(url, "_blank", "noopener,noreferrer");
      navigate({ to: "/" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro no pedido"),
  });

  const canSubmit = useMemo(
    () => items.length > 0 && name && phone && address && neighborhoodId && !submit.isPending,
    [items.length, name, phone, address, neighborhoodId, submit.isPending],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-5">
        <Link to="/" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">Fechar pedido</h1>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-5 pb-32">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Seu carrinho
          </h2>
          <div className="mt-3 space-y-2">
            {items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Carrinho vazio.{" "}
                <Link to="/" className="text-primary underline">
                  Voltar à vitrine
                </Link>
              </div>
            )}
            {items.map((i) => (
              <div
                key={i.variationId}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-raised">
                  {i.image && <img src={i.image} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold">{i.productName}</p>
                  <p className="text-xs text-muted-foreground">{i.variationName}</p>
                  <p className="mt-1 font-display text-base font-bold">{formatBRL(i.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
                  <button
                    onClick={() => setQty(i.variationId, i.quantity - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface"
                    aria-label="Diminuir"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{i.quantity}</span>
                  <button
                    onClick={() => setQty(i.variationId, i.quantity + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface"
                    aria-label="Aumentar"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  onClick={() => remove(i.variationId)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-raised hover:text-destructive"
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Seus dados
          </h2>
          <Field label="Nome" value={name} onChange={setName} placeholder="Como te chamamos?" />
          <Field
            label="WhatsApp"
            value={phone}
            onChange={setPhone}
            placeholder="(11) 99999-9999"
            inputMode="tel"
          />
          <Field label="Endereço" value={address} onChange={setAddress} placeholder="Rua, número, complemento" />

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Bairro
            </label>
            <select
              value={neighborhoodId}
              onChange={(e) => setNeighborhoodId(e.target.value)}
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
                    onClick={() => setPayment(p.value)}
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

        <section className="rounded-2xl border border-border bg-surface p-5">
          <Row label="Subtotal" value={formatBRL(subtotalCents / 100)} />
          <Row
            label={neighborhood ? `Entrega · ${neighborhood.name}` : "Entrega"}
            value={neighborhood ? formatBRL(deliveryCents / 100) : "—"}
          />
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold uppercase tracking-[0.15em]">Total</span>
            <span className="font-display text-2xl font-bold text-primary">
              {formatBRL(totalCents / 100)}
            </span>
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <button
            disabled={!canSubmit}
            onClick={() => submit.mutate()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-bold uppercase tracking-[0.1em] text-primary-foreground transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" />
            {submit.isPending ? "Enviando…" : "Enviar pelo WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "text" | "tel" | "email";
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </label>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-full border border-border bg-surface px-5 py-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function buildWhatsAppMessage(o: {
  name: string;
  phone: string;
  address: string;
  neighborhood: string;
  payment: PaymentMethod;
  items: { productName: string; variationName: string; quantity: number; unitPrice: string }[];
  subtotal: string;
  deliveryFee: string;
  total: string;
}): string {
  const paymentLabel = PAYMENTS.find((p) => p.value === o.payment)?.label ?? o.payment;
  const lines = [
    "*Novo pedido — Smoke*",
    "",
    `*Cliente:* ${o.name}`,
    `*WhatsApp:* ${o.phone}`,
    `*Endereço:* ${o.address}`,
    `*Bairro:* ${o.neighborhood}`,
    `*Pagamento:* ${paymentLabel}`,
    "",
    "*Itens*",
    ...o.items.map(
      (i) => `• ${i.quantity}x ${i.productName} — ${i.variationName} (${formatBRL(i.unitPrice)})`,
    ),
    "",
    `Subtotal: ${formatBRL(o.subtotal)}`,
    `Entrega: ${formatBRL(o.deliveryFee)}`,
    `*Total: ${formatBRL(o.total)}*`,
  ];
  return lines.join("\n");
}
