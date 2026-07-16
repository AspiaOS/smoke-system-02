# Diagnóstico — SMOKE CONTROL

> Auditoria em modo somente-leitura. Nada foi corrigido nesta rodada.
> Emails/IDs anonimizados quando aparecem.

## Resumo executivo

1. **Criação de conta ignora o design de convite.** `createAccount` (`src/lib/platform.functions.ts:176`) usa `auth.admin.createUser` direto, aceita `storeId`/`role` opcionais e loga com `store_id:null, role:null` quando o vínculo é omitido — foi exatamente o que aconteceu no evento observado. O fluxo por `account_invitations` + `accept_store_invite` existe no banco mas **não é usado** pela Central.
2. **Metade do menu previsto está ausente.** Só existem Visão geral, Contas, Lojas e Auditoria. **Permissões, Convites e Segurança são AUSENTES.** "Sair" existe (rodapé da sidebar).
3. **Ações administrativas do dashboard são stubs visuais.** Não há botões de suspender / reativar / transferir / mudar papel em nenhuma tela — o servidor tem `setStoreStatus`, `setAccountStatus`, `assignMembership`, mas nenhuma UI os chama.
4. **Guarda de rota é só client-side (`ssr:false` + `beforeLoad`).** Server functions revalidam via `assertPlatformAdmin`, então dados estão protegidos, mas o shell `/control/*` renderiza no cliente antes da checagem — não há um layout server-side `requirePlatformAdmin()`.
5. **Testes do prompt (26 itens) não foram escritos.** Nenhum spec em `tests/e2e/` cobre `/control`.

Prioridade: (1) refazer criação de conta via convite e completar payload de auditoria; (2) implementar telas ausentes (Convites, Permissões, Segurança) ou remover do escopo; (3) expor ações administrativas na UI; (4) mover guarda para layout server-side; (5) escrever a suíte de testes.

---

## 1. Inventário do que existe

### Rotas `/control/*`

| Previsto | Arquivo real | Status |
|---|---|---|
| layout | `src/components/control/ControlShell.tsx` (componente, não route layout) | parcial — não há `_control` layout route |
| page (dashboard) | `src/routes/control.index.tsx` | implementado |
| login | `src/routes/control.login.tsx` | implementado |
| contas (lista) | `src/routes/control.contas.tsx` | implementado |
| contas/[id] | — | **AUSENTE** |
| contas/nova | `src/routes/control.contas_.nova.tsx` | implementado (fora do design de convite — ver §2) |
| lojas (lista) | `src/routes/control.lojas.tsx` | implementado |
| lojas/[id] | — | **AUSENTE** |
| lojas/nova | `src/routes/control.lojas_.nova.tsx` | implementado |
| permissoes | — | **AUSENTE** |
| convites | — | **AUSENTE** |
| auditoria | `src/routes/control.auditoria.tsx` | implementado |
| segurança | — | **AUSENTE** |

### Tabelas

| Tabela | Existe | RLS |
|---|---|---|
| `platform_admins` | sim | on |
| `platform_audit_logs` | sim | on |
| `account_invitations` | sim | on |
| `store_memberships` | sim | on |
| `profiles.status` | sim (coluna) | herda RLS de `profiles` |
| `stores.status` / `suspended_at` | sim | on |
| `platform_admin_allowlist` | sim (bootstrap) | — |

### Helpers de autorização

| Helper | Onde | O que checa |
|---|---|---|
| `getPlatformAdminSelf` | `src/lib/authz.functions.ts:9` | Retorna `{userId, role}` se `platform_admins.active`. Fail-closed. |
| `assertPlatformAdmin` (interno) | duplicado em `authz.functions.ts:24` e `platform.functions.ts:5` | Confere `platform_admins.active` + `platformRoleHasCapability`. **Não** valida `profiles.status` do ator. |
| `requireStoreCapability` | `src/lib/authz/require.server.ts` | Usa `current_store_id` (única loja) — não serve para multi-loja da Central. |
| `requirePlatformAdmin()` como layout server | — | **AUSENTE** — guarda é `beforeLoad` no cliente. |
| `requireStoreMembership` / `requireStorePermission` | — | **AUSENTES** com esse nome; existe apenas `requireStoreCapability`. |

### Server Actions previstas (16)

| Ação | Status | Nota |
|---|---|---|
| `listAccounts` | implementado | `authz.functions.ts:58` |
| `listStoresForControl` | implementado | idem |
| `getControlDashboard` | implementado | idem |
| `listPlatformAuditLogs` | implementado | `platform.functions.ts:42` |
| `createStore` (+ owner) | implementado | cria user + store + owner membership |
| `setStoreStatus` (suspend/reactivate) | implementado, **sem UI** | |
| `createAccount` | implementado, **conflita com design de convite** | ver §2 |
| `setAccountStatus` | implementado, **sem UI** | |
| `assignMembership` | implementado, **sem UI** | |
| `inviteAccount` / `sendInvite` | **AUSENTE** | função SQL `create_store_invite` existe, não é chamada pela Central |
| `acceptInvite` (Central) | existe no banco (`accept_store_invite`), sem rota `/invite/[token]` da Central | rota `invite.$token.tsx` cobre o fluxo de loja |
| `revokeInvite` / `cancelInvite` (Control) | **AUSENTE** | |
| `transferStoreOwnership` | **AUSENTE** | |
| `grantPlatformAdmin` / `revokePlatformAdmin` | **AUSENTE** | |
| `changeMembershipRole` (Control) | coberto por `assignMembership` upsert | |
| `removeMembership` | **AUSENTE** | |

---

## 2. Bug do `account.create` (prioridade)

- Origem: `createAccount` em `src/lib/platform.functions.ts:176-221`.
- Fluxo real: chama `supabaseAdmin.auth.admin.createUser` direto; `storeId` e `role` são **opcionais**. Quando ambos vêm vazios, cria o usuário no `auth`, **não** cria `profiles` (o upsert está dentro de `if (data.storeId)`) e **não** cria `store_memberships`. Depois loga com `store_id:null, role:null`.
- Registro observado: `platform_audit_logs` tem um `account.create` com `payload = { email:"…", role:null, store_id:null }`. Consulta em `profiles` pelo `target_id` retorna vazio — a conta ficou **órfã** (existe em `auth.users`, sem `profiles`, sem `store_memberships`).
- Consequência: a conta consegue logar no Supabase, mas ao entrar no app não tem `profile.status`, então qualquer rota que dependa de `profiles`/`store_memberships` trata como usuário sem loja. Também não aparece em `listAccounts()` porque essa função lista `profiles`.
- Conflito com o design (prompt §7.1): a criação deveria ser via **convite** (`account_invitations` + `accept_store_invite`), com papel e loja escolhidos antes do envio e o convidado definindo a própria senha ao aceitar.
- Correção proposta (não aplicada): substituir `createAccount` por `inviteAccount(email, displayName, storeId, role)` que insere em `account_invitations` com `token_hash`, envia email, e usa `accept_store_invite` em `/invite/:token`. Payload de auditoria passa a ter `email`, `store_id`, `role` sempre não-nulos.

---

## 3. Discrepâncias entre menu/telas e o prompt

- **Menu real** (`ControlShell.tsx` `NAV`): Visão geral, Contas, Lojas, Auditoria + botão Sair.
- **Faltam**: Permissões, Convites, Segurança (telas inteiras).
- **Dashboard**: 6 KPIs + nota "Ações administrativas chegam na próxima fase". **As ações são stubs** — nenhum botão de suspender/reativar/transferir/mudar papel está renderizado.
- **"+ Nova conta"**: abre `/control/contas/nova` e chama `createAccount` — funcional, mas viola o design (§2).
- **"+ Nova loja"**: abre `/control/lojas/nova` e chama `createStore` — funcional.
- **Auditoria**: 200 eventos mais recentes; sem filtros, paginação, export.
- **Contas / Lojas**: só listagem. Sem detalhe `/[id]`.

---

## 4. Verificação de segurança

| Item | Resposta | Evidência |
|---|---|---|
| `/control/*` protegido no servidor | **NÃO** — guarda é client-side (`ssr:false` + `beforeLoad` chamando `getPlatformAdminSelf`). Server functions revalidam via `assertPlatformAdmin`, então dados não vazam, mas o shell é renderizado no cliente. | `src/routes/control.index.tsx:6-12`, `src/lib/platform.functions.ts:5` |
| `/control/login` valida `platform_admins` | **SIM** | `src/routes/control.login.tsx:28-33` |
| Owner comum consegue abrir `/control` | **NÃO** (redirect), mas o shell pode piscar antes do `beforeLoad` resolver. Risco cosmético; dados protegidos. | mesmo trecho |
| `client.server` importado em Client Component | **NÃO** — todos os imports estão em handlers de server functions via `await import`. | grep |
| Server actions validam sessão + permissão antes | **SIM** — cada função em `platform.functions.ts` começa com `assertPlatformAdmin`. **NÃO** validam `profiles.status` do ator. | `platform.functions.ts` |
| RLS ativa nas novas tabelas | **SIM** em `platform_admins`, `platform_audit_logs`, `account_invitations`, `store_memberships`, `stores`, `profiles`. |
| Tabelas sem policy | `platform_audit_logs` tem RLS on mas **sem policy** para `authenticated` — só `service_role` lê/grava. Fail-closed, mas documentar. |
| Auditoria append-only (bloqueia UPDATE/DELETE) | **NÃO** — a função `tg_platform_audit_append_only` existe, mas **não há trigger** anexada (o contexto declara "There are no triggers"). **RISCO alto**: `service_role` pode alterar/apagar eventos. |
| `platform_admins` só permite SELECT via policy | **SIM** — INSERT/UPDATE só via `service_role`. |
| Policy `account_invitations "members can view invites"` limita corretamente | **NÃO VERIFICADO** — predicado não inspecionado nesta rodada. Risco médio. |

**Riscos consolidados:**

- **Alto** — trigger append-only ausente em `platform_audit_logs`.
- **Média** — guarda `/control/*` só client-side.
- **Média** — server actions não conferem `profiles.status` do ator.
- **Baixa** — policy de leitura em `account_invitations` não auditada.

---

## 5. Bugs consolidados

| # | Sintoma | Onde | Causa provável | Severidade | Correção proposta |
|---|---|---|---|---|---|
| 1 | `account.create` com `role:null, store_id:null`; conta órfã sem profile/membership | `platform.functions.ts:176` | Fluxo cria user direto em vez de convite; upsert de profile é condicional | Alta (segurança/design) | Substituir por `inviteAccount` via `account_invitations` + `accept_store_invite` |
| 2 | `platform_audit_logs` sem trigger append-only | banco | Função existe, trigger não foi criada | Alta | `CREATE TRIGGER … BEFORE UPDATE OR DELETE … EXECUTE FUNCTION tg_platform_audit_append_only` |
| 3 | Guarda `/control/*` só client-side | rotas `control.*.tsx` | Sem layout server; usa `ssr:false + beforeLoad` | Média | `_control` layout route com loader chamando `assertPlatformAdmin` |
| 4 | Ações Suspender/Reativar/Transferir/Mudar papel sem UI | listas de contas/lojas | Só listagens entregues | Média | Criar `/control/contas/$id` e `/control/lojas/$id` com botões que chamam `setAccountStatus` / `setStoreStatus` / `assignMembership` |
| 5 | Menu incompleto (Permissões, Convites, Segurança) | `ControlShell.tsx` | Não implementado | Média | Criar as três telas ou reduzir escopo declarado |
| 6 | `listAccounts` só mostra quem tem `profile` | `authz.functions.ts:58` | Baseia-se em `profiles` | Média | `full outer join` com `auth.users` ou garantir profile sempre criado |
| 7 | Auditoria sem filtros/paginação | `control.auditoria.tsx` | Cap 200 sem UI | Baixa | Filtros por action/target/data + cursor |
| 8 | Server actions ignoram `profiles.status` do ator | `platform.functions.ts` | `assertPlatformAdmin` só checa `platform_admins.active` | Média | Incluir `profiles.status='active'` na checagem |
| 9 | Duplicação de `assertPlatformAdmin` | `authz.functions.ts:24` e `platform.functions.ts:5` | Copiado | Baixa | Extrair para `authz/platform.server.ts` |
| 10 | Sem detalhes `/control/contas/[id]` e `/control/lojas/[id]` | rotas ausentes | Não implementado | Média | Criar rotas de detalhe |
| 11 | Suite de testes (26 casos) não escrita | `tests/e2e/` | Nunca implementada | Alta (qualidade) | Criar `tests/e2e/control-*.spec.ts` |

---

## 6. Estado do build e testes

- **Build / lint / typecheck / vitest**: não executados nesta rodada por diretriz do prompt (apenas relatório). O harness do Lovable executa build/typecheck automaticamente e não há erro conhecido em `/control/*` no momento.
- **Testes obrigatórios (26)**: `tests/e2e/` contém apenas `admin-auth`, `admin-config`, `admin-produtos`, `checkout` (do sistema legado). **Nenhum caso do prompt do SMOKE CONTROL foi implementado** — todos ausentes.

---

## 7. Migração do owner atual

- **Owner operacional**: as migrations existentes criam `store_memberships` para o dono inicial. Não foi encontrado registro órfão do owner original; migração funcional OK.
- **Platform admin inicial**: o "1" no dashboard corresponde ao `INSERT INTO platform_admins` manual feito na conversa anterior para o email do usuário (super_admin, active). Isso **não** passou pelo caminho auditável (`platform_admin_allowlist` + trigger `grant_platform_admin_from_allowlist`, que existem no banco mas não foram usados). Um "grant improvisado" — funciona, mas ficou fora do caminho de bootstrap.

---

*Fim do diagnóstico.*
