import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface NumberingGap {
  company_id: string;
  company_name: string;
  prefix: string;
  year: string;
  expected_seq: number;
  // null = gat (geen factuur met dit nummer)
  // string = wel een factuur, maar status/datum afwijkend (cancelled?)
  status: "missing" | "cancelled";
}

export interface CompanySeries {
  company_id: string;
  company_name: string;
  prefix: string;
  year: string;
  min_seq: number;
  max_seq: number;
  total: number;     // hoeveel facturen
  cancelled_count: number;
  gaps: NumberingGap[];
}

export interface NumberingReport {
  series: CompanySeries[];
  total_gaps: number;
}

/**
 * Verifieert dat factuurnummers per (company, year) STRIKT sequentieel
 * zijn zonder gaten. Belastingdienst-eis: doorlopende nummering per
 * boekjaar. Gecancelde facturen MOGEN bestaan, maar hun nummer mag
 * niet hergebruikt worden — daarom tonen we ze apart.
 *
 * Gat detecteren: per (prefix, year) pak min en max sequence, en check
 * of elke nummer ertussen voorkomt. Mist er één → gap. Belangrijk om
 * te weten voor je BTW-aangifte; een gat is niet per se fout (kan
 * nooit een factuur zijn geweest), maar is verdacht.
 */
export function checkNumberingIntegrity(): NumberingReport {
  const db = getDb();
  const tenantId = getCurrentTenantId();

  const rows = db
    .prepare(
      `SELECT i.company_id, c.name AS company_name,
              c.invoice_number_prefix AS prefix,
              i.number, i.status, i.issue_date
       FROM invoices i
       JOIN companies c ON c.id = i.company_id
       WHERE i.tenant_id = ?
         AND i.number NOT LIKE 'DRAFT-%'
       ORDER BY i.company_id, i.number`,
    )
    .all(tenantId) as Array<{
    company_id: string;
    company_name: string;
    prefix: string;
    number: string;
    status: string;
    issue_date: string;
  }>;

  // Group by (company_id, year)
  type GroupKey = string;
  interface Group {
    company_id: string;
    company_name: string;
    prefix: string;
    year: string;
    seqs: Map<number, { number: string; status: string }>;
  }
  const groups = new Map<GroupKey, Group>();

  for (const r of rows) {
    // number format: ${prefix}${year}-${seqNumber}
    const after = r.number.slice(r.prefix.length);
    const m = after.match(/^(\d{4})-(\d+)$/);
    if (!m) continue; // legacy / handmatig nummer — skip
    const year = m[1]!;
    const seq = parseInt(m[2]!);
    const key = `${r.company_id}|${year}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        company_id: r.company_id,
        company_name: r.company_name,
        prefix: r.prefix,
        year,
        seqs: new Map(),
      };
      groups.set(key, g);
    }
    g.seqs.set(seq, { number: r.number, status: r.status });
  }

  const series: CompanySeries[] = [];
  let totalGaps = 0;

  for (const g of Array.from(groups.values())) {
    const seqs = (Array.from(g.seqs.keys()) as number[]).sort(
      (a, b) => a - b,
    );
    if (seqs.length === 0) continue;
    const minSeq = seqs[0] as number;
    const maxSeq = seqs[seqs.length - 1] as number;
    let cancelledCount = 0;
    const gaps: NumberingGap[] = [];

    for (let s = minSeq; s <= maxSeq; s++) {
      const found = g.seqs.get(s);
      if (!found) {
        gaps.push({
          company_id: g.company_id,
          company_name: g.company_name,
          prefix: g.prefix,
          year: g.year,
          expected_seq: s,
          status: "missing",
        });
        totalGaps++;
      } else if (found.status === "cancelled") {
        cancelledCount++;
        gaps.push({
          company_id: g.company_id,
          company_name: g.company_name,
          prefix: g.prefix,
          year: g.year,
          expected_seq: s,
          status: "cancelled",
        });
      }
    }

    series.push({
      company_id: g.company_id,
      company_name: g.company_name,
      prefix: g.prefix,
      year: g.year,
      min_seq: minSeq,
      max_seq: maxSeq,
      total: g.seqs.size,
      cancelled_count: cancelledCount,
      gaps,
    });
  }

  series.sort((a, b) =>
    a.company_name === b.company_name
      ? a.year.localeCompare(b.year)
      : a.company_name.localeCompare(b.company_name),
  );

  return { series, total_gaps: totalGaps };
}
