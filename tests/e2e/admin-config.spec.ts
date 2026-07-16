import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

test.describe("Configurações admin", () => {
  test.skip(!email || !password, "TEST_ADMIN_EMAIL/PASSWORD ausentes.");

  test("edita WhatsApp e persiste após reload", async ({ page }) => {
    await loginAsAdmin(page, email!, password!);
    await page.goto("/admin/configuracoes");

    const whatsInput = page.getByLabel(/whatsapp/i).first();
    await expect(whatsInput).toBeVisible();

    const original = await whatsInput.inputValue();
    const novo = `5511${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;

    await whatsInput.fill(novo);
    await page.getByRole("button", { name: /salvar/i }).first().click();
    await expect(page.getByText(/salvo|sucesso/i).first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByLabel(/whatsapp/i).first()).toHaveValue(novo);

    if (original) {
      await page.getByLabel(/whatsapp/i).first().fill(original);
      await page.getByRole("button", { name: /salvar/i }).first().click();
    }
  });
});