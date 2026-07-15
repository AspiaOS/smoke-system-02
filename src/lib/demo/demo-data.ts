// Determinístico: mesmo seed produz o mesmo lote demo.
// PRNG mulberry32 — sem dependência.

export const DEMO_SEED = 20260715;
export const DEMO_VERSION = "1.0.0";
export const DEMO_TAG = "smoke-demo";
export const BANNER_URLS = ["/demo/banner-01.svg", "/demo/banner-02.svg", "/demo/banner-03.svg"];
export const PRODUCT_IMG = "/demo/product.svg";

// -------------------- PRNG determinístico --------------------
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed = DEMO_SEED) {
  const r = mulberry32(seed);
  return {
    next: r,
    int: (min: number, max: number) => Math.floor(r() * (max - min + 1)) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)],
    weighted: <T,>(arr: readonly { v: T; w: number }[]): T => {
      const total = arr.reduce((s, x) => s + x.w, 0);
      let k = r() * total;
      for (const it of arr) {
        k -= it.w;
        if (k <= 0) return it.v;
      }
      return arr[arr.length - 1].v;
    },
    shuffle: <T,>(arr: readonly T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

// -------------------- Catálogos --------------------
export type Profile = "small" | "full";

export const PROFILE_SIZES = {
  small: {
    categories: 6,
    products: 12,
    neighborhoods: 6,
    orders: 30,
    expenses: 15,
    // Quotas somam = orders
    orders_accepted: 21,
    orders_pending: 5,
    orders_cancelled: 4,
    // Clientes sumidos: aceites antigos (>60d) com telefone dedicado
    sumidos: 3,
  },
  full: {
    categories: 8,
    products: 40,
    neighborhoods: 12,
    orders: 120,
    expenses: 60,
    orders_accepted: 84,
    orders_pending: 18,
    orders_cancelled: 18,
    sumidos: 5,
  },
} as const;


export const CATEGORY_NAMES = [
  { name: "Dispositivos", active: true },
  { name: "Essências", active: true },
  { name: "Acessórios", active: true },
  { name: "Kits", active: true },
  { name: "Edições especiais", active: true },
  { name: "Utilidades", active: true },
  { name: "Novidades", active: true }, // ativa mas sem produtos visíveis
  { name: "Arquivados", active: false }, // inativa com produtos
] as const;

export const PRODUCT_NAMES = [
  "Elfbar 40k", "Elfbar 10k", "Ignite V150", "Ignite Plus", "Lost Mary 5k",
  "Vozol Gear", "Oxbar Magic", "Randm Tornado", "Fumot Digital", "Lost Vape",
  "Aroma Menta", "Aroma Frutas", "Aroma Ice", "Kit Iniciante", "Kit Recarregável",
  "Carregador USB-C", "Case Premium", "Cordão de silicone", "Bateria extra",
  "Coil substituta", "Pod Descartável", "Vaporizador Compacto", "Cigarro Eletrônico X",
  "Mod Avançado Y", "Atomizador Z", "Refil de essência", "Bico personalizado",
  "Suporte de mesa", "Bolsa térmica", "Lanterna clip", "Cinzeiro portátil",
  "Adaptador universal", "Kit limpeza", "Filtro extra", "Cabo trançado",
  "Bateria 18650", "Case dupla", "Suporte veicular", "Chaveiro Smoke", "Adesivo pack",
] as const;

export const BRANDS = ["Elfbar", "Ignite", "Lost Mary", "Vozol", "Oxbar", "Randm", null] as const;

export const PRODUCT_DESCRIPTIONS = [
  "Design compacto e potente para o dia a dia.",
  "Sabor limpo e duradouro, direto ao ponto.",
  "Autonomia estendida — feito para durar.",
  "Edição especial disponível por tempo limitado.",
  "Acabamento premium e sensação suave.",
] as const;

export const VARIATION_FLAVORS = [
  "Menta", "Uva", "Melancia", "Morango", "Manga",
  "Blueberry", "Ice", "Coco", "Frutas Vermelhas", "Tabaco",
  "Kiwi", "Maracujá", "Abacaxi",
] as const;

export const NEIGHBORHOODS = [
  { name: "Centro", fee: 5 },
  { name: "Zona Norte", fee: 8 },
  { name: "Zona Sul", fee: 8 },
  { name: "Zona Leste", fee: 10 },
  { name: "Jardim América", fee: 12 },
  { name: "Vila Nova", fee: 6 },
  { name: "Bela Vista", fee: 7 },
  { name: "Industrial", fee: 15 },
  { name: "Santa Clara", fee: 0 }, // frete grátis
  { name: "Parque Central", fee: 10 },
  { name: "Nova Esperança", fee: 18 },
  { name: "Alto do Morro", fee: 25 }, // frete mais alto
] as const;

// Bairros marcados como inativos (por índice)
export const NEIGHBORHOODS_INACTIVE_INDEXES = [10]; // "Nova Esperança"

export const FIRST_NAMES = [
  "Ana", "Bruno", "Carla", "Daniel", "Eduarda", "Felipe", "Gabriela",
  "Henrique", "Isadora", "João", "Karina", "Lucas", "Mariana", "Nicolas",
  "Olívia", "Pedro", "Rafaela", "Sérgio", "Tainá", "Vinícius", "Yasmin",
  "Renato", "Beatriz", "Diego", "Larissa",
] as const;

export const LAST_NAMES = [
  "Silva", "Souza", "Oliveira", "Santos", "Pereira", "Costa", "Ferreira",
  "Almeida", "Rodrigues", "Martins", "Barbosa", "Ribeiro", "Carvalho",
  "Gomes", "Araújo", "Lima", "Melo", "Rocha", "Dias", "Nogueira",
] as const;

export const STREETS = [
  "Rua das Flores", "Av. Paulista", "Rua do Comércio", "Av. Brasil",
  "Rua XV de Novembro", "Rua Sete de Setembro", "Alameda Santos",
  "Rua Direita", "Rua da Praia", "Av. Beira Rio",
] as const;

export const EXPENSE_CATEGORIES = [
  "Mercadoria", "Embalagens", "Frete", "Taxas", "Marketing",
  "Manutenção", "Aluguel", "Energia", "Internet", "Geral",
] as const;

export const EXPENSE_DESCRIPTIONS: Record<string, readonly string[]> = {
  Mercadoria: ["Reposição semanal fornecedor A", "Compra de lote extra", "Pedido urgente"],
  Embalagens: ["Sacolas kraft 500un", "Fita adesiva", "Etiquetas personalizadas"],
  Frete: ["Frete fornecedor", "Motoboy", "Entrega expressa"],
  Taxas: ["Taxa da maquininha", "Taxa bancária"],
  Marketing: ["Impulsionamento Instagram", "Panfletagem", "Brindes"],
  Manutenção: ["Manutenção da loja", "Conserto de balcão"],
  Aluguel: ["Aluguel do ponto"],
  Energia: ["Conta de luz"],
  Internet: ["Assinatura internet fibra"],
  Geral: ["Café e utilidades", "Limpeza"],
};

export const CANCEL_REASONS = [
  "Cliente desistiu",
  "Endereço fora da área",
  "Produto não estava mais disponível",
  "Pedido duplicado",
  "Cliente não confirmou",
] as const;

export const STOCK_ADJUST_NOTES = [
  "Contagem física",
  "Unidade danificada",
  "Correção de inventário",
  "Ajuste após conferência",
] as const;

export const STOCK_ENTRY_NOTES = [
  "Reposição semanal",
  "Entrada de fornecedor",
  "Compra emergencial",
] as const;

export const PAYMENT_METHODS = ["pix", "cash", "debit", "credit"] as const;

// -------------------- Telefones fictícios reservados p/ teste --------------------
// Bloco 55 11 9xxxx-0000+ é seguro para uso interno; usamos 55 11 91234-0000..
export function makeTestPhone(seed: number): string {
  const base = 91234_0000 + seed;
  return `55${11}${base}`;
}
