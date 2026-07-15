import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/money";

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
        .from("store_settings")
        .select("store_display_name, banners")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function Storefront() {
  const { data: settings } = useStoreSettings();
  const { data: rows, isLoading, error } = useCatalog();

  // Group by product, keep lowest price
  const products = new Map<
    string,
    { id: string; name: string; brand: string | null; image: string | null; minPrice: string; category: string }
  >();
  (rows ?? []).forEach((r) => {
    const existing = products.get(r.product_id);
    if (!existing || Number(r.price) < Number(existing.minPrice)) {
      products.set(r.product_id, {
        id: r.product_id,
        name: r.product_name,
        brand: r.brand,
        image: r.images?.[0] ?? null,
        minPrice: r.price,
        category: r.category_name,
      });
    }
  });
  const list = Array.from(products.values());

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">{settings?.store_display_name ?? "Smoke"}</h1>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">Não deu para carregar. Puxe para atualizar.</p>
        )}

        {!isLoading && list.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-muted-foreground">Nenhum produto disponível agora.</p>
          </div>
        )}

        {list.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {list.map((p) => (
              <Link
                key={p.id}
                to="/"
                className="group overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      sem foto
                    </div>
                  )}
                </div>
                <div className="p-3">
                  {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                  <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                  <p className="mt-1 text-sm font-semibold">a partir de {formatBRL(p.minPrice)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
