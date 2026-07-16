# Fase 11 — Refactor

Objetivo: reduzir duplicação e tamanho de arquivos sem mudar comportamento. Zero mudança de UI/UX, zero mudança de schema, zero mudança de contrato dos server functions.

## Parte A — Server utils compartilhados

Criar `src/lib/server-utils.ts` (helpers server-only, `import { getRequestHeader } from "@tanstack/react-start/server"`):

- `getClientIp(): string` — extrai IP de `x-forwarded-for` / `cf-connecting-ip` / `x-real-ip`.
- `assertSameOrigin(): void` — valida `origin` vs `host`, lança `Response(403)`.
- `createPublicSupabase()` — cria client publishable com o shim de `apikey` (sem `Authorization: Bearer sb_...`), pronto para uso em server fns públicas.
- `checkRateLimit({ key, bucket, max, windowSeconds })` — wrapper sobre `rpc('check_rate_limit', ...)`, fail-open.

Refatorar `src/lib/checkout.functions.ts` para consumir esses helpers. Comportamento idêntico.

Observação: hoje só `checkout.functions.ts` usa esses helpers, mas centralizá-los prepara o terreno para novos server fns públicos sem duplicar o shim de `sb_` key.

## Parte B — Quebrar `src/routes/checkout.tsx`

Arquivo atual: 339 linhas. Extrair para `src/components/checkout/`:

- `CartList.tsx` — renderiza itens do carrinho + controles (+/-/remove).
- `CustomerForm.tsx` — nome, WhatsApp, endereço, bairro (select), pagamento (chips). Props controlam estado, sem lógica de submit.
- `OrderSummary.tsx` — subtotal, entrega, total.
- `Field.tsx` e `Row.tsx` — primitivos internos usados pelo form/summary.
- `build-whatsapp-message.ts` — `buildWhatsAppMessage()` puro, testável.

`checkout.tsx` fica só com: estado, `useMutation`, honeypot, layout e composição dos componentes. Alvo: ~130 linhas.

## Parte C — Componentes admin compartilhados

Padrões repetidos nas páginas `_authenticated/admin.*`:

- Cabeçalho de página (título + botão de ação primário).
- Tabelas simples de listagem (cabeçalho, linhas, empty state, loading).
- Botões destrutivos com confirmação (usados em vendas, despesas, produtos, categorias, clientes).
- Campos de formulário rotulados (label maiúsculo + input rounded, hoje duplicado em cada página).

Criar `src/components/admin/`:

- `PageHeader.tsx` — `{ title, action? }`.
- `DataTable.tsx` — `{ columns, rows, empty, loading }` genérico simples (não substitui tabelas com features complexas como estoque/pedidos; usado por categorias, despesas, clientes, frete, auditoria).
- `ConfirmButton.tsx` — botão + `AlertDialog` de confirmação para deletar.
- `FormField.tsx` — label + input padronizados, usados em configurações, categorias, frete.

Aplicar em, no mínimo: `admin.categorias.tsx`, `admin.frete.tsx`, `admin.despesas.tsx`, `admin.auditoria.tsx`, `admin.configuracoes.tsx`.

**Fora do escopo desta fase:** páginas com tabelas grandes e específicas (`admin.estoque.tsx`, `admin.pedidos.tsx`, `admin.produtos.index.tsx`) — refatorar essas exigiria mudanças maiores; deixar para uma Fase 11.1 se você quiser depois.

## Validação

- `tsgo` typecheck limpo.
- Rodar `bunx playwright test tests/e2e/checkout.spec.ts` e `admin-config.spec.ts` para garantir que UI e fluxo continuam idênticos.
- Diff visual: sem mudanças (só reorganização).

## Ordem

1. Parte A (server-utils + refactor checkout.functions.ts).
2. Parte B (componentes de checkout).
3. Parte C (componentes admin + aplicar em 5 páginas).
4. Typecheck + testes.

Aprovar para eu executar.
