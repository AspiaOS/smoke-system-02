// Fonte única de verdade da matriz de permissões por papel.
// Toda checagem no servidor deve consultar esta matriz — nunca comparar `role === 'manager'` no componente.

export type Capability =
  | "dashboard.view"
  | "products.view" | "products.create" | "products.update" | "products.visibility"
  | "categories.view" | "categories.manage"
  | "orders.view" | "orders.create" | "orders.accept" | "orders.cancel"
  | "customers.view" | "customers.update_notes"
  | "sales.view" | "sales.view_cost" | "sales.view_profit"
  | "expenses.view" | "expenses.create" | "expenses.update" | "expenses.delete"
  | "stock.view" | "stock.entry" | "stock.adjust"
  | "shipping.view" | "shipping.manage"
  | "settings.view" | "settings.manage"
  | "audit.view"
  | "members.view" | "members.invite" | "members.change_role" | "members.suspend" | "members.remove"
  | "store.transfer_ownership";

export type MembershipRole = "owner" | "manager" | "seller" | "stock_operator" | "auditor";
export type PlatformRole = "super_admin" | "support_admin" | "security_auditor";

const ALL_STORE: Capability[] = [
  "dashboard.view",
  "products.view", "products.create", "products.update", "products.visibility",
  "categories.view", "categories.manage",
  "orders.view", "orders.create", "orders.accept", "orders.cancel",
  "customers.view", "customers.update_notes",
  "sales.view", "sales.view_cost", "sales.view_profit",
  "expenses.view", "expenses.create", "expenses.update", "expenses.delete",
  "stock.view", "stock.entry", "stock.adjust",
  "shipping.view", "shipping.manage",
  "settings.view", "settings.manage",
  "audit.view",
  "members.view", "members.invite", "members.change_role", "members.suspend", "members.remove",
];

export const STORE_MATRIX: Record<MembershipRole, Capability[]> = {
  owner: [...ALL_STORE, "store.transfer_ownership"],
  manager: ALL_STORE.filter((c) => c !== "members.remove"),
  seller: [
    "dashboard.view",
    "products.view",
    "categories.view",
    "orders.view", "orders.create",
    "customers.view", "customers.update_notes",
    "sales.view",
  ],
  stock_operator: [
    "dashboard.view",
    "products.view",
    "stock.view", "stock.entry", "stock.adjust",
  ],
  auditor: [
    "dashboard.view",
    "products.view", "categories.view",
    "orders.view", "customers.view",
    "sales.view", "sales.view_cost", "sales.view_profit",
    "expenses.view",
    "stock.view",
    "shipping.view",
    "audit.view",
  ],
};

export function roleHasCapability(role: MembershipRole, cap: Capability): boolean {
  return STORE_MATRIX[role]?.includes(cap) ?? false;
}

// Central de Controle — capacidades do platform_admin
export type PlatformCapability =
  | "accounts.view" | "accounts.invite" | "accounts.suspend" | "accounts.reactivate" | "accounts.archive"
  | "memberships.change_role" | "memberships.suspend" | "memberships.remove"
  | "stores.view" | "stores.create" | "stores.suspend" | "stores.reactivate" | "stores.transfer_ownership"
  | "platform_admins.manage"
  | "audit.view";

export const PLATFORM_MATRIX: Record<PlatformRole, PlatformCapability[]> = {
  super_admin: [
    "accounts.view", "accounts.invite", "accounts.suspend", "accounts.reactivate", "accounts.archive",
    "memberships.change_role", "memberships.suspend", "memberships.remove",
    "stores.view", "stores.create", "stores.suspend", "stores.reactivate", "stores.transfer_ownership",
    "platform_admins.manage",
    "audit.view",
  ],
  support_admin: [
    "accounts.view", "accounts.invite", "accounts.suspend", "accounts.reactivate",
    "memberships.change_role", "memberships.suspend",
    "stores.view",
    "audit.view",
  ],
  security_auditor: [
    "accounts.view",
    "stores.view",
    "audit.view",
  ],
};

export function platformRoleHasCapability(role: PlatformRole, cap: PlatformCapability): boolean {
  return PLATFORM_MATRIX[role]?.includes(cap) ?? false;
}
