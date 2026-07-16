# Testes E2E (Playwright)

Cobertura dos fluxos críticos: checkout público, login/logout admin, CRUD
de produto e configurações da loja.

## Pré-requisitos

1. Dev server rodando em `http://localhost:8080` (`bun run dev`).
2. Playwright + Chromium instalados:
   ```bash
   bunx playwright install chromium
   ```
3. Variáveis de ambiente para testes de admin (opcional — se ausentes, os
   testes correspondentes são pulados via `test.skip()`):
   ```bash
   export TEST_ADMIN_EMAIL="admin@exemplo.com"
   export TEST_ADMIN_PASSWORD="senhaForte123"
   export TEST_ADMIN_EMAIL_2="admin2@exemplo.com"
   export TEST_ADMIN_PASSWORD_2="outraSenha123"
   ```
4. Os testes de admin assumem que os e-mails já estão na tabela
   `admin_allowlist` com role `owner`.

## Execução

```bash
bunx playwright test                       # tudo
bunx playwright test checkout              # só checkout
bunx playwright test --ui                  # modo interativo
bunx playwright show-report                # após falha
```

## Escopo

- `checkout.spec.ts` — carrinho → checkout → mensagem de WhatsApp.
- `admin-auth.spec.ts` — login, logout limpa cache, re-login com outra conta.
- `admin-produtos.spec.ts` — criar, editar e deletar produto.
- `admin-config.spec.ts` — editar número WhatsApp e persistir.

## Fora de escopo

- Upload de mídia, responsividade mobile, integração CI.
