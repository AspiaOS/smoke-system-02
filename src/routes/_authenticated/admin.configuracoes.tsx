import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { normalizePhoneBR, formatPhoneBR } from "@/lib/phone";
import { Upload, X, ChevronUp, ChevronDown, ExternalLink, Star, AlertTriangle } from "lucide-react";
import { useCapabilities } from "@/hooks/use-capabilities";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  component: SettingsPage,
});

type Banner = { url: string; alt?: string; link?: string };
type Settings = {
  store_id: string;
  store_display_name: string;
  whatsapp_number: string;
  banners: Banner[];
  updated_at?: string;
};

const MAX_BANNERS = 5;

function maskPhoneBR(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function SettingsPage() {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const canManage = can("settings.manage");

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ["store_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*").maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        store_id: data.store_id,
        store_display_name: data.store_display_name,
        whatsapp_number: data.whatsapp_number,
        banners: Array.isArray(data.banners) ? (data.banners as unknown as Banner[]) : [],
        updated_at: data.updated_at,
      } as Settings;
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [addingBanner, setAddingBanner] = useState(false);
  const [removeIdx, setRemoveIdx] = useState<number | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (settings && !form) {
      setForm(settings);
      setPhoneInput(formatPhoneBR(settings.whatsapp_number || ""));
    }
  }, [settings, form]);

  const normalizedPhone = useMemo(
    () => normalizePhoneBR(phoneInput) ?? "",
    [phoneInput],
  );

  const dirty = useMemo(() => {
    if (!form || !settings) return false;
    if (form.store_display_name.trim() !== settings.store_display_name) return true;
    if (normalizedPhone.replace(/\D/g, "") !== settings.whatsapp_number) return true;
    if (JSON.stringify(form.banners) !== JSON.stringify(settings.banners)) return true;
    return false;
  }, [form, settings, normalizedPhone]);

  const save = useMutation({
    mutationFn: async () => {
      if (!canManage) throw new Error("Sem permissão para alterar configurações");
      if (!form) throw new Error("Sem loja");
      if (!form.store_display_name.trim()) throw new Error("Nome obrigatório");
      if (!normalizedPhone) throw new Error("WhatsApp inválido (verifique DDD e dígitos)");
      const { error } = await supabase
        .from("store_settings")
        .update({
          store_display_name: form.store_display_name.trim(),
          whatsapp_number: normalizedPhone.replace(/\D/g, ""),
          banners: form.banners,
        })
        .eq("store_id", form.store_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações atualizadas. A vitrine já está refletindo as mudanças.");
      qc.invalidateQueries({ queryKey: ["store_settings"] });
      setForm(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  function discard() {
    if (!settings) return;
    setForm(settings);
    setPhoneInput(formatPhoneBR(settings.whatsapp_number || ""));
    setDiscardOpen(false);
  }

  function moveBanner(from: number, to: number) {
    if (!form) return;
    if (to < 0 || to >= form.banners.length) return;
    const next = [...form.banners];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setForm({ ...form, banners: next });
  }

  function addBanner(b: Banner) {
    if (!form) return;
    setForm({ ...form, banners: [...form.banners, b] });
  }

  function updateBannerLink(i: number, link: string) {
    if (!form) return;
    const next = [...form.banners];
    next[i] = { ...next[i], link: link || undefined };
    setForm({ ...form, banners: next });
  }

  function removeBanner(i: number) {
    if (!form) return;
    setForm({ ...form, banners: form.banners.filter((_, idx) => idx !== i) });
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Erro ao carregar configurações: {error instanceof Error ? error.message : "desconhecido"}
      </p>
    );
  }
  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma loja configurada. Crie uma loja para acessar as configurações.
      </p>
    );
  }
  if (!form) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const waLink = normalizedPhone
    ? `https://wa.me/${normalizedPhone.replace(/\D/g, "")}?text=${encodeURIComponent("Teste da vitrine ✔")}`
    : null;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Configurações da vitrine</h1>
          <p className="text-sm text-muted-foreground">
            Controle a identidade pública e os canais de contato da loja.
          </p>
          {settings?.updated_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Última atualização: {new Date(settings.updated_at).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
        <Button variant="outline" asChild>
          <Link to="/">Visualizar vitrine</Link>
        </Button>
      </div>

      <Tabs defaultValue="geral">
        <TabsList>
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="banners">Banners</TabsTrigger>
          <TabsTrigger value="destaques">Destaques</TabsTrigger>
        </TabsList>

        {/* ---------- GERAL ---------- */}
        <TabsContent value="geral">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardContent className="space-y-6 p-6">
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">Informações públicas</h3>
                    <p className="text-xs text-muted-foreground">
                      Estes dados aparecem na vitrine e no fechamento do pedido.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label>Nome exibido *</Label>
                    <Input
                      value={form.store_display_name}
                      onChange={(e) => setForm({ ...form, store_display_name: e.target.value })}
                      readOnly={!canManage}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Este é o nome mostrado aos clientes.
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">WhatsApp da loja</h3>
                    <p className="text-xs text-muted-foreground">
                      Destino dos pedidos finalizados.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label>Número do WhatsApp *</Label>
                    <div className="flex gap-2">
                      <div className="flex h-10 items-center rounded-md border px-3 text-sm text-muted-foreground">
                        +55
                      </div>
                      <Input
                        className="flex-1"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(maskPhoneBR(e.target.value))}
                        readOnly={!canManage}
                        placeholder="(11) 99999-9999"
                        inputMode="tel"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {normalizedPhone
                        ? <>Número salvo: <span className="font-mono">{normalizedPhone}</span></>
                        : phoneInput
                          ? <span className="text-destructive">Formato inválido. Confira o DDD e os dígitos.</span>
                          : "Preencha o número com DDD."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!waLink}
                    asChild={!!waLink}
                  >
                    {waLink ? (
                      <a href={waLink} target="_blank" rel="noreferrer">
                        Testar WhatsApp <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    ) : (
                      <span>Testar WhatsApp</span>
                    )}
                  </Button>
                </section>
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardContent className="space-y-3 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Prévia</p>
                <div className="rounded-md border bg-background p-4">
                  <p className="text-lg font-semibold">
                    {form.store_display_name || "Nome da loja"}.
                  </p>
                  <p className="text-xs text-muted-foreground">Escolhe, pede, chega.</p>
                  <div className="mt-3 flex h-24 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                    {form.banners[0]?.url ? (
                      <img
                        src={form.banners[0].url}
                        alt=""
                        className="h-full w-full rounded-md object-cover"
                      />
                    ) : (
                      "Banner principal"
                    )}
                  </div>
                  <p className="mt-3 text-xs font-medium">Produtos em destaque</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------- BANNERS ---------- */}
        <TabsContent value="banners" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Banners da vitrine</h3>
              <p className="text-xs text-muted-foreground">
                Organize as imagens exibidas no início da loja. Máximo {MAX_BANNERS}.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingBanner(true)}
              disabled={!canManage || form.banners.length >= MAX_BANNERS}
            >
              + Adicionar banner
            </Button>
          </div>

          {form.banners.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">Nenhum banner publicado</p>
                  <p className="text-sm text-muted-foreground">
                    Adicione imagens para destacar campanhas, produtos ou novidades na vitrine.
                  </p>
                </div>
                {canManage && (
                  <Button variant="outline" onClick={() => setAddingBanner(true)}>
                    + Adicionar primeiro banner
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {form.banners.map((b, i) => (
                <li key={i}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center gap-3 p-3">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                          disabled={!canManage || i === 0}
                          onClick={() => moveBanner(i, i - 1)}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                          disabled={!canManage || i === form.banners.length - 1}
                          onClick={() => moveBanner(i, i + 1)}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground w-4">{i + 1}</span>
                      <img
                        src={b.url}
                        alt={b.alt ?? ""}
                        className="h-16 w-28 rounded object-cover"
                      />
                      <div className="min-w-[200px] flex-1 space-y-1">
                        <Label className="text-xs">Link (opcional)</Label>
                        <Input
                          value={b.link ?? ""}
                          onChange={(e) => updateBannerLink(i, e.target.value)}
                          readOnly={!canManage}
                          placeholder="/produto/... ou endereço externo"
                          className="h-8"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={b.url} target="_blank" rel="noreferrer">
                            Visualizar
                          </a>
                        </Button>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRemoveIdx(i)}
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* ---------- DESTAQUES ---------- */}
        <TabsContent value="destaques">
          <FeaturedTab />
        </TabsContent>
      </Tabs>

      {/* Sticky save bar */}
      {dirty && canManage && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Você tem alterações não salvas.
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDiscardOpen(true)}>
                Descartar
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AddBannerDialog
        open={addingBanner && canManage}
        onClose={() => setAddingBanner(false)}
        onAdd={(b) => {
          addBanner(b);
          setAddingBanner(false);
        }}
      />

      <AlertDialog open={removeIdx !== null} onOpenChange={(o) => !o && setRemoveIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover banner?</AlertDialogTitle>
            <AlertDialogDescription>
              O banner sairá da vitrine ao salvar as alterações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removeIdx !== null) removeBanner(removeIdx);
                setRemoveIdx(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              As mudanças não salvas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------- Add Banner Dialog -------------
function AddBannerDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (b: Banner) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setLink("");
      setUploading(false);
    }
  }, [open]);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("Selecione uma imagem");
    setUploading(true);
    try {
      const { assertValidImage, safeExtension } = await import("@/lib/upload");
      assertValidImage(file);
      const path = `banners/${crypto.randomUUID()}.${safeExtension(file)}`;
      const { error } = await supabase.storage
        .from("product-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("product-media").getPublicUrl(path);
      onAdd({ url: pub.publicUrl, link: link.trim() || undefined });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar banner</DialogTitle>
          <DialogDescription>
            Formato recomendado: 1600 × 600 px. JPG, PNG ou WebP — máximo de 5 MB.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f && f.type.startsWith("image/")) setFile(f);
            }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 text-center ${
              dragOver ? "border-primary bg-accent" : "border-border"
            }`}
          >
            {preview ? (
              <img src={preview} alt="" className="max-h-40 rounded object-contain" />
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Arraste uma imagem ou clique para selecionar
                </p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1">
            <Label>Link (opcional)</Label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/produto/... ou endereço externo"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={uploading || !file}>
              {uploading ? "Enviando…" : "Adicionar banner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------- Featured tab -------------
type FeaturedRow = {
  id: string;
  name: string;
  brand: string | null;
  visible: boolean;
  active: boolean;
  images: string[] | null;
  variations: { stock: number; active: boolean }[];
};

function FeaturedTab() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["featured-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brand, visible, active, images, variations(stock, active)")
        .eq("featured", true)
        .order("name");
      if (error) throw error;
      return data as unknown as FeaturedRow[];
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Produtos em destaque</h3>
          <p className="text-xs text-muted-foreground">
            Um produto sem estoque ou oculto não aparece publicamente, mesmo estando destacado.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{rows.length} selecionados</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Star className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum produto em destaque</p>
              <p className="text-sm text-muted-foreground">
                Marque produtos como destaque na tela de Produtos.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/admin/produtos">Gerenciar destaques em Produtos</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {rows.map((p) => {
                  const stock = p.variations.reduce(
                    (s, v) => s + (v.active ? v.stock : 0),
                    0,
                  );
                  const public_ = p.visible && p.active && stock > 0;
                  return (
                    <li key={p.id} className="flex items-center gap-3 p-3">
                      <div className="h-12 w-12 overflow-hidden rounded bg-muted">
                        {p.images?.[0] && (
                          <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {p.brand && (
                          <p className="text-xs text-muted-foreground">{p.brand}</p>
                        )}
                        <p className="truncate font-medium">{p.name}</p>
                      </div>
                      {public_ ? (
                        <Badge variant="secondary">Visível</Badge>
                      ) : stock === 0 ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> Sem estoque
                        </Badge>
                      ) : (
                        <Badge variant="outline">Oculto</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/produtos">Gerenciar destaques em Produtos</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
