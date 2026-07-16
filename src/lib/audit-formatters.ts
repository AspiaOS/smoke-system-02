export const ACTION_LABELS: Record<string, string> = {
  "order.accept": "Pedido aceito",
  "order.cancel": "Pedido cancelado",
  "order.expire": "Pedido expirado",
  "stock.entry": "Entrada de estoque",
  "stock.adjust": "Ajuste de estoque",
  "stock.adjustment": "Ajuste de estoque",
  "price.update": "Preço atualizado",
  "settings.update": "Configurações atualizadas",
  "product.create": "Produto criado",
  "product.update": "Produto atualizado",
  "category.create": "Categoria criada",
  "category.update": "Categoria atualizada",
  "shipping.create": "Bairro adicionado",
  "shipping.update": "Frete atualizado",
  "expense.create": "Despesa registrada",
  "expense.update": "Despesa atualizada",
  "expense.delete": "Despesa excluída",
};

export function translateAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll(".", " ");
}

export const STOCK_TYPE_LABELS: Record<string, string> = {
  entry: "Entrada de estoque",
  adjustment: "Ajuste de estoque",
  sale_accept: "Saída por venda",
};

function brl(n: unknown) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function summarizePayload(action: string, payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const p = payload as Record<string, unknown>;
  switch (action) {
    case "price.update":
      if ("before" in p && "after" in p) return `Preço alterado de ${brl(p.before)} para ${brl(p.after)}.`;
      break;
    case "stock.adjust":
    case "stock.adjustment":
      if ("before" in p && "after" in p) return `Estoque corrigido de ${p.before} para ${p.after}${p.note ? `. Motivo: ${p.note}` : ""}.`;
      break;
    case "settings.update":
      return "Configurações da loja foram atualizadas.";
    case "order.cancel":
      return p.reason ? `Pedido cancelado. Motivo: ${p.reason}.` : "Pedido cancelado.";
    case "order.accept":
      return p.sale_id ? "Pedido aceito. Venda registrada e estoque baixado." : "Pedido aceito.";
    case "order.expire":
      return "Pedido expirado automaticamente.";
  }
  return "";
}
