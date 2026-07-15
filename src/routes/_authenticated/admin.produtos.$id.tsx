import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL, margin } from "@/lib/money";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/produtos/$id")({
  component: ProductDetail,
});

type Variation = {
  id: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  active: boolean;
};

type ProductPatch = {
  name?: string;
  brand?: string | null;
  description?: string | null;
  category_id?: string;
  active?: boolean;
  visible?: boolean;
  featured?: boolean;
  images?: string[];
};

type VariationPatch = {
  name?: string;
  price?: number;
  cost?: number;
  min_stock?: number;
  active?: boolean;
};

function ProductDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, variations(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as {
        id: string;
        name: string;
        brand: string | null;
        description: string | null;
        images: string[];
        category_id: string;
        active: boolean;
        visible: boolean;
        featured: boolean;
        variations: Variation[];
      };
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const patchProduct = useMutation({
    mutationFn: async (patch: ProductPatch) => {
      const { error } = await supabase.from("products").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product", id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const patchVariation = useMutation({
    mutationFn: async (v: VariationPatch & { id: string; oldPrice?: number; oldCost?: number }) => {
      const { id: vid, oldPrice, oldCost, ...patch } = v;
      const { error } = await supabase.from("variations").update(patch).eq("id", vid);
      if (error) throw error;
      if ((patch.price !== undefined && patch.price !== oldPrice) ||
          (patch.cost !== undefined && patch.cost !== oldCost)) {
        const { data: p } = await supabase.from("products").select("store_id").eq("id", id).single();
        if (p) {
          await supabase.from("audit_logs").insert({
            store_id: p.store_id,
            action: "price.update",
            entity: "variation",
            entity_id: vid,
            payload: { before: { price: oldPrice, cost: oldCost }, after: { price: patch.price, cost: patch.cost } },
          });
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product", id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const addVariation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("variations")
        .insert({ product_id: id, name: "Nova variação", price: 0, cost: 0, stock: 0 });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product", id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("product-media").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("product-media").getPublicUrl(path);
      const newImages = [...(product?.images ?? []), data.publicUrl];
      const { error: uErr } = await supabase.from("products").update({ images: newImages }).eq("id", id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      toast.success("Imagem enviada");
      qc.invalidateQueries({ queryKey: ["product", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const removeImage = useMutation({
    mutationFn: async (url: string) => {
      const newImages = (product?.images ?? []).filter((u) => u !== url);
      const { error } = await supabase.from("products").update({ images: newImages }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product", id] }),
  });

  const deleteProduct = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto removido");
      navigate({ to: "/admin/produtos" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (isLoading || !product) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link to="/admin/produtos" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm("Remover produto? Isso apaga variações. Movimentações históricas impedem se houver.")) {
              deleteProduct.mutate();
            }
          }}
        >
          Remover
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Produto</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input
              defaultValue={product.name}
              onBlur={(e) => e.target.value !== product.name && patchProduct.mutate({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Marca</Label>
            <Input
              defaultValue={product.brand ?? ""}
              onBlur={(e) => patchProduct.mutate({ brand: e.target.value || null })}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Descrição</Label>
            <Textarea
              defaultValue={product.description ?? ""}
              onBlur={(e) => patchProduct.mutate({ description: e.target.value || null })}
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <Select
              value={product.category_id}
              onValueChange={(v) => patchProduct.mutate({ category_id: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3 md:col-span-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={product.visible}
                onCheckedChange={(v) => patchProduct.mutate({ visible: v })}
              />
              <span className="text-sm">Visível</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={product.active}
                onCheckedChange={(v) => patchProduct.mutate({ active: v })}
              />
              <span className="text-sm">Ativo</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={product.featured}
                onCheckedChange={(v) => patchProduct.mutate({ featured: v })}
              />
              <span className="text-sm">Destaque</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fotos</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            {product.images.map((url) => (
              <div key={url} className="group relative">
                <img src={url} alt="" className="h-24 w-24 rounded object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage.mutate(url)}
                  className="absolute -right-1 -top-1 rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadImage.mutate(f);
              e.target.value = "";
            }}
          />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploadImage.isPending}>
            {uploadImage.isPending ? "Enviando…" : "Adicionar foto"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Variações</CardTitle>
          <Button size="sm" onClick={() => addVariation.mutate()}>Adicionar variação</Button>
        </CardHeader>
        <CardContent>
          {product.variations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma variação. Adicione uma para poder vender.
            </p>
          )}
          <div className="space-y-3">
            {product.variations.map((v) => (
              <VariationRow key={v.id} variation={v} onPatch={(patch) =>
                patchVariation.mutate({ id: v.id, oldPrice: v.price, oldCost: v.cost, ...patch })
              } />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function VariationRow({
  variation,
  onPatch,
}: {
  variation: Variation;
  onPatch: (patch: Partial<Variation>) => void;
}) {
  const m = margin(variation.price, variation.cost);
  return (
    <div className="grid grid-cols-2 gap-2 rounded border p-3 md:grid-cols-6">
      <div className="col-span-2 space-y-1">
        <Label className="text-xs">Nome</Label>
        <Input
          defaultValue={variation.name}
          onBlur={(e) => e.target.value !== variation.name && onPatch({ name: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Preço</Label>
        <Input
          type="number"
          step="0.01"
          defaultValue={variation.price}
          onBlur={(e) => e.target.value !== variation.price && onPatch({ price: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Custo</Label>
        <Input
          type="number"
          step="0.01"
          defaultValue={variation.cost}
          onBlur={(e) => e.target.value !== variation.cost && onPatch({ cost: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Estoque mín.</Label>
        <Input
          type="number"
          defaultValue={variation.min_stock}
          onBlur={(e) => {
            const n = Number(e.target.value) || 0;
            if (n !== variation.min_stock) onPatch({ min_stock: n });
          }}
        />
      </div>
      <div className="flex flex-col justify-end gap-1">
        <span className="text-xs text-muted-foreground">
          Estoque atual: <b>{variation.stock}</b>
        </span>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {formatBRL(variation.price)} · margem {(m * 100).toFixed(0)}%
          </span>
          <Switch
            checked={variation.active}
            onCheckedChange={(v) => onPatch({ active: v })}
          />
        </div>
      </div>
    </div>
  );
}
