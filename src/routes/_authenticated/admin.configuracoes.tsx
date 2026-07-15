import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  component: SettingsPage,
});

type Settings = {
  store_id: string;
  store_display_name: string;
  whatsapp_number: string;
  business_hours: string | null;
  pix_key: string | null;
  banners: { url: string; alt?: string }[];
};

function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["store_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*").maybeSingle();
      if (error) throw error;
      return data as unknown as Settings | null;
    },
  });

  const [form, setForm] = useState<Settings | null>(null);

  useEffect(() => {
    if (settings && !form) setForm({ ...settings, banners: settings.banners ?? [] });
  }, [settings, form]);

  const save = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      if (!settings) throw new Error("Sem loja");
      const { error } = await supabase.from("store_settings").update(patch).eq("store_id", settings.store_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["store_settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  function updateBanner(i: number, patch: Partial<{ url: string; alt: string }>) {
    if (!form) return;
    const next = [...form.banners];
    next[i] = { ...next[i], ...patch };
    setForm({ ...form, banners: next });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Dados públicos da vitrine e canais de contato.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Loja</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Nome exibido</Label>
            <Input value={form.store_display_name} onChange={(e) => setForm({ ...form, store_display_name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>WhatsApp (com DDD)</Label>
            <Input value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} placeholder="5511999999999" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Horário de funcionamento</Label>
            <Textarea rows={2} value={form.business_hours ?? ""} onChange={(e) => setForm({ ...form, business_hours: e.target.value })} placeholder="Seg-Sex 18h-23h · Sáb-Dom 15h-00h" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Chave PIX</Label>
            <Input value={form.pix_key ?? ""} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Banners</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setForm({ ...form, banners: [...form.banners, { url: "", alt: "" }] })}>
            Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.banners.length === 0 && <p className="text-sm text-muted-foreground">Nenhum banner.</p>}
          {form.banners.map((b, i) => (
            <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
              <Input value={b.url} onChange={(e) => updateBanner(i, { url: e.target.value })} placeholder="URL da imagem" />
              <Input value={b.alt ?? ""} onChange={(e) => updateBanner(i, { alt: e.target.value })} placeholder="Descrição (alt)" />
              <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, banners: form.banners.filter((_, idx) => idx !== i) })}>
                Remover
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() =>
            save.mutate({
              store_display_name: form.store_display_name.trim(),
              whatsapp_number: form.whatsapp_number.replace(/\D/g, ""),
              business_hours: form.business_hours?.trim() || null,
              pix_key: form.pix_key?.trim() || null,
              banners: form.banners.filter((b) => b.url.trim()),
            })
          }
          disabled={save.isPending}
        >
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
