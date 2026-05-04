import crypto from "crypto";
import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";
import { post } from "@/lib/ledger/journal";
import { log } from "@/lib/logger";

export type AssetCategory =
  | "inventaris"
  | "machines"
  | "voertuigen"
  | "ict"
  | "overig";

export type AssetStatus = "active" | "fully_depreciated" | "disposed";

export interface Asset {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  name: string;
  description: string | null;
  category: AssetCategory;
  purchase_date: string;
  purchase_amount_cents: number;
  purchase_invoice_id: string | null;
  useful_life_years: number;
  residual_value_cents: number;
  method: string;
  asset_account_code: string;
  depreciation_account_code: string;
  expense_account_code: string;
  status: AssetStatus;
  disposed_date: string | null;
  disposal_amount_cents: number | null;
  created_at: number;
  updated_at: number;
}

export interface AssetWithStats extends Asset {
  total_depreciated_cents: number;
  book_value_cents: number;
  monthly_depreciation_cents: number;
  months_remaining: number;
}

export interface AssetDepreciation {
  id: string;
  asset_id: string;
  period_year: number;
  period_month: number;
  amount_cents: number;
  journal_entry_id: string | null;
  posted_at: number;
}

/** Defaults per categorie — typisch NL fiscaal. User kan overrulen. */
export const CATEGORY_DEFAULTS: Record<
  AssetCategory,
  {
    useful_life_years: number;
    asset_account_code: string;
    depreciation_account_code: string;
    expense_account_code: string;
  }
> = {
  inventaris: {
    useful_life_years: 5,
    asset_account_code: "0500",
    depreciation_account_code: "0501",
    expense_account_code: "4350",
  },
  ict: {
    useful_life_years: 3,
    asset_account_code: "0500", // ICT vaak op inventaris-rekening tot je apart hebt
    depreciation_account_code: "0501",
    expense_account_code: "4350",
  },
  machines: {
    useful_life_years: 7,
    asset_account_code: "0510",
    depreciation_account_code: "0511",
    expense_account_code: "4350",
  },
  voertuigen: {
    useful_life_years: 5,
    asset_account_code: "0520",
    depreciation_account_code: "0521",
    expense_account_code: "4350",
  },
  overig: {
    useful_life_years: 5,
    asset_account_code: "0500",
    depreciation_account_code: "0501",
    expense_account_code: "4350",
  },
};

function lastDayOfMonth(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** Lineaire afschrijving per maand, afgerond op centen. */
export function monthlyDepreciation(asset: {
  purchase_amount_cents: number;
  residual_value_cents: number;
  useful_life_years: number;
}): number {
  const totalMonths = Math.round(asset.useful_life_years * 12);
  if (totalMonths <= 0) return 0;
  const dep =
    (asset.purchase_amount_cents - asset.residual_value_cents) / totalMonths;
  return Math.round(dep);
}

export function listAssets(filter?: {
  status?: AssetStatus;
  company_id?: string | null;
}): AssetWithStats[] {
  const db = getDb();
  const where: string[] = ["a.tenant_id = ?"];
  const params: unknown[] = [getCurrentTenantId()];
  if (filter?.status) {
    where.push("a.status = ?");
    params.push(filter.status);
  }
  if (filter?.company_id) {
    where.push("a.company_id = ?");
    params.push(filter.company_id);
  }
  const rows = db
    .prepare(
      `SELECT a.*,
              COALESCE(SUM(d.amount_cents), 0) AS total_depreciated_cents
       FROM assets a
       LEFT JOIN asset_depreciations d ON d.asset_id = a.id
       WHERE ${where.join(" AND ")}
       GROUP BY a.id
       ORDER BY a.purchase_date DESC`,
    )
    .all(...params) as Array<Asset & { total_depreciated_cents: number }>;

  return rows.map(enrichWithStats);
}

export function getAsset(id: string): AssetWithStats | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT a.*,
              COALESCE(SUM(d.amount_cents), 0) AS total_depreciated_cents
       FROM assets a
       LEFT JOIN asset_depreciations d ON d.asset_id = a.id
       WHERE a.id = ? AND a.tenant_id = ?
       GROUP BY a.id`,
    )
    .get(id, getCurrentTenantId()) as
    | (Asset & { total_depreciated_cents: number })
    | undefined;
  if (!row) return null;
  return enrichWithStats(row);
}

function enrichWithStats(
  row: Asset & { total_depreciated_cents: number },
): AssetWithStats {
  const monthly = monthlyDepreciation(row);
  const bookValue = Math.max(
    row.residual_value_cents,
    row.purchase_amount_cents - row.total_depreciated_cents,
  );
  const remaining =
    monthly > 0 ? Math.ceil((bookValue - row.residual_value_cents) / monthly) : 0;
  return {
    ...row,
    book_value_cents: bookValue,
    monthly_depreciation_cents: monthly,
    months_remaining: Math.max(0, remaining),
  };
}

export interface CreateAssetInput {
  company_id?: string | null;
  code: string;
  name: string;
  description?: string | null;
  category: AssetCategory;
  purchase_date: string;
  purchase_amount_cents: number;
  purchase_invoice_id?: string | null;
  useful_life_years?: number;
  residual_value_cents?: number;
  asset_account_code?: string;
  depreciation_account_code?: string;
  expense_account_code?: string;
}

export function createAsset(input: CreateAssetInput): Asset {
  if (!input.code.trim()) throw new Error("Code is verplicht");
  if (!input.name.trim()) throw new Error("Naam is verplicht");
  if (input.purchase_amount_cents <= 0)
    throw new Error("Aanschafbedrag moet groter zijn dan 0");
  const defaults = CATEGORY_DEFAULTS[input.category];
  if (!defaults) throw new Error(`Onbekende categorie: ${input.category}`);

  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO assets (
       id, tenant_id, company_id, code, name, description, category,
       purchase_date, purchase_amount_cents, purchase_invoice_id,
       useful_life_years, residual_value_cents, method,
       asset_account_code, depreciation_account_code, expense_account_code,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'linear', ?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    getCurrentTenantId(),
    input.company_id ?? null,
    input.code.trim(),
    input.name.trim(),
    input.description ?? null,
    input.category,
    input.purchase_date,
    input.purchase_amount_cents,
    input.purchase_invoice_id ?? null,
    input.useful_life_years ?? defaults.useful_life_years,
    input.residual_value_cents ?? 0,
    input.asset_account_code ?? defaults.asset_account_code,
    input.depreciation_account_code ?? defaults.depreciation_account_code,
    input.expense_account_code ?? defaults.expense_account_code,
    now,
    now,
  );
  return getAsset(id)!;
}

export interface AssetUpdate {
  name?: string;
  description?: string | null;
  useful_life_years?: number;
  residual_value_cents?: number;
}

export function updateAsset(id: string, patch: AssetUpdate): Asset | null {
  const current = getAsset(id);
  if (!current) return null;
  if (current.status !== "active") {
    throw new Error(
      "Alleen actieve activa kunnen bewerkt worden — bij gewijzigde levensduur na afschrijving: maak een nieuwe activum aan",
    );
  }
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    fields.push("name = ?");
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    fields.push("description = ?");
    values.push(patch.description);
  }
  if (patch.useful_life_years !== undefined) {
    if (patch.useful_life_years <= 0)
      throw new Error("Levensduur > 0 jaar");
    fields.push("useful_life_years = ?");
    values.push(patch.useful_life_years);
  }
  if (patch.residual_value_cents !== undefined) {
    fields.push("residual_value_cents = ?");
    values.push(patch.residual_value_cents);
  }
  if (fields.length === 0) return current;
  fields.push("updated_at = ?");
  values.push(Date.now());
  values.push(id);
  getDb()
    .prepare(`UPDATE assets SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
  return getAsset(id);
}

export function listDepreciations(assetId: string): AssetDepreciation[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM asset_depreciations
       WHERE asset_id = ?
       ORDER BY period_year DESC, period_month DESC`,
    )
    .all(assetId) as AssetDepreciation[];
}

/**
 * Boek afschrijving voor 1 maand (Debet 4350 / Credit 0501).
 * Idempotent: als die maand al geboekt is, doet niets.
 */
export function postMonthlyDepreciation(
  assetId: string,
  year: number,
  month: number,
): { ok: boolean; reason?: string; journal_entry_id?: string } {
  const asset = getAsset(assetId);
  if (!asset) return { ok: false, reason: "Asset niet gevonden" };
  if (asset.status !== "active")
    return { ok: false, reason: `Asset status is ${asset.status}` };

  const db = getDb();
  const exists = db
    .prepare(
      `SELECT id FROM asset_depreciations
       WHERE asset_id = ? AND period_year = ? AND period_month = ?`,
    )
    .get(assetId, year, month) as { id: string } | undefined;
  if (exists) return { ok: false, reason: "Maand al geboekt" };

  const monthlyAmount = asset.monthly_depreciation_cents;
  if (monthlyAmount <= 0) return { ok: false, reason: "Maandbedrag is 0" };

  // Cap op resterende boekwaarde - residu zodat we niet onder restwaarde
  // afschrijven (laatste maand kan kleiner zijn).
  const remainingDepreciable =
    asset.purchase_amount_cents -
    asset.total_depreciated_cents -
    asset.residual_value_cents;
  const amount = Math.min(monthlyAmount, remainingDepreciable);
  if (amount <= 0) return { ok: false, reason: "Volledig afgeschreven" };

  const date = lastDayOfMonth(year, month);
  try {
    const entry = post({
      date,
      description: `Afschrijving ${asset.code} ${asset.name} (${year}-${String(month).padStart(2, "0")})`,
      source_type: "manual",
      source_id: asset.id,
      company_id: asset.company_id,
      lines: [
        {
          account_code: asset.expense_account_code,
          description: `Afschrijving ${asset.name}`,
          debit_cents: amount,
        },
        {
          account_code: asset.depreciation_account_code,
          description: `Cum. afschrijving ${asset.name}`,
          credit_cents: amount,
        },
      ],
    });
    db.prepare(
      `INSERT INTO asset_depreciations (id, asset_id, period_year, period_month,
         amount_cents, journal_entry_id, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      asset.id,
      year,
      month,
      amount,
      entry.id,
      Date.now(),
    );

    // Check of asset nu volledig afgeschreven is
    const refreshed = getAsset(asset.id);
    if (
      refreshed &&
      refreshed.book_value_cents <= refreshed.residual_value_cents
    ) {
      db.prepare(
        `UPDATE assets SET status = 'fully_depreciated', updated_at = ? WHERE id = ?`,
      ).run(Date.now(), asset.id);
    }
    return { ok: true, journal_entry_id: entry.id };
  } catch (err) {
    log.error(
      {
        scope: "accounting/assets/depreciation",
        asset_id: assetId,
        period: `${year}-${month}`,
        err: err instanceof Error ? err.message : String(err),
      },
      "depreciation post failed",
    );
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Boeking mislukt",
    };
  }
}

/**
 * Catch-up: boekt alle ontbrekende maand-afschrijvingen vanaf de eerste
 * volledige maand na purchase_date tot de huidige maand. Idempotent.
 *
 * Convention: maand wordt afgeschreven als dat de volledige maand IS.
 * Dus aankoop 15 maart 2026 → eerste afschrijving over april 2026
 * (april heeft 30 hele dagen; we tellen niet pro-rata over halve maand).
 */
export function catchupDepreciation(assetId: string): {
  posted: number;
  skipped: number;
  errors: Array<{ period: string; reason: string }>;
} {
  const asset = getAsset(assetId);
  if (!asset)
    return { posted: 0, skipped: 0, errors: [{ period: "-", reason: "asset niet gevonden" }] };

  const purchaseDate = new Date(asset.purchase_date + "T00:00:00Z");
  // Eerste afschrijvingsmaand = maand NA de aanschafmaand
  let curYear = purchaseDate.getUTCFullYear();
  let curMonth = purchaseDate.getUTCMonth() + 2; // +1 voor 1-based, +1 voor next month
  if (curMonth > 12) {
    curYear += 1;
    curMonth -= 12;
  }

  const today = new Date();
  const endYear = today.getUTCFullYear();
  const endMonth = today.getUTCMonth() + 1;

  let posted = 0;
  let skipped = 0;
  const errors: Array<{ period: string; reason: string }> = [];

  while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
    const r = postMonthlyDepreciation(asset.id, curYear, curMonth);
    if (r.ok) posted++;
    else if (r.reason === "Maand al geboekt") skipped++;
    else if (r.reason === "Volledig afgeschreven") {
      // Stop loop, asset is klaar
      break;
    } else {
      errors.push({
        period: `${curYear}-${String(curMonth).padStart(2, "0")}`,
        reason: r.reason || "onbekend",
      });
    }
    curMonth++;
    if (curMonth > 12) {
      curYear++;
      curMonth = 1;
    }
  }

  return { posted, skipped, errors };
}

/**
 * Run catch-up over álle actieve assets in een tenant. Voor cron-call
 * of dashboard-trigger.
 */
export function catchupAll(): {
  total: number;
  posted: number;
  skipped: number;
} {
  const assets = listAssets({ status: "active" });
  let posted = 0;
  let skipped = 0;
  for (const a of assets) {
    const r = catchupDepreciation(a.id);
    posted += r.posted;
    skipped += r.skipped;
  }
  return { total: assets.length, posted, skipped };
}

/**
 * Verwijder activum. Alleen toegestaan als er nog geen afschrijvingen
 * geboekt zijn (anders is er audit-trail). Bij wel-geboekte
 * afschrijvingen: gebruik dispose.
 */
export function deleteAsset(id: string): { ok: boolean; reason?: string } {
  const db = getDb();
  const depCount = db
    .prepare(
      `SELECT COUNT(*) AS n FROM asset_depreciations WHERE asset_id = ?`,
    )
    .get(id) as { n: number };
  if (depCount.n > 0) {
    return {
      ok: false,
      reason: `${depCount.n} afschrijvingen geboekt — verwijderen kan niet, gebruik 'afstoten' om af te boeken`,
    };
  }
  const res = db
    .prepare(`DELETE FROM assets WHERE id = ? AND tenant_id = ?`)
    .run(id, getCurrentTenantId());
  if (res.changes === 0) return { ok: false, reason: "Niet gevonden" };
  return { ok: true };
}

/**
 * Stoot activum af (verkoop of sloop). Boekt:
 *   - Restant boekwaarde af: Debet 0501 (cum. afschr.) Credit 0500 (kostprijs)
 *   - Verkoopopbrengst: Debet 1100 Bank Credit 9000 (resultaat verkoop)
 *   - Verschil tussen boekwaarde en opbrengst = winst/verlies op buitengewoon
 *
 * Voor MVP: simpele implementatie die de boekwaarde-elimineert en
 * disposal_amount op 9000 boekt. User kan later corrigeren als hij
 * meer detail wil.
 */
export function disposeAsset(input: {
  asset_id: string;
  disposal_date: string;
  disposal_amount_cents: number; // 0 = sloop, > 0 = verkoop
  bank_account_code?: string; // default 1100
}): { ok: boolean; reason?: string; journal_entry_id?: string } {
  const asset = getAsset(input.asset_id);
  if (!asset) return { ok: false, reason: "Asset niet gevonden" };
  if (asset.status === "disposed")
    return { ok: false, reason: "Asset al afgestoten" };

  const bookValue = asset.book_value_cents;
  const proceeds = input.disposal_amount_cents;
  const gainLoss = proceeds - bookValue; // positief = winst, negatief = verlies
  const bankCode = input.bank_account_code || "1100";

  const lines: Parameters<typeof post>[0]["lines"] = [];

  // Boek aanschafwaarde tegen + cum. afschrijving tegen
  // (eliminate the asset from the books)
  lines.push({
    account_code: asset.depreciation_account_code,
    description: `Cum. afschr. afboeken — ${asset.code}`,
    debit_cents: asset.total_depreciated_cents,
  });
  lines.push({
    account_code: asset.asset_account_code,
    description: `Aanschafwaarde afboeken — ${asset.code}`,
    credit_cents: asset.purchase_amount_cents,
  });

  // Verkoopopbrengst
  if (proceeds > 0) {
    lines.push({
      account_code: bankCode,
      description: `Verkoopopbrengst ${asset.code}`,
      debit_cents: proceeds,
    });
  }

  // Saldo balans-effect — verschil moet naar 9000 buitengewoon
  // Math: aanschaf − cum.afschr = boekwaarde. Lines tot nu hebben
  // debit cum + credit aanschaf + debit bank(proceeds).
  // Sum debit = cum + proceeds. Sum credit = aanschaf.
  // Verschil = aanschaf - cum - proceeds = bookValue - proceeds = -gainLoss
  // Als gainLoss > 0 (winst): we hebben meer debet dan credit, moet credit erbij → 9000
  // Als gainLoss < 0 (verlies): meer credit dan debet, moet debet erbij → 9000
  if (gainLoss > 0) {
    // Winst → credit op 9000
    lines.push({
      account_code: "9000",
      description: `Boekwinst verkoop ${asset.code}`,
      credit_cents: gainLoss,
    });
  } else if (gainLoss < 0) {
    // Verlies → debet op 9000
    lines.push({
      account_code: "9000",
      description: `Boekverlies afstoten ${asset.code}`,
      debit_cents: -gainLoss,
    });
  }

  try {
    const entry = post({
      date: input.disposal_date,
      description: `Afstoting ${asset.code} ${asset.name}`,
      source_type: "manual",
      source_id: asset.id,
      company_id: asset.company_id,
      lines,
    });
    const db = getDb();
    db.prepare(
      `UPDATE assets SET status = 'disposed', disposed_date = ?,
         disposal_amount_cents = ?, updated_at = ? WHERE id = ?`,
    ).run(input.disposal_date, proceeds, Date.now(), asset.id);
    return { ok: true, journal_entry_id: entry.id };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Boeking mislukt",
    };
  }
}
