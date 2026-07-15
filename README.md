# Smoke — dados de demonstração

Gerador determinístico de dados fictícios para testar todas as telas
(dashboard, produtos, pedidos, vendas, estoque, despesas, frete, auditoria).

## Como funciona

- Não roda como script local. Tudo acontece em **server functions
  protegidas** dentro do próprio app (o Lovable Cloud não expõe a
  service key nem o DB URL para scripts locais).
- Todo pedido nasce como `pending` via `create_public_order`, e é aceito
  ou cancelado pelos fluxos oficiais (`accept_order` / `cancel_order`).
  O estoque só muda através de `stock_entry`, `stock_adjust` ou aceite
  de pedido.
- Cada rodada grava um **manifest** em `public.demo_manifest` com todos
  os IDs criados. O reset apaga **exclusivamente** esses IDs — nada de
  dados pré-existentes é tocado.
- Sementes fixas (`DEMO_RANDOM_SEED = 20260715`) tornam a rodada
  reprodutível.

## Pré-requisitos

1. Estar autenticado como **owner** da loja.
2. Estar em ambiente **não-produção** (preview).
3. Ter o secret runtime `ALLOW_DEMO_SEED=true` configurado. Sem ele o
   handler retorna `DEMO_DISABLED`.

## Uso

Abra `/admin/demo` (visível apenas para o owner).

Botões disponíveis:

| Ação | O que faz |
|------|-----------|
| **Semear (small)** | ~12 produtos, ~24 variações, ~30 pedidos, ~20 despesas |
| **Semear (full)** | ~40 produtos, ~120 variações, ~120 pedidos, ~60 despesas |
| **Validar lote** | Roda 20+ checagens de invariantes (ver abaixo) |
| **Resetar lote demo** | Apaga só os IDs do manifest, na ordem FK-safe |

Se já existir um lote ativo, o botão de semear ficará desabilitado até
você resetar.

## Como identificar o banco de destino

O painel `/admin/demo` mostra o `run_id`, o perfil, a seed e o status do
manifest ativo. Ele é gravado na mesma base que o app está usando (Lovable
Cloud atualmente conectado). O snapshot de configurações da loja
pré-execução também é guardado no manifest para reversão exata.

## Como remover somente os dados demo

Clique em **Resetar lote demo**. A operação lê `public.demo_manifest`
e apaga na ordem: `audit_logs → stock_movements → sales → order_items →
orders → expenses → customers → variations → products → categories →
neighborhoods`. Em seguida reverte `store_settings` para o snapshot
pré-seed e apaga a linha do manifest. Se não houver manifest, o reset
falha com `no_manifest_found` — nunca deleta “por padrão”.

## Cenários cobertos

O gerador garante presença de: produto ativo/visível/com estoque; produto
sem estoque; produto oculto; produto inativo; produto em categoria
inativa; variação abaixo do mínimo; variação exatamente no mínimo;
variação inativa; pedido pendente recente e antigo; pedido aceito;
pedido cancelado; cliente recorrente; cliente com pedidos cancelados
apenas; bairro ativo, inativo e com frete grátis; venda com margem
alta e baixa; períodos com despesas maiores que o lucro bruto; produto
sem venda há mais de 30 dias; histórico de estoque com `entry`,
`adjustment` e `sale_accept`; e audit_logs para as ações principais.

## Validações automáticas

O painel executa checagens após o seed (ou sob demanda em **Validar
lote**): sem estoque negativo; toda venda aponta para pedido aceito;
nenhum pedido cancelado/pendente tem venda; pedido aceito tem
`accepted_at` e cancelado tem `cancelled_at`; sem venda duplicada por
pedido; `total = subtotal + frete`; `gross_profit = subtotal −
total_cost`; telefones normalizados em E.164; `sale_accept` sempre
com `order_id`; existem bairros inativos; os IDs do manifest existem;
e os 12 cenários acima.

## Nunca em produção

`ALLOW_DEMO_SEED` **não deve existir** como secret na build de produção.
A ausência do secret bloqueia qualquer chamada às server functions
`seedDemoFn`, `resetDemoFn`, `validateDemoFn` com `DEMO_DISABLED`. Esse
é o gate primário; a checagem de `is_owner()` é a segunda camada.

## Datas históricas

As RPCs oficiais usam `now()`; para simular 120 dias, o seed rewrites
`created_at`, `accepted_at`, `cancelled_at` em `orders`, `sales`,
`stock_movements` e `audit_logs` **apenas nas linhas do manifest** e
apenas depois que todo o fluxo oficial ter concluído. A ordem causal
(pedido ≤ aceite ≤ venda ≤ movimentação ≤ log) é mantida.

## Arquivos-chave

```
src/lib/demo/
  demo-data.ts                    catálogos + PRNG mulberry32
  demo-guard.server.ts            checagem de ALLOW_DEMO_SEED
  demo-manifest.server.ts         leitura/gravação da linha de manifest
  demo-seed.runner.server.ts      lógica principal do seed
  demo-seed.functions.ts          wrapper createServerFn (POST)
  demo-reset.runner.server.ts     lógica do reset
  demo-reset.functions.ts         wrapper createServerFn (POST)
  demo-validate.runner.server.ts  20+ verificações
  demo-validate.functions.ts      wrapper createServerFn (POST)
src/routes/_authenticated/admin.demo.tsx   painel de controle
public/demo/                              banners e produto SVG demo
```
