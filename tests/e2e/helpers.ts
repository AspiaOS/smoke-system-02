import { expect, type Page } from "@playwright/test";

export async function loginAsAdmin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/admin(\/|$)/, { timeout: 15_000 });
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: /sair|logout/i }).first().click();
  await page.waitForURL(/\/auth(\?|$)/, { timeout: 10_000 });
}

export function requireAdminEnv(): { email: string; password: string } {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD ausentes.");
  }
  return { email, password };
}

export async function expectNoPageErrors(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.waitForTimeout(100);
  expect(errors, `Erros de página: ${errors.join("\n")}`).toEqual([]);
}