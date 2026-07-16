# Fase 10 — Testes E2E + Rate-limit

## Aviso importante (rate-limit)

O backend **não tem primitiva padrão de rate-limit** (sem Redis, sem KV, sem Upstash). Implementação será **ad-hoc via tabela Postgres** (`rate_limit_hits`), suficiente para bloquear abuso trivial de um endpoint público. Não é production-grade contra ataques distribuídos — para isso seria Cloudflare Turnstile ou WAF, fora do escopo desta fase. Confirmando que você aceita esse tradeoff ao aprovar o plano.

## Parte A — Rate-limit no `createPublicOrder`

**Nova tabela `rate_limit_hits`:**
- `key` (text, PK-parcial): identifica o cliente. Usaremos `ip:<ip>` extraído do header `x-forwarded-for` no server fn.
- `bucket` (text): nome do endpoint (ex: `create_public_order`).
- `hit_at` (timestamptz default now())
- índice em `(key, bucket, hit_at desc)`

**Função SQL `check_rate_limit(_key text, _bucket text, _max int, _window_seconds int)`** (SECURITY DEFINER):
- Conta hits nos últimos `_window_seconds`. Se >= `_max`, retorna `false`. Senão, insere um hit e retorna `true`.
- GRANT EXECUTE para `anon, authenticated`.
- Job de limpeza: policy de retenção via `delete from rate_limit_hits where hit_at < now() - interval '1 hour'` no início da própria função (housekeeping barato).

**RLS na tabela:** enable RLS, sem policies para anon/authenticated (só a função definer escreve/lê). GRANT nada para roles Data API.

**No `createPublicOrder` (server fn):**
- Extrair IP do request via `getWebRequest()` header `x-forwarded-for` (primeiro item) ou `cf-connecting-ip`.
- Chamar `supabaseAdmin.rpc('check_rate_limit', { _key: 'ip:'+ip, _bucket: 'create_public_order', _max: 5, _window_seconds: 60 })`.
- Se `false`, lançar `Response('Too many requests', { status: 429 })`.
- Limite: **5 pedidos/minuto por IP**.

## Parte B — Testes E2E com Playwright

Estrutura: pasta `tests/e2e/` com scripts Playwright em Python (usando a infra `/tmp/browser` já disponível no sandbox). **Não** vamos adicionar Playwright como dep npm — os testes rodam via `code--exec` durante desenvolvimento, não no CI ainda.

Alternativa: usar `@playwright/test` como devDep para rodar via `bunx playwright test`. **Escolho a segunda** (mais reutilizável e permite `expect` estruturado).

**Instalação:** `bun add -d @playwright/test` + `playwright.config.ts` mínimo apontando para `http://localhost:8080`.

**Arquivos:**

1. `tests/e2e/checkout.spec.ts` — Checkout público completo
   - Visita `/`, adiciona 1º produto ao carrinho, abre `/checkout`, preenche nome/telefone/endereço, seleciona bairro, submete.
   - Verifica que URL do WhatsApp é gerada (mock: intercepta `window.open` e captura URL).
   - Assert que a URL contém nome do cliente e nome do produto.

2. `tests/e2e/admin-auth.spec.ts` — Login/logout admin
   - Cria usuário admin via seed (ou usa `LOVABLE_BROWSER_SUPABASE_*` se disponível).
   - Login → navega para `/admin/produtos` → logout → verifica redirect para `/auth` → login com outra conta → verifica que dashboard mostra dados da conta 2, não da 1.

3. `tests/e2e/admin-produtos.spec.ts` — CRUD produto
   - Login admin → cria produto (nome, preço, categoria) → verifica na lista → edita preço → deleta → verifica remoção.
   - Skip upload de mídia (Playwright + storage é ruído; cobre em teste manual).

4. `tests/e2e/admin-config.spec.ts` — Configurações
   - Login admin → `/admin/configuracoes` → edita número WhatsApp → salva → reload → verifica persistência.
   - Adiciona bairro → verifica na lista → deleta.

**Setup compartilhado:** `tests/e2e/helpers.ts` com `loginAsAdmin(page, email, password)` e `seedTestData()` (chama server fns).

**Credenciais de teste:** ler `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` do env; se ausentes, `test.skip()`. Documentar no README dos testes.

## Ordem de execução

1. Migration: tabela `rate_limit_hits` + função `check_rate_limit`.
2. Editar `src/lib/checkout.functions.ts`: adicionar rate-limit check no início do handler.
3. `bun add -d @playwright/test` + `playwright.config.ts`.
4. Criar 4 specs + helpers.
5. Rodar `bunx playwright test` e iterar até verde.

## Fora de escopo

- Testes de upload de mídia (Storage).
- Testes de responsividade mobile.
- CI (GitHub Actions) — apenas execução local por enquanto.
- Rate-limit por usuário autenticado (só IP para o endpoint público).
