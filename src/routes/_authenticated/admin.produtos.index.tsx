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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/produtos/")({
  component: ProductsPage,
});

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  visible: boolean;
  active: boolean;
  category_id: string;
  variations: { stock: number; active: boolean }[];
};

function ProductsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setName("");
    setBrand("");
    setCategoryId(undefined);
    setActive(true);
    setDescription("");
    setImages([]);
    setCreating(false);
  };

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setImages((prev) => [...prev, ...arr]);
  };

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

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brand, visible, active, category_id, variations(stock, active)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ProductRow[];
    },
  });

  const create = useMutation({
    mutationFn: async ({ edit }: { edit: boolean }) => {
      if (!categoryId) throw new Error("Selecione uma categoria");
      const { data: stores } = await supabase.from("stores").select("id").limit(1).single();
      if (!stores) throw new Error("Loja não encontrada");

      const uploadedUrls: string[] = [];
      const { data: prod, error } = await supabase
        .from("products")
        .insert({
          name,
          brand: brand || null,
          description: description || null,
          category_id: categoryId,
          store_id: stores.id,
          active,
          visible: active,
        })
        .select("id")
        .single();
      if (error) throw error;

      for (const file of images) {
        const { assertValidImage, safeExtension } = await import("@/lib/upload");
        assertValidImage(file);
        const path = `${prod.id}/${crypto.randomUUID()}.${safeExtension(file)}`;
        const { error: upErr } = await supabase.storage
          .from("product-media")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("product-media").getPublicUrl(path);
        uploadedUrls.push(pub.publicUrl);
      }
      if (uploadedUrls.length) {
        await supabase.from("products").update({ images: uploadedUrls }).eq("id", prod.id);
      }
      return { id: prod.id, edit };
    },
    onSuccess: ({ id, edit }) => {
      toast.success("Produto criado");
      resetForm();
      qc.invalidateQueries({ queryKey: ["products"] });
      if (edit) navigate({ to: "/admin/produtos/$id", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const filtered = products.filter((p) =>
    (p.name + " " + (p.brand ?? "")).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Estoque total = soma das variações. Produto sem variação com estoque não vai à vitrine.
          </p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>Novo produto</Button>}
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Novo produto</CardTitle>
            <p className="text-sm text-muted-foreground">
              Preencha as informações básicas. Preços, estoque e variações poderão ser configurados na próxima etapa.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                create.mutate({ edit: false });
              }}
            >
              <section className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Informações básicas</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Nome *</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Marca</Label>
                    <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Categoria *</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger><SelectValue placeholder="Escolha uma categoria" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <div className="flex h-10 items-center gap-3 rounded-md border px-3">
                      <Switch checked={active} onCheckedChange={setActive} />
                      <span className="text-sm">{active ? "Ativo" : "Oculto"}</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Descreva o produto…"
                />
              </section>

              <section className="space-y-2">
                <Label>Imagens</Label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors ${
                    dragOver ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
                  }`}
                >
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Arraste imagens aqui ou clique para selecionar</p>
                  <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
                    Selecionar imagens
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {images.map((f, i) => (
                      <div key={i} className="group relative">
                        <img src={URL.createObjectURL(f)} alt="" className="h-20 w-20 rounded object-cover" />
                        <button
                          type="button"
                          onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button type="button" variant="ghost" onClick={resetForm}>Cancelar</Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={create.isPending}
                  onClick={() => { if (name.trim()) create.mutate({ edit: true }); }}
                >
                  Salvar e editar
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Input
        placeholder="Buscar por nome ou marca…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum produto. Comece criando o primeiro.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {filtered.map((p) => {
          const totalStock = p.variations.reduce(
            (s, v) => s + (v.active ? v.stock : 0),
            0,
          );
          return (
            <li key={p.id}>
              <Link
                to="/admin/produtos/$id"
                params={{ id: p.id }}
                className="block"
              >
                <Card className="transition-colors hover:bg-accent">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                        <p className="font-medium">{p.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Estoque: {totalStock} · {p.variations.length} variações
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {p.visible ? (
                          <Badge variant="default">Visível</Badge>
                        ) : (
                          <Badge variant="secondary">Oculto</Badge>
                        )}
                        {!p.active && <Badge variant="outline">Inativo</Badge>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
