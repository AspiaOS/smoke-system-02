import { Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatBRL } from "@/lib/money";
import type { CartItem } from "@/hooks/use-cart";

export function CartList({
  items,
  setQty,
  remove,
}: {
  items: CartItem[];
  setQty: (variationId: string, quantity: number) => void;
  remove: (variationId: string) => void;
}) {
  return (
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
  );
}