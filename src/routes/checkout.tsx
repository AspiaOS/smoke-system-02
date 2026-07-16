import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createPublicOrder } from "@/lib/checkout.functions";
import { normalizePhoneBR } from "@/lib/phone";
import { useCart } from "@/hooks/use-cart";
import { toast } from "sonner";
import { CartList } from "@/components/checkout/CartList";
import {
  CustomerForm,
  type Neighborhood,
} from "@/components/checkout/CustomerForm";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { buildWhatsAppMessage } from "@/components/checkout/build-whatsapp-message";
import type { PaymentMethod } from "@/components/checkout/payment-methods";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
});

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
        name: row.customer_name,
        phone: row.customer_phone,
        address: row.address,
        neighborhood: row.neighborhood_name,
        payment: (row.payment_method as PaymentMethod) || payment,
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
        {/* Honeypot: invisível para humanos, atrai bots */}
        <input
          ref={honeypotRef}
          type="text"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] top-[-9999px] h-0 w-0 opacity-0"
        />
        <CartList items={items} setQty={setQty} remove={remove} />

        <CustomerForm
          name={name}
          phone={phone}
          address={address}
          neighborhoodId={neighborhoodId}
          payment={payment}
          neighborhoods={neighborhoods}
          onName={setName}
          onPhone={setPhone}
          onAddress={setAddress}
          onNeighborhood={setNeighborhoodId}
          onPayment={setPayment}
        />

        <OrderSummary
          subtotalCents={subtotalCents}
          deliveryCents={deliveryCents}
          totalCents={totalCents}
          neighborhoodName={neighborhood?.name}
        />
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
