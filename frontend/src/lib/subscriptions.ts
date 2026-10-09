// Local-first subscription store.
//
// All data lives in the browser's localStorage — no backend or auth is
// required, and records persist across sessions. The helpers here are the
// single source of truth for cycle normalization, renewal math and totals so
// the dashboard and the API-shaped backend agree on every figure.

import type { BillingCycle, Subscription } from "./types";

const STORAGE_KEY = "subtrack.subscriptions.v1";

export const CURRENCY = "$";
export const UPCOMING_WINDOW_DAYS = 7;

export const BILLING_CYCLES: BillingCycle[] = ["weekly", "monthly", "yearly"];

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function formatCurrency(value: number): string {
  return `${CURRENCY}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function daysUntil(iso: string): number {
  const target = parseISODate(iso).getTime();
  const today = parseISODate(todayISO()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function formatRenewalDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function isRenewingSoon(sub: Subscription): boolean {
  return daysUntil(sub.next_renewal) <= UPCOMING_WINDOW_DAYS;
}

function addMonths(start: Date, months: number): Date {
  const result = new Date(start.getFullYear(), start.getMonth() + months, 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(start.getDate(), lastDay));
  return result;
}

export function addOneCycle(iso: string, cycle: BillingCycle): string {
  const base = parseISODate(iso);
  if (cycle === "weekly") base.setDate(base.getDate() + 7);
  else if (cycle === "yearly") return toISODate(addMonths(base, 12));
  else return toISODate(addMonths(base, 1));
  return toISODate(base);
}

/** The renewal date after marking a subscription as paid. */
export function nextRenewalAfter(sub: Subscription): string {
  const base = daysUntil(sub.next_renewal) < 0 ? todayISO() : sub.next_renewal;
  return addOneCycle(base, sub.billing_cycle);
}

export function monthlyCost(cost: number, cycle: BillingCycle): number {
  if (cycle === "weekly") return (cost * 52) / 12;
  if (cycle === "yearly") return cost / 12;
  return cost;
}

export function annualCost(cost: number, cycle: BillingCycle): number {
  if (cycle === "weekly") return cost * 52;
  if (cycle === "yearly") return cost;
  return cost * 12;
}

export interface SubscriptionTotals {
  totalMonthly: number;
  totalAnnual: number;
  count: number;
  renewingSoon: number;
}

export function totals(list: Subscription[]): SubscriptionTotals {
  const totalMonthly = list.reduce((sum, s) => sum + monthlyCost(s.cost, s.billing_cycle), 0);
  const totalAnnual = list.reduce((sum, s) => sum + annualCost(s.cost, s.billing_cycle), 0);
  return {
    totalMonthly: Math.round(totalMonthly * 100) / 100,
    totalAnnual: Math.round(totalAnnual * 100) / 100,
    count: list.length,
    renewingSoon: list.filter(isRenewingSoon).length,
  };
}

function isBillingCycle(value: unknown): value is BillingCycle {
  return value === "weekly" || value === "monthly" || value === "yearly";
}

function normalize(raw: unknown): Subscription | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const cost = typeof row.cost === "number" ? row.cost : Number(row.cost);
  const cycle = isBillingCycle(row.billing_cycle) ? row.billing_cycle : "monthly";
  const nextRenewal = typeof row.next_renewal === "string" ? row.next_renewal : "";
  if (!name || !Number.isFinite(cost) || cost <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(nextRenewal)) {
    return null;
  }
  return {
    id: Number(row.id) || 0,
    name,
    cost,
    billing_cycle: cycle,
    next_renewal: nextRenewal,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

export function loadSubscriptions(): Subscription[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalize)
      .filter((row): row is Subscription => row !== null)
      .sort((a, b) => a.next_renewal.localeCompare(b.next_renewal));
  } catch {
    return [];
  }
}

export function saveSubscriptions(list: Subscription[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage can be unavailable (private mode / quota); the in-memory list
    // still works for the current session.
  }
}

export interface SubscriptionInput {
  name: string;
  cost: number;
  billing_cycle: BillingCycle;
  next_renewal: string;
}

export function createSubscription(input: SubscriptionInput): Subscription[] {
  const list = loadSubscriptions();
  const nextId = list.reduce((max, s) => Math.max(max, s.id), 0) + 1;
  const created: Subscription = {
    id: nextId,
    name: input.name.trim(),
    cost: input.cost,
    billing_cycle: input.billing_cycle,
    next_renewal: input.next_renewal,
    created_at: new Date().toISOString(),
  };
  const updated = [...list, created];
  saveSubscriptions(updated);
  return loadSubscriptions();
}

export function updateSubscription(id: number, input: SubscriptionInput): Subscription[] {
  const updated = loadSubscriptions().map((s) =>
    s.id === id
      ? { ...s, name: input.name.trim(), cost: input.cost, billing_cycle: input.billing_cycle, next_renewal: input.next_renewal }
      : s
  );
  saveSubscriptions(updated);
  return loadSubscriptions();
}

export function deleteSubscription(id: number): Subscription[] {
  const updated = loadSubscriptions().filter((s) => s.id !== id);
  saveSubscriptions(updated);
  return loadSubscriptions();
}

export function renewSubscription(id: number): Subscription[] {
  const updated = loadSubscriptions().map((s) =>
    s.id === id ? { ...s, next_renewal: nextRenewalAfter(s) } : s
  );
  saveSubscriptions(updated);
  return loadSubscriptions();
}
