
## Contexto e restrições reais do projeto

Antes do plano, três pontos importantes descobertos ao inspecionar o projeto que **mudam o formato pedido no prompt** (e que precisam da sua confirmação antes de eu implementar):

1. **`npm run seed:demo` local não é viável neste projeto.** Ele roda em Lovable Cloud, o `SUPABASE_SERVICE_ROLE_KEY` e o `SUPABASE_DB_URL` **não são acessíveis fora do runtime** (não existem no seu `.env` local nem podem ser expostos). Um script Node local não teria como autenticar contra o banco.
   - **Proposta:** trocar `npm run seed:*` por **server functions protegidas** (`createServerFn` com `requireSupabaseAuth` + verificação de role `owner`), disparadas a partir de uma tela interna oculta em `/admin/demo` visível só em ambiente não-produção.
   - Comandos equivalentes: botões **"Semear (small)"**, **"Semear (full)"**, **"Validar"**, **"Resetar lote demo"**.

2. **Datas históricas de 120 dias esbarram nas RPCs oficiais** (`accept_order`, `stock_entry`, `stock_adjust`, `create_public_order`) — todas usam `now()` e não aceitam timestamp. As opções são:
   - (a) **Backfill de timestamps via SQL** após criar tudo pelo fluxo oficial. Mantém `stock`/relacionamentos corretos; só reescreve `created_at`/`accepted_at`/`cancelled_at` mantendo a ordem `pedido ≤ aceite ≤ venda ≤ movimentação ≤ log`. **Recomendado.**
   - (b) Criar RPCs `SECURITY DEFINER` novas, exclusivas de seed, que aceitam `_at TIMESTAMP`. Mais invasivo, adiciona superfície permanente ao schema.
   - **Proposta: (a).** O backfill é feito só nas linhas do manifest, jamais em dados reais.

3. **O gate `ALLOW_DEMO_SEED=true`** vira uma checagem no handler da server function contra `process.env.ALLOW_DEMO_SEED === "true"` (secret runtime). Sem esse secret configurado, toda tentativa falha com `403`.

## Arquivos a criar / alterar

```
src/lib/demo/
  demo-data.ts              # catálogos determinísticos (nomes, marcas, bairros, motivos, PRNG mulberry32)
  demo-seed.functions.ts    # createServerFn: seedDemo({ profile: 'small'|'full' })
  demo-reset.functions.ts   # createServerFn: resetDemo() — lê manifest da tabela e apaga só os IDs listados
  demo-validate.functions.ts# createServerFn: validateDemo() — 17 checagens do prompt
  demo-manifest.server.ts   # helpers de leitura/gravação do manifest (server-only)
  demo-guard.server.ts      # checa ALLOW_DEMO_SEED + role owner + env não-produção
src/routes/_authenticated/admin.demo.tsx   # tela interna com 4 botões e log de execução
supabase/migrations/<ts>_demo_manifest.sql
  # cria public.demo_manifest (id, run_id, profile, seed, created_at, entries jsonb, summary jsonb)
  # RLS + GRANT para owner apenas
public/demo/                # 3 banners SVG + ~10 product-*.svg (assets locais, arte simples)
```

Nada em `scripts/` porque não há canal para rodá-los. Nada de `.seed/demo-manifest.json` — o manifest vive na tabela `demo_manifest` (persistente, auditável, acessível ao reset).

## Fluxo do `seedDemo`

```
0. Guard: env != produção, role=owner, ALLOW_DEMO_SEED=true, sem lote demo ativo (idempotência)
1. Ler store_id e owner user_id
2. Registrar linha em demo_manifest (status='running', run_id, seed=20260715)
3. Categorias (8) — INSERT direto
4. Produtos (~40) — INSERT direto, com images apontando p/ /demo/product-*.svg
5. Variações (~120) com stock=0 — INSERT direto
6. Bairros (~12) — INSERT direto
7. Estoque inicial: stock_entry() por variação (respeita RPC oficial)
8. Ajustes ocasionais: stock_adjust() para gerar histórico + audit
9. Pedidos (~120): create_public_order() por pedido → todos nascem 'pending'
10. Cancelar ~15% via cancel_order()
11. Aceitar ~70% via accept_order() — baixa estoque, cria sale + movimentação + log
12. Despesas (40–70) — INSERT direto
13. Ajustes de preço em ~15 variações → audit_logs 'price.update' (before/after)
14. settings.update: nome/whatsapp/banners/destaques + audit_logs
15. Backfill de datas históricas (SQL restrito aos IDs do manifest, mantendo ordem causal)
16. Atualizar demo_manifest.entries e .summary; status='complete'
17. Rodar validateDemo() automaticamente e anexar resultado ao manifest
```

Todo INSERT captura o `id` retornado no array `entries[tabela]` do manifest para o reset.

## Fluxo do `resetDemo`

Lê `demo_manifest.entries`; apaga na ordem FK-safe:

```
audit_logs → stock_movements → sales → order_items → orders →
expenses → variations → products → categories → neighborhoods →
demo_manifest (a própria linha)
```

Configurações da loja são **revertidas** para snapshot pré-seed guardado em `demo_manifest.pre_snapshot`. Se o manifest não existir, o reset **falha** com `no_manifest_found` — jamais tenta apagar "por padrão".

## Fluxo do `validateDemo`

Executa as 17 verificações do prompt como SQL/queries determinísticas contra IDs do manifest. Retorna `{ ok: boolean, checks: Array<{ name, passed, detail }>, scenarios: 25/25 }`.

## Determinismo

PRNG mulberry32 semeado com `DEMO_RANDOM_SEED=20260715`. Todos os arrays são embaralhados/escolhidos a partir dele. Uma segunda execução com o mesmo seed produz os mesmos números, nomes e distribuições — mas o guard de idempotência (passo 0) impede rodar duas vezes sem `resetDemo` antes.

## Tratamento de erros

- Cada passo em try/catch. Em falha: `demo_manifest.status='failed'`, guarda `entries` já criadas, propaga erro. `resetDemo` funciona sobre manifest parcial.
- Sem try/catch vazios. Sem rollback destrutivo automático — usuário decide entre reset ou investigar.

## Fora do escopo desta task

- `npm test` e `npm run build`: rodam via harness após implementação; não invento novos testes se o repo hoje não tem framework de testes configurado.
- Criação de usuários fictícios em `auth.users` — proibido pelo prompt, cumprido.
- Fotos de produtos reais — usaremos SVGs simples gerados como texto (sem gerar 40 imagens PNG).

## O que preciso de você antes de codar

1. **Confirma trocar `npm run seed:*` por server functions + tela `/admin/demo`?** (não há como rodar Node local com service role no Lovable Cloud)
2. **Confirma opção (a) para as datas** (backfill SQL restrito ao lote) em vez de criar novas RPCs `SECURITY DEFINER`?
3. **Configuro o secret runtime `ALLOW_DEMO_SEED=true`** agora (com `set_secret`) para o ambiente de preview? Em produção fica ausente.

Assim que você confirmar, entrego tudo em uma passada: migration do `demo_manifest`, os 5 arquivos em `src/lib/demo/`, a tela `/admin/demo`, os SVGs em `public/demo/`, e o README com instruções.
