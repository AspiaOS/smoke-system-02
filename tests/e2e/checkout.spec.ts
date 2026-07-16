import { test, expect } from "@playwright/test";

test.describe("Checkout público", () => {
  test("adiciona produto, preenche checkout e gera link do WhatsApp", async ({ page, context }) => {
    const openedUrls: string[] = [];
    await context.exposeFunction("__captureOpen", (url: string) => {
      openedUrls.push(url);
    });
    await page.addInitScript(() => {
      const originalOpen = window.open;
      window.open = ((url?: string | URL, ...rest: unknown[]) => {
        const u = typeof url === "string" ? url : url?.toString() ?? "";
        (window as unknown as { __captureOpen: (u: string) => void }).__captureOpen(u);
        return originalOpen ? originalOpen.call(window, url as string, ...(rest as [])) : null;
      }) as typeof window.open;
    });

    await page.goto("/");

    const addButton = page.getByRole("button", { name: /adicionar/i }).first();
    await expect(addButton, "Nenhum produto na home — falta seed.").toBeVisible();
    await addButton.click();

    const goToCheckout = page.getByRole("link", { name: /checkout|carrinho|finalizar/i }).first();
    if (await goToCheckout.count()) {
      await goToCheckout.click();
    } else {
      await page.goto("/checkout");
    }
    await expect(page).toHaveURL(/\/checkout/);

    await page.getByLabel(/nome/i).fill("Cliente Teste E2E");
    await page.getByLabel(/telefone|whatsapp/i).fill("11999998888");
    await page.getByLabel(/endereço|endereco/i).fill("Rua dos Testes, 123");

    const bairroSelect = page.getByLabel(/bairro/i);
    const opts = await bairroSelect.locator("option").allTextContents();
    const firstReal = opts.find((o) => o.trim() && !/selecione/i.test(o));
    test.skip(!firstReal, "Nenhum bairro cadastrado — configure antes.");
    await bairroSelect.selectOption({ label: firstReal! });

    await page.getByRole("button", { name: /confirmar|enviar|whatsapp|finalizar/i }).click();

    await expect
      .poll(() => openedUrls.find((u) => /wa\.me|whatsapp\.com/i.test(u)), { timeout: 15_000 })
      .toBeTruthy();

    const waUrl = openedUrls.find((u) => /wa\.me|whatsapp\.com/i.test(u))!;
    expect(decodeURIComponent(waUrl)).toContain("Cliente Teste E2E");
  });
});