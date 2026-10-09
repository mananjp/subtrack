"use client";

import { useEffect, useMemo, useState } from "react";
import type { BillingCycle, Subscription } from "@/lib/types";
import {
  BILLING_CYCLES,
  CYCLE_LABELS,
  annualCost,
  createSubscription,
  daysUntil,
  deleteSubscription,
  formatCurrency,
  formatRenewalDate,
  isRenewingSoon,
  loadSubscriptions,
  monthlyCost,
  renewSubscription,
  todayISO,
  totals,
  updateSubscription,
} from "@/lib/subscriptions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";

interface FormState {
  name: string;
  cost: string;
  billing_cycle: BillingCycle;
  next_renewal: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  cost: "",
  billing_cycle: "monthly",
  next_renewal: todayISO(),
};

function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function daysLabel(iso: string): string {
  const diff = daysUntil(iso);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `in ${diff} days`;
}

export default function Dashboard() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setSubs(loadSubscriptions());
    setLoaded(true);
  }, []);

  const summary = useMemo(() => totals(subs), [subs]);

  const visibleSubs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return subs;
    return subs.filter((s) => s.name.toLowerCase().includes(query));
  }, [subs, search]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, next_renewal: todayISO() });
    setEditingId(null);
    setFormError("");
    setMode("add");
  };

  const openEdit = (sub: Subscription) => {
    setForm({
      name: sub.name,
      cost: String(sub.cost),
      billing_cycle: sub.billing_cycle,
      next_renewal: sub.next_renewal,
    });
    setEditingId(sub.id);
    setFormError("");
    setMode("edit");
  };

  const closeDrawer = () => {
    setMode(null);
    setEditingId(null);
    setFormError("");
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const cost = Number(form.cost);
    if (!form.name.trim()) {
      setFormError("Please enter a subscription name.");
      return;
    }
    if (!Number.isFinite(cost) || cost <= 0) {
      setFormError("Please enter a cost greater than zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.next_renewal)) {
      setFormError("Please choose a valid next renewal date.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      cost,
      billing_cycle: form.billing_cycle,
      next_renewal: form.next_renewal,
    };

    if (mode === "edit" && editingId !== null) {
      setSubs(updateSubscription(editingId, payload));
      flash("Subscription updated.");
    } else {
      setSubs(createSubscription(payload));
      flash("Subscription added.");
    }
    closeDrawer();
  };

  const remove = (sub: Subscription) => {
    if (!window.confirm(`Delete "${sub.name}"? This cannot be undone.`)) return;
    setSubs(deleteSubscription(sub.id));
    flash("Subscription deleted.");
  };

  const markRenewed = (sub: Subscription) => {
    setSubs(renewSubscription(sub.id));
    flash(`Advanced "${sub.name}" to its next billing cycle.`);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 md:py-12">
      <div className="mx-auto max-w-6xl">
        {/* Hero header */}
        <div className="animate-in fade-in duration-300">
          <Card className="gap-6 overflow-hidden p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge>SubTrack</Badge>
                  <Badge variant="secondary">Stored in your browser</Badge>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">
                  Subscriptions
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Track every recurring payment in one place and see exactly what you spend.
                  Data is saved locally — no account needed.
                </p>
              </div>

              <Button onClick={openAdd} className="shrink-0">
                <Plus className="h-4 w-4" />
                Add Subscription
              </Button>
            </div>

            {/* Totals summary */}
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-6 lg:grid-cols-4">
              <KpiCard
                label="Monthly spend"
                value={formatCurrency(summary.totalMonthly)}
                hint="Weekly & yearly normalized"
                icon={<Wallet className="h-4 w-4 text-primary" />}
              />
              <KpiCard
                label="Annual spend"
                value={formatCurrency(summary.totalAnnual)}
                hint="Projected for the year"
                icon={<TrendingUp className="h-4 w-4 text-primary" />}
              />
              <KpiCard
                label="Active"
                value={summary.count}
                hint={summary.count === 1 ? "subscription" : "subscriptions"}
                icon={<CreditCard className="h-4 w-4 text-primary" />}
              />
              <KpiCard
                label="Renewing soon"
                value={summary.renewingSoon}
                hint="Within the next 7 days"
                icon={<CalendarClock className="h-4 w-4 text-primary" />}
              />
            </div>
          </Card>
        </div>

        {notice && (
          <div className="mt-4 animate-in fade-in duration-200">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Subscription list */}
        <section className="mt-8 animate-in fade-in duration-300">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Your subscriptions
              </h2>
              <p className="text-xs text-muted-foreground">
                {summary.count} {summary.count === 1 ? "entry" : "entries"} · sorted by next renewal
              </p>
            </div>

            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search subscriptions..."
                aria-label="Search subscriptions"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {!loaded && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          )}

          {loaded && visibleSubs.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <CreditCard className="h-6 w-6 text-muted-foreground" />
                <CardTitle className="text-base">
                  {subs.length === 0 ? "No subscriptions yet" : `No matches for "${search}"`}
                </CardTitle>
                <CardDescription>
                  {subs.length === 0
                    ? "Add your first subscription to start tracking your recurring spend."
                    : "Try a different search term."}
                </CardDescription>
                {subs.length === 0 && (
                  <Button className="mt-2" size="sm" onClick={openAdd}>
                    <Plus className="h-4 w-4" />
                    Add Subscription
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {loaded && visibleSubs.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleSubs.map((sub) => {
                const soon = isRenewingSoon(sub);
                return (
                  <Card
                    key={sub.id}
                    className={`flex h-full flex-col gap-4 transition-colors ${
                      soon ? "border-destructive/60" : "hover:border-primary/50"
                    }`}
                  >
                    <CardHeader className="pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{sub.name}</CardTitle>
                        {soon ? (
                          <Badge variant="destructive" className="shrink-0">
                            {daysLabel(sub.next_renewal)}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">
                            {daysLabel(sub.next_renewal)}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-foreground">
                          {formatCurrency(sub.cost)}
                        </span>
                        <Badge variant="outline">{CYCLE_LABELS[sub.billing_cycle]}</Badge>
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="mt-auto space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          Renews {formatRenewalDate(sub.next_renewal)}
                        </span>
                        <span className="tabular-nums">
                          {formatCurrency(monthlyCost(sub.cost, sub.billing_cycle))}/mo ·{" "}
                          {formatCurrency(annualCost(sub.cost, sub.billing_cycle))}/yr
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                        <Button size="sm" variant="outline" onClick={() => markRenewed(sub)}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Mark renewed
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(sub)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(sub)}
                          className="ml-auto text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Add / Edit drawer */}
      {mode && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            onClick={closeDrawer}
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200"
          />

          <div
            className="relative z-10 w-full max-w-md overflow-y-auto border-l border-border bg-background p-6 shadow-2xl animate-in slide-in-from-right duration-300"
            role="dialog"
            aria-modal="true"
            aria-label={mode === "edit" ? "Edit subscription" : "Add subscription"}
          >
            <div className="flex items-start justify-between gap-2 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {mode === "edit" ? "Edit subscription" : "Add subscription"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {mode === "edit"
                    ? "Update the details for this subscription"
                    : "Track a new recurring payment"}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeDrawer} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Netflix, Spotify, Gym..."
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cost">Cost</Label>
                  <Input
                    id="cost"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.cost}
                    onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="cycle">Billing cycle</Label>
                  <Select
                    value={form.billing_cycle}
                    onValueChange={(value) =>
                      setForm((f) => ({ ...f, billing_cycle: value as BillingCycle }))
                    }
                  >
                    <SelectTrigger id="cycle">
                      <SelectValue placeholder="Select a cycle" />
                    </SelectTrigger>
                    <SelectContent>
                      {BILLING_CYCLES.map((cycle) => (
                        <SelectItem key={cycle} value={cycle}>
                          {CYCLE_LABELS[cycle]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="next_renewal">Next renewal date</Label>
                <Input
                  id="next_renewal"
                  type="date"
                  value={form.next_renewal}
                  onChange={(e) => setForm((f) => ({ ...f, next_renewal: e.target.value }))}
                />
              </div>

              {formError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
                <Button type="button" variant="ghost" onClick={closeDrawer}>
                  Cancel
                </Button>
                <Button type="submit">
                  {mode === "edit" ? "Save changes" : "Add subscription"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
