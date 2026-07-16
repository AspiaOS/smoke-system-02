import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

test.describe("CRUD produto", () => {
  test.skip(!email || !password, "TEST_ADMIN_EMAIL/PASSWORD ausentes.");

  const nome = `Produto E2E ${Date.now()}`;

  test("cria, edita e deleta produto", async ({ page }) => {
    await loginAsAdmin(page, email!, password!);
    await page.goto("/admin/produtos");

    await page.getByRole("link", { name: /novo|criar|adicionar/i }).first().click();
    await page.waitForURL(/\/admin\/produtos\/.+/, { timeout: 10_000 });

    await page.getByLabel(/nome/i).first().fill(nome);
    const priceInput = page.getByLabel(/preço|preco/i).first();
    if (await priceInput.count()) await priceInput.fill("19.90");

    await page.getByRole("button", { name: /salvar|criar/i }).first().click();
    await expect(page.getByText(/salvo|criado|sucesso/i).first()).toBeVisible({ timeout: 10_000 });

    await page.goto("/admin/produtos");
    await expect(page.getByText(nome)).toBeVisible({ timeout: 10_000 });

    await page.getByText(nome).first().click();
    await page.waitForURL(/\/admin\/produtos\/.+/);
    const nomeInput = page.getByLabel(/nome/i).first();
    await nomeInput.fill(`${nome} editado`);
    await page.getByRole("button", { name: /salvar/i }).first().click();
    await expect(page.getByText(/salvo|sucesso/i).first()).toBeVisible({ timeout: 10_000 });

    page.once("dialog", (d) => d.accept());
    const deleteBtn = page.getByRole("button", { name: /excluir|deletar|remover/i }).first();
    if (await deleteBtn.count()) {
      await deleteBtn.click();
      await page.waitForURL(/\/admin\/produtos\/?$/, { timeout: 10_000 });
      await expect(page.getByText(`${nome} editado`)).toHaveCount(0);
    }
  });
});