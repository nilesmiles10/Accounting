# Nova Accounting

Standalone boekhoud-app voor `accounting.novactrl.nl`. Afsplitsing van
de monorepo `willem-mission-control` zodat de boekhouding een eigen
deploy/repo/lifecycle heeft.

## Wat zit erin

- Verkoopfacturen + offertes (NL/EN, BTW 21/9/0/EU/Export, Mollie,
  publieke accept/view-links, custom email templates per bedrijf)
- Inkoopfacturen met Claude Vision OCR + Haiku categorisatie + bulk
  drag-drop + camera-scan voor bonnetjes
- Klanten + leveranciers
- Bank-import (CAMT.053 XML + CSV) met auto-match aan facturen
- Dubbele boekhouding (journal/lines, periodes, automatische posting)
- Vaste activa register met lineaire afschrijving
- Rapporten: P&L, balans, BTW-aangifte, ICP-opgave, proefbalans,
  grootboekkaart, aging, integriteit, XAF auditfile export
- Creditnota's, BTW-kwartaal lock, manual journal entries

## Boekhoud-grondregels

Zie `CLAUDE.md` — 12 regels die bij elke wijziging gelden (double-entry,
geen DELETE op geboekte mutaties, periodes dicht, snapshots, etc).

## Lokale ontwikkeling

```bash
npm install
npm run dev    # accounting.localhost:3334
```

`.env` voorbeeld:
```
ANTHROPIC_API_KEY=sk-ant-...
POSTMARK_TOKEN=...
MOLLIE_API_KEY=test_...
SESSION_COOKIE_DOMAIN=.novactrl.nl   # alleen in productie
```

## Deploy

```bash
ssh root@<vps> 'cd /opt/nova-accounting && bash deploy/update.sh'
```

Container `nova-accounting` op port 3334. Caddy/nginx proxy
`accounting.novactrl.nl` → `localhost:3334`.
