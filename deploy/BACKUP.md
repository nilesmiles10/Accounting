# Backup & restore

## Wat backuppen we

Alleen `/app/.data/accounting/accounting.db` — dat is de single source of
truth voor alle boekhouding (invoices, journals, users, sessions,
settings). Andere paden bevatten:

- `/app/.data/accounting/purchase_pdfs/` — geuploade PDF's. Ook belangrijk
  (7-jr bewaarplicht) maar veranderen niet vaak. Aparte cron of handmatig
  rsync — zie onderaan.
- Postmark inbound PDF's, cache-files — kunnen we opnieuw ophalen indien
  nodig; niet mission-critical.

## Techniek

- `scripts/backup.js` draait *binnen* de container en gebruikt SQLite's
  Online Backup API via `better-sqlite3`'s `.backup()`. Atomair,
  WAL-aware, blokkeert writers niet, is safe onder live traffic.
- `scripts/backup.sh` is de host-side wrapper. Kopieert de backup uit de
  docker-volume, gzipt, past retentie toe, en synct optioneel naar een
  rclone remote.
- `scripts/restore.sh` is de restore-helper. Stopt container, verplaatst
  huidige DB naar `.pre-restore-<timestamp>`, decomprimeert backup,
  start container, health-check.

## Installatie op de VPS

Eenmalig na eerste deploy:

```bash
# 1. Zorg dat scripts executable zijn (Dockerfile copy behoudt permissions
#    niet altijd door builder-stages)
ssh root@204.168.175.158 'chmod +x /opt/nova-accounting/scripts/backup.sh /opt/nova-accounting/scripts/restore.sh'

# 2. Log-dir
ssh root@204.168.175.158 'touch /var/log/nova-accounting-backup.log && chmod 644 /var/log/nova-accounting-backup.log'

# 3. Cron entry: dagelijks 03:15 UTC (05:15 NL zomertijd, 04:15 wintertijd)
ssh root@204.168.175.158 '(crontab -l 2>/dev/null | grep -v "backup.sh"; echo "15 3 * * * /opt/nova-accounting/scripts/backup.sh") | crontab -'

# 4. Verifieer
ssh root@204.168.175.158 'crontab -l | grep backup'
```

## Remote sync opzetten (rclone)

Sterk aanbevolen — anders is één VPS-crash = alle backups kwijt.

Opties (alle EU-regio's, allen zonder egress-fees voor restore):

- **Storj DCS** — decentralized, ~$4/TB/mo, geen egress, best value voor kleine DBs
- **Backblaze B2** — ~$6/TB/mo, eerste 10GB gratis, egress vrij tot 3× storage
- **Wasabi** — $6/TB/mo minimum 1TB (overkill voor <1GB backup)
- **AWS S3 Glacier Deep Archive** — $1/TB/mo, retrieval-fees

Voor jouw schaal (paar MB per backup, 30 dagelijks + 12 maandelijks =
~250 MB totaal) is **Storj** of **B2** verreweg goedkoopst. Ik zou Storj
pakken.

### Setup Storj:

```bash
ssh root@204.168.175.158 << 'EOF'
# rclone installeren
curl https://rclone.org/install.sh | bash

# Interactieve setup — kies "s3" → provider "Storj Gateway"
rclone config
# Naam bv: "storj"
# Provider: Storj
# Access key + Secret key uit Storj dashboard
# Endpoint: gateway.storjshare.io
# Region: eu1 (of nl1 als beschikbaar)

# Test
rclone lsd storj:

# Bucket aanmaken
rclone mkdir storj:nova-accounting-backups

# Env voor het backup script
echo 'RCLONE_REMOTE="storj:nova-accounting-backups"' > /etc/nova-accounting-backup.env

# Cron aanpassen om env te sourcen
(crontab -l | grep -v "backup.sh"; echo "15 3 * * * . /etc/nova-accounting-backup.env && /opt/nova-accounting/scripts/backup.sh") | crontab -
EOF
```

### Setup B2 (alternatief):

Zelfde, maar bij `rclone config` kies je "Backblaze B2" als provider.
Krijgt Application Key uit B2 dashboard.

## Handmatige backup nu triggeren

```bash
ssh root@204.168.175.158 '/opt/nova-accounting/scripts/backup.sh'
```

Output landt in `/opt/nova-accounting/backups/daily/`.

## Restore

```bash
ssh root@204.168.175.158 '/opt/nova-accounting/scripts/restore.sh /opt/nova-accounting/backups/daily/accounting-2026-07-01.db.gz'
```

Script vraagt confirmation, bewaart huidige DB als `.pre-restore-<ts>`
voor rollback, doet integrity check, start container, health-check.

## Restore vanaf remote

```bash
# Lijst beschikbare backups op remote
rclone ls storj:nova-accounting-backups/daily/ | sort -r | head

# Pull naar VPS
rclone copy storj:nova-accounting-backups/daily/accounting-2026-06-15.db.gz /tmp/

# Restore
/opt/nova-accounting/scripts/restore.sh /tmp/accounting-2026-06-15.db.gz
```

## Retentie

Instelbaar via env in `/etc/nova-accounting-backup.env`:

```bash
BACKUP_DAILY_RETENTION=30       # dagen dagelijkse backups
BACKUP_MONTHLY_RETENTION=12     # maanden maandelijkse
```

Defaults: 30 dagen + 12 maanden, ~42 backups per bedrijf. Bij ~10 MB per
backup = ~420 MB storage. Ruim binnen alle free tiers.

## Wat NIET (nog) automatisch backupt

- `purchase_pdfs/` — geuploade inkoop-PDF's. **Wettelijk 7 jaar bewaren.**
  Voor nu handmatig meenemen bij een `.data`-rsync:

  ```bash
  ssh root@204.168.175.158 '/var/lib/docker/volumes/nova-accounting_accounting-data/_data/accounting/purchase_pdfs/' | rclone sync ... storj:...
  ```

  Aparte cron aan te zetten als dit vaak wijzigt. Voor lage volumes:
  wekelijkse rsync is voldoende.

- `users.json` / `sessions.json` — zitten in `/app/.data/` maar niet in
  de DB. `sessions.json` is ephemeral (mag verloren gaan). `users.json`
  wel behouden — nu handmatig, TODO: aparte backup opnemen in
  `backup.js`.

## Monitoring

Log staat op `/var/log/nova-accounting-backup.log`. Regel per run:

```
[2026-07-01T03:15:04Z] ===== backup start =====
[2026-07-01T03:15:05Z] container-backup klaar: accounting-20260701-031504.db
[2026-07-01T03:15:06Z] gzip -> /opt/nova-accounting/backups/daily/accounting-2026-07-01.db.gz (2841234 bytes)
[2026-07-01T03:15:07Z] rclone sync -> storj:nova-accounting-backups
[2026-07-01T03:15:09Z] ===== backup ok =====
```

Voor alerts: watchen op ontbrekende "backup ok" van gisteren of "FAIL:"
regels. Simpelste: dagelijks een grep-check via cron + notify.
