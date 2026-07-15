import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Minus, Plus, ShoppingBag, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/money";
import { useCart } from "@/hooks/use-cart";
import { toast } from "sonner";

export const Route = createFileRoute("/p/$id")({
  component: ProductPage,
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("public_catalog")
      .select("product_name,brand,description,images,price")
      .eq("product_id", params.id)
      .order("price", { ascending: true })
      .limit(1)
      .maybeSingle();
    return { meta: data };
  },
  head: ({ loaderData, params }) => {
    const m = loaderData?.meta;
    if (!m) {
      return {
        meta: [
          { title: "Produto — Smoke" },
          { name: "robots", content: "noindex" },
        ],
        links: [{ rel: "canonical", href: `/p/${params.id}` }],
      };
    }
    const title = `${m.product_name}${m.brand ? " · " + m.brand : ""} — Smoke`;
    const desc = (m.description ?? `Peça ${m.product_name} pelo WhatsApp na Smoke.`).slice(0, 160);
    const img = m.images?.[0];
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:url", content: `/p/${params.id}` },
        ...(img ? [
          { property: "og:image", content: img },
          { name: "twitter:image", content: img },
        ] : []),
        { name: "twitter:card", content: img ? "summary_large_image" : "summary" },
      ],
      links: [{ rel: "canonical", href: `/p/${params.id}` }],
    };
  },
});

type Row = {
  product_id: string;
  product_name: string;
  brand: string | null;
  description: string | null;
  images: string[] | null;
  category_name: string;
  variation_id: string;
  variation_name: string;
  price: string;
  in_stock: boolean;
};

function ProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { add, count } = useCart();
  const [selected, setSelected] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_catalog")
        .select("*")
        .eq("product_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const product = rows?.[0];
  const variations = useMemo(
    () => (rows ?? []).map((r) => ({ id: r.variation_id, name: r.variation_name, price: r.price })),
    [rows],
  );
  const activeVar = variations.find((v) => v.id === selected) ?? variations[0];
  const image = product?.images?.[0] ?? null;

  function handleAdd() {
    if (!product || !activeVar) return;
    add({
      variationId: activeVar.id,
      productId: product.product_id,
      productName: product.product_name,
      variationName: activeVar.name,
      image,
      unitPrice: activeVar.price,
      quantity: qty,
    });
    toast.success("Adicionado ao carrinho");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-5 py-10">
          <div className="aspect-square animate-pulse rounded-3xl bg-surface" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
        <h1 className="font-display text-2xl font-bold">Produto indisponível</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esse produto saiu do ar ou está esgotado.
        </p>
        <Link to="/" className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
          Voltar à vitrine
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <button
          onClick={() => navigate({ to: "/checkout" })}
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface"
          aria-label="Carrinho"
        >
          <ShoppingBag className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {count}
            </span>
          )}
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-32">
        <div className="relative overflow-hidden rounded-[28px] border border-border bg-surface">
          <div className="relative aspect-square bg-surface-raised">
            {image ? (
              <img src={image} alt={product.product_name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ShoppingBag className="h-16 w-16 text-muted-foreground/40" strokeWidth={1.2} />
              </div>
            )}
            <span className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full bg-surface-contrast px-3 py-1.5 text-xs font-semibold">
              <Star className="h-3 w-3 fill-primary text-primary" />
              5.0
            </span>
          </div>
        </div>

        <div className="mt-6">
          {product.brand && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {product.brand}
            </p>
          )}
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight md:text-4xl">
            {product.product_name}
          </h1>
          <p className="mt-3 font-display text-4xl font-bold text-primary">
            {formatBRL(activeVar?.price ?? "0")}
          </p>
          {product.description && (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          )}
        </div>

        {variations.length > 1 && (
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Escolha uma opção
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {variations.map((v) => {
                const isActive = (selected ?? variations[0]?.id) === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelected(v.id)}
                    className={
                      "rounded-full border px-4 py-2 text-sm font-semibold transition " +
                      (isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface text-foreground hover:border-primary/50")
                    }
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Quantidade
          </p>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-raised"
              aria-label="Diminuir"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center font-display text-lg font-bold">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-raised"
              aria-label="Aumentar"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Total</p>
            <p className="font-display text-2xl font-bold">
              {formatBRL(Number(activeVar?.price ?? 0) * qty)}
            </p>
          </div>
          <button
            onClick={handleAdd}
            className="flex-1 rounded-full bg-primary px-6 py-4 text-sm font-bold uppercase tracking-[0.1em] text-primary-foreground transition hover:brightness-110"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
