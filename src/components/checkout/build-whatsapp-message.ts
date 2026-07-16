import { formatBRL } from "@/lib/money";
import { PAYMENTS, type PaymentMethod } from "./payment-methods";

export function buildWhatsAppMessage(o: {
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