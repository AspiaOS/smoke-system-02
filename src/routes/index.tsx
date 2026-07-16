import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShoppingBag, Plus, Star, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/money";
import { useCart } from "@/hooks/use-cart";

export const Route = createFileRoute("/")({
  component: Storefront,
});

type CatalogRow = {
  product_id: string;
  product_name: string;
  brand: string | null;
  images: string[];
  category_id: string;
  category_name: string;
  variation_id: string;
  variation_name: string;
  price: string;
  in_stock: boolean;
  featured: boolean;
};

const CHIPS = ["Tudo", "Novidades", "Mais vendidos", "Acessórios", "Promoções"] as const;
const BADGES = ["NOVO", "TOP", "LIMITADO", "NOVO"] as const;

function useCatalog() {
  return useQuery({
    queryKey: ["public_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_catalog")
        .select("*")
        .order("featured", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CatalogRow[];
    },
  });
}

function useStoreSettings() {
  return useQuery({
    queryKey: ["store_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_store_settings")
        .select("store_display_name")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function Storefront() {
  const { data: settings } = useStoreSettings();
  const { data: rows, isLoading } = useCatalog();
  const { count: cartCount } = useCart();
  const [chip, setChip] = useState<(typeof CHIPS)[number]>("Tudo");
  const [q, setQ] = useState("");

  const products = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; brand: string | null; image: string | null; minPrice: string }
    >();
    (rows ?? []).forEach((r) => {
      const existing = map.get(r.product_id);
      if (!existing || Number(r.price) < Number(existing.minPrice)) {
        map.set(r.product_id, {
          id: r.product_id,
          name: r.product_name,
          brand: r.brand,
          image: r.images?.[0] ?? null,
          minPrice: r.price,
        });
      }
    });
    return Array.from(map.values()).filter((p) =>
      q ? p.name.toLowerCase().includes(q.toLowerCase()) : true,
    );
  }, [rows, q]);

  // Placeholder tiles when catalog is empty — matches the reference "em breve" grid
  const placeholders = Array.from({ length: 8 }).map((_, i) => ({
    id: `ph-${i}`,
    badge: BADGES[i % BADGES.length],
    rating: (5.0 - (i % 3) * 0.1).toFixed(1),
  }));

  const storeName = settings?.store_display_name ?? "SMOKE";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HEADER */}
      <header className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-5 md:px-8">
        <Link to="/" className="flex flex-col leading-none">
          <span className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground md:block">
            Bem-vindo à
          </span>
          <span className="mt-1 flex items-baseline gap-0.5">
            <span className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              {storeName.toUpperCase()}
            </span>
            <span className="text-2xl font-bold text-primary md:text-3xl">.</span>
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-6 md:flex">
          {["Catálogo", "Novidades", "Ajuda"].map((n) => (
            <a
              key={n}
              href="#catalogo"
              className="text-sm font-semibold text-foreground/90 transition hover:text-foreground"
            >
              {n}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex flex-1 items-center justify-end gap-3">
          <div className="hidden max-w-md flex-1 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 md:flex">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Link
            to="/checkout"
            aria-label="Carrinho"
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface"
          >
            <ShoppingBag className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {cartCount}
            </span>
          </Link>
          <Link
            to="/auth"
            className="hidden rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground transition hover:text-foreground md:inline-flex"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-[28px] bg-primary px-7 py-10 text-primary-foreground md:px-12 md:py-16">
          <div
            aria-hidden
            className="absolute -right-24 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-black/10"
          />
          <div
            aria-hidden
            className="absolute right-8 bottom-8 h-[220px] w-[220px] rounded-full bg-black/10"
          />
          <p className="relative text-[11px] font-semibold uppercase tracking-[0.25em] opacity-70">
            Loja no ar em breve
          </p>
          <h1 className="relative mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            Peça pelo WhatsApp<br />com um toque
          </h1>
          <a
            href="#catalogo"
            className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-surface-contrast px-6 py-3.5 text-sm font-semibold text-foreground transition hover:bg-surface-raised"
          >
            <MessageCircle className="h-4 w-4 text-primary" />
            Falar agora
          </a>
        </section>

        {/* CHIPS */}
        <div className="mt-8 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CHIPS.map((c) => {
            const active = chip === c;
            return (
              <button
                key={c}
                onClick={() => setChip(c)}
                className={
                  "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition " +
                  (active
                    ? "bg-foreground text-background"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground")
                }
              >
                {c}
              </button>
            );
          })}
        </div>

        {/* GRID */}
        <div id="catalogo" className="mt-10 flex items-end justify-between">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Produtos</h2>
          <span className="text-sm text-muted-foreground">
            {products.length > 0 ? `${products.length} itens` : "Catálogo em preparação"}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-surface" />
            ))}

          {!isLoading && products.length === 0 &&
            placeholders.map((p) => (
              <ProductCard
                key={p.id}
                badge={p.badge}
                rating={p.rating}
                name="Produto em breve"
                price="—"
                image={null}
                muted
              />
            ))}

          {!isLoading &&
            products.map((p, i) => (
              <Link
                key={p.id}
                to="/p/$id"
                params={{ id: p.id }}
                className="block focus:outline-none"
              >
                <ProductCard
                  badge={BADGES[i % BADGES.length]}
                  rating={(4.8 + ((i * 7) % 3) / 10).toFixed(1)}
                  name={p.name}
                  price={formatBRL(p.minPrice)}
                  image={p.image}
                />
              </Link>
            ))}
        </div>
      </main>
    </div>
  );
}

function ProductCard({
  badge,
  rating,
  name,
  price,
  image,
  muted,
}: {
  badge: string;
  rating: string;
  name: string;
  price: string;
  image: string | null;
  muted?: boolean;
}) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[24px] border border-border bg-surface transition hover:border-primary/30">
      <div className="relative aspect-square overflow-hidden bg-surface-raised">
        <span className="absolute left-3 top-3 z-10 rounded-full bg-surface-contrast px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-foreground">
          {badge}
        </span>
        <span className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full bg-surface-contrast px-2.5 py-1 text-[11px] font-semibold text-foreground">
          <Star className="h-3 w-3 fill-primary text-primary" />
          {rating}
        </span>
        {image ? (
          <img
            src={image}
            alt={name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/40" strokeWidth={1.2} />
          </div>
        )}
      </div>
      <div className="flex items-end justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className={"line-clamp-1 text-sm font-semibold " + (muted ? "text-muted-foreground" : "text-foreground")}>
            {name}
          </p>
          <p className="mt-1 font-display text-xl font-bold tracking-tight">
            R$ <span className={muted ? "text-muted-foreground" : ""}>{price === "—" ? "—" : price.replace("R$", "").trim()}</span>
          </p>
        </div>
        <button
          aria-label="Adicionar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:brightness-110"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>
    </article>
  );
}
