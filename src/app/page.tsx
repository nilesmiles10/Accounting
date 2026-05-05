import Link from "next/link";
import {
  FileText,
  Plus,
  TrendingUp,
  AlertTriangle,
  Download,
  Wallet,
  BookOpen,
  ShoppingBag,
  BarChart3,
  PenSquare,
  ArrowDownToLine,
  ArrowUpFromLine,
  Lock,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { getDb } from "@/lib/db";
import {
  listInvoices,
  markOverdueInvoices,
} from "@/lib/invoices";
import { listPurchaseInvoices } from "@/lib/purchase-invoices";
import { listBankAccounts } from "@/lib/bank/accounts";
import { getStats as getBankStats } from "@/lib/bank/transactions";
import {
  generatePnL,
} from "@/lib/reports/pnl";
import {
  generateDebtorAging,
  generateCreditorAging,
} from "@/lib/reports/aging";
import { generateVatReport, quarterRange } from "@/lib/reports/vat";
import { isQuarterClosed, type Quarter } from "@/lib/ledger/periods";
import { getAccountBalance } from "@/lib/ledger/accounts";
import { formatEUR } from "@/lib/format";
import { getSetting, setSetting } from "@/lib/settings";
import { runQuoteReminders } from "@/lib/email/quoteReminders";
import { runInvoiceReminders } from "@/lib/email/invoiceReminders";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface CountRow {
  n: number;
}

interface CashflowRow {
  in_cents: number | null;
  out_cents: number | null;
}

export default async function AccountingDashboard() {
  const db = getDb();
  const overdueChanged = markOverdueInvoices();
  if (overdueChanged > 0) {
    log.info(
      { scope: "accounting/overdue", changed: overdueChanged },
      "invoices flipped to overdue",
    );
  }

  // Throttled reminder-runner: max 1x per 4 uur bij dashboard-load.
  try {
    const last = getSetting<number>("reminders_last_run", 0);
    const nowMs = Date.now();
    if (nowMs - last > 4 * 3600 * 1000) {
      setSetting("reminders_last_run", nowMs);
      runQuoteReminders().catch((err) =>
        log.error(
          {
            scope: "accounting/reminders-auto",
            err: err instanceof Error ? err.message : String(err),
          },
          "auto quote reminder run failed",
        ),
      );
      runInvoiceReminders().catch((err) =>
        log.error(
          {
            scope: "accounting/reminders-auto",
            err: err instanceof Error ? err.message : String(err),
          },
          "auto invoice reminder run failed",
        ),
      );
    }
  } catch (err) {
    log.error(
      {
        scope: "accounting/reminders-auto",
        err: err instanceof Error ? err.message : String(err),
      },
      "auto reminder scheduler failed",
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const month = new Date().getMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const quarter = Math.ceil(month / 3) as Quarter;

  // ───── KPIs ─────────────────────────────────────────────────────────────
  const pnl = generatePnL(yearStart, today);
  const debtorAging = generateDebtorAging(today);
  const creditorAging = generateCreditorAging(today);
  const vatRange = quarterRange(year, quarter);
  const vat = generateVatReport(vatRange.from, vatRange.to);
  const vatClosed = isQuarterClosed(year, quarter);

  // Bank: per actieve rekening lopend saldo
  const bankAccounts = listBankAccounts({ activeOnly: true });
  const bankBalances = bankAccounts.map((a) => ({
    id: a.id,
    name: a.display_name,
    code: a.account_code,
    balance_cents: getAccountBalance(a.account_code, today),
  }));
  const totalBank = bankBalances.reduce((s, b) => s + b.balance_cents, 0);

  // Cashflow huidige maand (op alle bank-rekeningen samen, via journaal)
  const cashflow = db
    .prepare(
      `SELECT
         SUM(CASE WHEN jl.debit_cents > 0 THEN jl.debit_cents ELSE 0 END) AS in_cents,
         SUM(CASE WHEN jl.credit_cents > 0 THEN jl.credit_cents ELSE 0 END) AS out_cents
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       JOIN chart_of_accounts a ON a.code = jl.account_code AND a.tenant_id = je.tenant_id
       WHERE je.tenant_id = 'default'
         AND je.date BETWEEN ? AND ?
         AND a.code LIKE '11%'`,
    )
    .get(monthStart, today) as CashflowRow;
  const cashIn = cashflow.in_cents || 0;
  const cashOut = cashflow.out_cents || 0;

  // Bank-stats voor unmatched count
  const bankStats = getBankStats();

  // Action items
  const overdueCount = (
    db
      .prepare("SELECT COUNT(*) AS n FROM invoices WHERE status = 'overdue'")
      .get() as CountRow
  ).n;
  const draftPurchaseCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM purchase_invoices WHERE status IN ('draft', 'review')",
      )
      .get() as CountRow
  ).n;
  const reviewableCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM purchase_invoices WHERE status = 'review'",
      )
      .get() as CountRow
  ).n;

  // Outstanding (debiteuren te ontvangen)
  const outstanding = debtorAging.total_cents;
  const toBePaid = creditorAging.total_cents;

  // YTD totals from P&L
  const omzetYtd = pnl.income_total;
  const inkoopYtd = pnl.expenses_total + pnl.cost_of_sales_total;
  const netYtd = pnl.net_profit_cents;

  // Recent activiteit (verkoop + inkoop, gemerged)
  const recentInvoices = listInvoices().slice(0, 5);
  const recentPurchases = listPurchaseInvoices()
    .filter((p) => p.issue_date)
    .slice(0, 5);

  const hasActions =
    overdueCount > 0 ||
    bankStats.unmatched > 0 ||
    reviewableCount > 0 ||
    (vat.to_pay_cents !== 0 && !vatClosed);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Accounting</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Overzicht · YTD {year} · Kwartaal {quarter}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/api/invoices/export?year=${year}`}
            className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            CSV {year}
          </Link>
          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nieuwe factuur
          </Link>
        </div>
      </header>

      {/* ───── Action items (urgentie) ───── */}
      {hasActions && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 space-y-2">
          <p className="text-xs uppercase tracking-wider text-amber-300 font-semibold inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Wat aandacht nodig
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {overdueCount > 0 && (
              <Link
                href="/invoices?status=overdue"
                className="text-red-300 hover:text-red-200 underline"
              >
                {overdueCount} factuur
                {overdueCount === 1 ? "" : "en"} te laat
              </Link>
            )}
            {bankStats.unmatched > 0 && (
              <Link
                href="/bank/transactions?status=unmatched"
                className="text-amber-200 hover:text-amber-100 underline"
              >
                {bankStats.unmatched} bank-transactie
                {bankStats.unmatched === 1 ? "" : "s"} wachten op match
              </Link>
            )}
            {reviewableCount > 0 && (
              <Link
                href="/purchase?status=review"
                className="text-amber-200 hover:text-amber-100 underline"
              >
                {reviewableCount} inkoopfactuur
                {reviewableCount === 1 ? "" : "en"} klaar voor review
              </Link>
            )}
            {!vatClosed && vat.to_pay_cents !== 0 && (
              <Link
                href={`/reports/vat?year=${year}&q=${quarter}`}
                className="text-amber-200 hover:text-amber-100 underline"
              >
                BTW Q{quarter}: {vat.to_pay_cents >= 0 ? "te betalen" : "retour"}{" "}
                {formatEUR(Math.abs(vat.to_pay_cents))}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ───── KPI top-row ───── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Netto resultaat YTD"
          value={formatEUR(netYtd)}
          icon={TrendingUp}
          tone={netYtd >= 0 ? "positive" : "negative"}
          href="/reports/pnl"
          sub={`Omzet − kosten over ${year}`}
        />
        <KpiCard
          label="Omzet YTD"
          value={formatEUR(omzetYtd)}
          icon={ArrowDownToLine}
          tone="neutral"
          href="/reports/pnl"
          sub={`${pnl.income.length} omzet-rekening${pnl.income.length === 1 ? "" : "en"}`}
        />
        <KpiCard
          label="Inkoop YTD"
          value={formatEUR(inkoopYtd)}
          icon={ArrowUpFromLine}
          tone="neutral"
          href="/reports/pnl"
          sub={`Kosten + inkoopwaarde`}
        />
        <KpiCard
          label="Te ontvangen"
          value={formatEUR(outstanding)}
          icon={FileText}
          tone={debtorAging.by_bucket["90+"] > 0 ? "warning" : "neutral"}
          href="/reports/aging"
          sub={`${debtorAging.rows.length} openstaand${debtorAging.rows.length === 1 ? "e factuur" : "e facturen"}`}
        />
      </section>

      {/* ───── Aging strip ───── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Panel
          title="Debiteuren-aging"
          action={
            <Link
              href="/reports/aging"
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Detail →
            </Link>
          }
        >
          <AgingStrip buckets={debtorAging.by_bucket} />
        </Panel>
        <Panel
          title="Crediteuren — te betalen"
          action={
            <Link
              href="/reports/aging"
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Detail →
            </Link>
          }
        >
          {creditorAging.rows.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-2">
              Geen openstaande inkoopfacturen.
            </p>
          ) : (
            <>
              <p className="text-2xl font-bold text-zinc-100 font-mono">
                {formatEUR(toBePaid)}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {creditorAging.rows.length} factuur
                {creditorAging.rows.length === 1 ? "" : "en"}
                {creditorAging.by_bucket["90+"] > 0 &&
                  ` · ${formatEUR(creditorAging.by_bucket["90+"])} > 90 dagen oud`}
              </p>
              <AgingStrip buckets={creditorAging.by_bucket} />
            </>
          )}
        </Panel>
      </section>

      {/* ───── Bank + cashflow ───── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Panel
          title="Bank-saldi"
          action={
            <Link
              href="/bank"
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Bank →
            </Link>
          }
        >
          {bankBalances.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-2">
              Nog geen bank-rekeningen.{" "}
              <Link
                href="/bank"
                className="text-emerald-400 hover:text-emerald-300 underline"
              >
                Voeg er een toe
              </Link>
              .
            </p>
          ) : (
            <>
              <p className="text-2xl font-bold text-zinc-100 font-mono">
                {formatEUR(totalBank)}
              </p>
              <p className="text-[11px] text-zinc-500 mb-3">
                Totaal over {bankBalances.length} rekening
                {bankBalances.length === 1 ? "" : "en"} (peildatum vandaag)
              </p>
              <div className="space-y-1">
                {bankBalances.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-zinc-400 truncate">{b.name}</span>
                    <span
                      className={`font-mono ${
                        b.balance_cents < 0
                          ? "text-red-300"
                          : "text-zinc-200"
                      }`}
                    >
                      {formatEUR(b.balance_cents)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel
          title={`Cashflow — ${monthName(month)} ${year}`}
          action={
            <Link
              href="/journal"
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Journaal →
            </Link>
          }
        >
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                In
              </p>
              <p className="text-base font-mono text-emerald-300 mt-0.5">
                {formatEUR(cashIn)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Uit
              </p>
              <p className="text-base font-mono text-red-300 mt-0.5">
                {formatEUR(cashOut)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Saldo
              </p>
              <p
                className={`text-base font-mono mt-0.5 ${
                  cashIn - cashOut >= 0 ? "text-zinc-100" : "text-red-300"
                }`}
              >
                {formatEUR(cashIn - cashOut)}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-zinc-600 mt-3">
            Mutaties op alle 11xx-rekeningen (bank/PayPal/CC) deze maand
          </p>
        </Panel>
      </section>

      {/* ───── BTW + drafts ───── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Panel
          title={`BTW Q${quarter} ${year}`}
          action={
            <Link
              href={`/reports/vat?year=${year}&q=${quarter}`}
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Aangifte →
            </Link>
          }
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className={`text-2xl font-bold font-mono ${
                  vat.to_pay_cents > 0
                    ? "text-red-300"
                    : vat.to_pay_cents < 0
                      ? "text-emerald-300"
                      : "text-zinc-300"
                }`}
              >
                {vat.to_pay_cents >= 0 ? "" : "-"}
                {formatEUR(Math.abs(vat.to_pay_cents))}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {vat.to_pay_cents > 0
                  ? "Te betalen aan Belastingdienst"
                  : vat.to_pay_cents < 0
                    ? "Te ontvangen van Belastingdienst"
                    : "Geen saldo"}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                vatClosed
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {vatClosed ? (
                <>
                  <Lock className="w-3 h-3" />
                  Ingediend
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3" />
                  Open
                </>
              )}
            </span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-3">
            {vatRange.from} t/m {vatRange.to}
          </p>
        </Panel>

        <Panel
          title="Inkoop-pijplijn"
          action={
            <Link
              href="/purchase"
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Inkoop →
            </Link>
          }
        >
          {draftPurchaseCount === 0 && reviewableCount === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-2">
              Geen openstaande concept-inkoopfacturen.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Drafts
                </p>
                <p className="text-2xl font-bold text-zinc-100 mt-0.5">
                  {draftPurchaseCount}
                </p>
                <p className="text-[11px] text-zinc-600 mt-0.5">
                  PDF&apos;s wachten op invullen
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-amber-300">
                  Klaar voor review
                </p>
                <p className="text-2xl font-bold text-amber-200 mt-0.5">
                  {reviewableCount}
                </p>
                <p className="text-[11px] text-zinc-600 mt-0.5">
                  OCR ingelezen, controleer + keur goed
                </p>
              </div>
            </div>
          )}
        </Panel>
      </section>

      {/* ───── Quick links ───── */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <QuickLink href="/bank" icon={Wallet} label="Bank" />
        <QuickLink
          href="/purchase"
          icon={ShoppingBag}
          label="Inkoop"
        />
        <QuickLink href="/ledger" icon={BookOpen} label="Grootboek" />
        <QuickLink
          href="/journal"
          icon={PenSquare}
          label="Journaal"
        />
        <QuickLink
          href="/reports"
          icon={BarChart3}
          label="Rapportages"
        />
      </section>

      {/* ───── Recente activiteit ───── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Panel
          title="Recente verkoopfacturen"
          action={
            <Link
              href="/invoices"
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Alle →
            </Link>
          }
        >
          {recentInvoices.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">
              Nog geen facturen.{" "}
              <Link
                href="/invoices/new"
                className="text-emerald-400 hover:text-emerald-300"
              >
                Nieuwe factuur
              </Link>
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t border-[var(--border)] first:border-t-0"
                  >
                    <td className="py-2">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-emerald-400 hover:text-emerald-300 font-mono text-xs"
                      >
                        {inv.status === "draft" ? "Concept" : inv.number}
                      </Link>
                    </td>
                    <td className="py-2 text-zinc-400 text-xs truncate max-w-[120px]">
                      {inv.client_name}
                    </td>
                    <td className="py-2 text-right font-mono text-zinc-200 text-xs">
                      {formatEUR(inv.total_cents)}
                    </td>
                    <td className="py-2 text-right">
                      <StatusPill status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel
          title="Recente inkoopfacturen"
          action={
            <Link
              href="/purchase"
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Alle →
            </Link>
          }
        >
          {recentPurchases.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">
              Nog geen inkoopfacturen. Sleep PDF&apos;s op{" "}
              <Link
                href="/purchase"
                className="text-emerald-400 hover:text-emerald-300"
              >
                Inkoop
              </Link>
              .
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {recentPurchases.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-[var(--border)] first:border-t-0"
                  >
                    <td className="py-2">
                      <Link
                        href={`/purchase/${p.id}`}
                        className="text-emerald-400 hover:text-emerald-300 font-mono text-xs"
                      >
                        {p.supplier_invoice_number || "Draft"}
                      </Link>
                    </td>
                    <td className="py-2 text-zinc-400 text-xs truncate max-w-[120px]">
                      {p.supplier_name || "—"}
                    </td>
                    <td className="py-2 text-right font-mono text-zinc-200 text-xs">
                      {formatEUR(p.total_cents)}
                    </td>
                    <td className="py-2 text-right">
                      <PurchaseStatusPill status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </section>
    </div>
  );
}

function monthName(m: number): string {
  return [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
  ][m - 1] || "";
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl py-3 hover:border-emerald-500/40 transition-colors text-zinc-300 hover:text-emerald-300"
    >
      <Icon className="w-4 h-4" />
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  href,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "positive" | "negative" | "warning" | "neutral";
  href: string;
  sub?: string;
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-red-300"
        : tone === "warning"
          ? "text-amber-200"
          : "text-zinc-100";
  return (
    <Link
      href={href}
      className="block bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-emerald-500/40 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
          {label}
        </span>
        <Icon className="w-4 h-4 text-zinc-600" />
      </div>
      <p className={`text-xl font-bold font-mono ${valueClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-600 mt-1">{sub}</p>}
    </Link>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-300">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function AgingStrip({
  buckets,
}: {
  buckets: { current: number; "30": number; "60": number; "90": number; "90+": number };
}) {
  const items: Array<{
    key: keyof typeof buckets;
    label: string;
    tone: "neutral" | "warning" | "danger";
  }> = [
    { key: "current", label: "Nog niet vervallen", tone: "neutral" },
    { key: "30", label: "1-30", tone: "neutral" },
    { key: "60", label: "31-60", tone: "warning" },
    { key: "90", label: "61-90", tone: "warning" },
    { key: "90+", label: "> 90", tone: "danger" },
  ];
  const total = Object.values(buckets).reduce((s, v) => s + v, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-zinc-500 text-center py-2 inline-flex items-center justify-center gap-1.5 w-full">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        Niets openstaand.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 mt-2">
      {items.map((it) => {
        const v = buckets[it.key];
        return (
          <div
            key={it.key}
            className={`rounded-lg px-2 py-1.5 text-center ${
              v === 0
                ? "bg-zinc-900/40 text-zinc-600"
                : it.tone === "danger"
                  ? "bg-red-500/10 text-red-300"
                  : it.tone === "warning"
                    ? "bg-amber-500/10 text-amber-300"
                    : "bg-zinc-800/60 text-zinc-300"
            }`}
          >
            <p className="text-[9px] uppercase tracking-wider opacity-80">
              {it.label}
            </p>
            <p className="text-xs font-mono mt-0.5">{formatEUR(v)}</p>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    draft: { text: "Concept", cls: "bg-zinc-700 text-zinc-300" },
    sent: { text: "Verstuurd", cls: "bg-indigo-500/15 text-indigo-300" },
    paid: { text: "Betaald", cls: "bg-emerald-500/15 text-emerald-300" },
    overdue: { text: "Te laat", cls: "bg-red-500/15 text-red-300" },
    cancelled: { text: "Geannuleerd", cls: "bg-zinc-800 text-zinc-500" },
  };
  const s = map[status] ?? { text: status, cls: "bg-zinc-800" };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.text}
    </span>
  );
}

function PurchaseStatusPill({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    draft: { text: "Concept", cls: "bg-zinc-700 text-zinc-300" },
    review: { text: "Review", cls: "bg-amber-500/15 text-amber-200" },
    approved: { text: "Goedgekeurd", cls: "bg-indigo-500/15 text-indigo-300" },
    paid: { text: "Betaald", cls: "bg-emerald-500/15 text-emerald-300" },
    cancelled: { text: "Geannuleerd", cls: "bg-zinc-800 text-zinc-500" },
  };
  const s = map[status] ?? { text: status, cls: "bg-zinc-800" };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.text}
    </span>
  );
}
