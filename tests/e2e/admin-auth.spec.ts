import { test, expect } from "@playwright/test";
import { loginAsAdmin, signOut } from "./helpers";

const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;
const email2 = process.env.TEST_ADMIN_EMAIL_2;
const password2 = process.env.TEST_ADMIN_PASSWORD_2;

test.describe("Auth admin", () => {
  test.skip(!email || !password, "TEST_ADMIN_EMAIL/PASSWORD ausentes.");

  test("login redireciona para /admin", async ({ page }) => {
    await loginAsAdmin(page, email!, password!);
    await expect(page).toHaveURL(/\/admin/);
  });

  test("logout limpa sessão e volta para /auth", async ({ page }) => {
    await loginAsAdmin(page, email!, password!);
    await signOut(page);
    await expect(page).toHaveURL(/\/auth/);
    await page.goto("/admin");
    await page.waitForURL(/\/auth/, { timeout: 10_000 });
  });

  test("troca de conta não crasha /configuracoes", async ({ page }) => {
    test.skip(!email2 || !password2, "Segunda conta não configurada.");
    await loginAsAdmin(page, email!, password!);
    await page.goto("/admin/configuracoes");
    await expect(page.getByLabel(/whatsapp/i).first()).toBeVisible();

    await signOut(page);
    await loginAsAdmin(page, email2!, password2!);
    await page.goto("/admin/configuracoes");
    await expect(page.getByLabel(/whatsapp/i).first()).toBeVisible();
  });
});