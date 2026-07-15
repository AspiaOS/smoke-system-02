import { useCallback, useEffect, useState } from "react";

const KEY = "smoke:cart:v1";

export type CartItem = {
  variationId: string;
  productId: string;
  productName: string;
  variationName: string;
  image: string | null;
  unitPrice: string; // numeric string in reais, e.g. "24.90"
  quantity: number;
};

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("smoke:cart"));
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(read());
    const sync = () => setItems(read());
    window.addEventListener("smoke:cart", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("smoke:cart", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((item: CartItem) => {
    const current = read();
    const idx = current.findIndex((c) => c.variationId === item.variationId);
    if (idx >= 0) {
      current[idx] = { ...current[idx], quantity: current[idx].quantity + item.quantity };
    } else {
      current.push(item);
    }
    write(current);
  }, []);

  const setQty = useCallback((variationId: string, qty: number) => {
    const current = read();
    const next = current
      .map((c) => (c.variationId === variationId ? { ...c, quantity: qty } : c))
      .filter((c) => c.quantity > 0);
    write(next);
  }, []);

  const remove = useCallback((variationId: string) => {
    write(read().filter((c) => c.variationId !== variationId));
  }, []);

  const clear = useCallback(() => write([]), []);

  const count = items.reduce((n, i) => n + i.quantity, 0);
  const subtotalCents = items.reduce(
    (n, i) => n + Math.round(Number(i.unitPrice) * 100) * i.quantity,
    0,
  );

  return { items, add, setQty, remove, clear, count, subtotalCents };
}
