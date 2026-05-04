# Nova Accounting — Claude session memory

Project: Nova Accounting — standalone Next.js 14 boekhoud-app, eigen
repo afgesplitst van willem-mission-control op 2026-05-04. Deploy:
Docker op Hetzner VPS, domain `accounting.novactrl.nl`, port 3334.

Multi-bedrijf via `companies` (1 tenant: nielsbaars@gmail.com).
Alle queries `tenant_id = 'default'` voor nu — schema is multi-tenant
ready voor toekomstige SaaS-uitbouw.

---

## Boekhoudregels — ALTIJD volgen

Niels wil een professioneel boekhoudsysteem, geen rommel.

1. **Double-entry altijd in balans** — debet=credit, `journal.post()` valideert hard.
2. **Geen DELETE op geboekte mutaties** — correcties via reverse-entry, audit trail blijft.
3. **Afgesloten periodes blijven dicht** — `accounting_periods` check eerbiedigen.
4. **Snapshots bij finalize** — company/client/lines bevriezen; wijziging na verzending = creditnota of nieuwe factuur.
5. **Systeem-rekeningen niet handmatig** — 1xxx bank/debiteuren/BTW, 1600 crediteuren, 1700 BTW alleen via auto-journalisatie. UI verbergt ze bij handmatige pickers.
6. **BTW via `vat_code`, nooit afgeleid uit rekeningnummer.**
7. **Tenant-aware** — elke nieuwe query filtert op `tenant_id` (`getCurrentTenantId()`), geen shortcuts.
8. **Nummering sequentieel zonder gaten** — factuur/journal-nummers per tenant per jaar; Belastingdienst-eis.
9. **Brondocumenten bewaren** — PDF/OCR/e-mail gekoppeld blijven (7-jaar bewaarplicht).
10. **Geld in `_cents` integer**, `formatEUR()` alleen aan UI-rand.
11. **Boekdatum = invoice_date / purchase_date**, niet `Date.now()`.
12. **Eerlijk over gaten** — als iets nog niet via UI kan, expliciet benoemen ipv half-werkend knopje.

Bij afwijking: expliciet melden + reden, niet stil shortcutten.

---

## Git conventies

```
<type>(<scope>): <kort subject ≤72 chars>

<waarom: user-observatie, root cause, business context>

<wat: concrete wijzigingen per file/module>

<scope-grenzen: wat NIET is gewijzigd / bewust overgeslagen>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Types: `feat` `fix` `docs` `chore` `perf` `refactor` `test`.
Scopes: `(invoices)` `(purchase)` `(bank)` `(ledger)` `(reports)` `(assets)` `(ocr)` `(auth)`.

---

## Deploy workflow

```bash
git push origin main
ssh root@<vps> 'cd /opt/nova-accounting && bash deploy/update.sh'
```

`update.sh` bouwt → polt `/api/health` tot 200 (max 60s) → automatische rollback bij failure.

---

## Code conventies

- TypeScript: `noUncheckedIndexedAccess: true` aan, gebruik guards ipv `!`.
- React hooks ALTIJD boven early returns.
- Atomic stores via `@/lib/storage/atomic-store` (`withLock + safeReadJson + atomicWriteJson`).
- Logging via `@/lib/logger` (pino) met `scope`-field.
- Rate-limiters in `@/lib/rate-limit/limiter` (anthropicLimiter etc).
- Currency: `formatEUR()` alleen aan UI-rand, alles intern in cents.

---

## User preferences

- **Taal**: NL voor UI copy. Commit bodies NL of EN.
- **Eerlijke diagnose** voordat fixes worden toegepast — eerst begrip
  van root cause, dan oplossen.
- **Login**: nielsbaars@gmail.com, single user, sessie via cookie
  `nova_accounting_session`.
