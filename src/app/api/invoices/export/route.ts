import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { listInvoices } from "@/lib/invoices";

export const dynamic = "force-dynamic";

/**
 * CSV export voor boekhouder. Filters: ?year=2026 &company_id=xxx &status=paid
 * Kolommen zijn bewust flat (geen regels) — voor boekhouding volstaat
 * hoofdfactuur-data. Later eventueel ?detail=1 voor per-regel export.
 */
export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  const sp = request.nextUrl.searchParams;
  const year = sp.get("year");
  const company_id = sp.get("company_id") || undefined;
  const rawStatus = sp.get("status");
  const status =
    rawStatus && rawStatus !== "all"
      ? (rawStatus as "draft" | "sent" | "paid" | "overdue" | "cancelled" | "open")
      : undefined;

  let rows = listInvoices({ status, company_id });
  if (year && /^\d{4}$/.test(year)) {
    rows = rows.filter((r) => r.issue_date.startsWith(`${year}-`));
  }

  const header = [
    "number",
    "status",
    "issue_date",
    "due_date",
    "company",
    "client",
    "vat_treatment",
    "subtotal",
    "vat_total",
    "total",
    "currency",
    "reference",
    "sent_at",
    "paid_at",
  ];

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.number,
        r.status,
        r.issue_date,
        r.due_date,
        r.company_name,
        r.client_name,
        r.vat_treatment,
        (r.subtotal_cents / 100).toFixed(2),
        (r.vat_total_cents / 100).toFixed(2),
        (r.total_cents / 100).toFixed(2),
        r.currency,
        r.reference || "",
        r.sent_at ? new Date(r.sent_at).toISOString().slice(0, 10) : "",
        r.paid_at ? new Date(r.paid_at).toISOString().slice(0, 10) : "",
      ]
        .map(escape)
        .join(","),
    ),
  ];

  const csv = lines.join("\n") + "\n";
  const filename = [
    "facturen",
    year || "all",
    company_id || "all",
    status || "all",
  ].join("-") + ".csv";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
