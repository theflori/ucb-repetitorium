# Deployment-Anleitung

Komplette Schritt-für-Schritt-Anleitung, um das System live zu schalten. Plane ca. **3–4 Stunden** für den ersten Setup ein.

---

## Schritt 1 — Domain registrieren

**Empfehlung:** `ucb-repetitorium.de`

Anbieter: Namecheap, INWX, IONOS — alle funktionieren. Cloudflare Registrar ist am komfortabelsten weil dann DNS auch direkt da liegt.

Nach Registrierung: Nameservers auf **Cloudflare** umstellen (Cloudflare wird DNS-Provider, weil wir das später für Resend brauchen).

---

## Schritt 2 — GitHub-Repo erstellen

1. Neues Privates Repo erstellen: `github.com/[username]/ucb-repetitorium`
2. Lokal pushen:

```bash
cd ucb-repetitorium
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/[username]/ucb-repetitorium.git
git push -u origin main
```

3. **Wichtig:** Email-Templates für Backend zugänglich machen. Die müssen vom `admin`-Backend als HTTP-Fetch erreichbar sein. Lösung:

```bash
mkdir -p site/_emails
cp admin/emails/*.html site/_emails/
git add site/_emails
git commit -m "Sync email templates to public site"
git push
```

> **Hinweis:** Bei jeder Änderung an `admin/emails/` musst du die Templates erneut nach `site/_emails/` kopieren. Alternativ: Ein Build-Script schreiben oder die Templates inline in den Worker-Code packen (für später).

---

## Schritt 3 — Airtable einrichten

1. Account erstellen auf [airtable.com](https://airtable.com)
2. Neue Base erstellen: **"UCB Repetitorium"**
3. Zwei Tabellen anlegen:

### Tabelle: `Bookings`

Felder:

| Feld | Typ | Hinweis |
|---|---|---|
| Status | Single Select | Optionen: `pending`, `paid`, `expired`, `refunded` |
| Vorname | Single Line Text | |
| Nachname | Single Line Text | |
| Email | Email | |
| Telefon | Phone Number | |
| Uni | Single Line Text | |
| Stand | Single Line Text | |
| Coaching_Themen | Long Text | |
| Adresse | Single Line Text | |
| PLZ | Single Line Text | |
| Stadt | Single Line Text | |
| Land | Single Line Text | |
| Kurs | Single Line Text | |
| Newsletter | Checkbox | |
| Stripe_Session_Id | Single Line Text | |
| Stripe_Payment_Intent | Single Line Text | |
| Stripe_Customer_Id | Single Line Text | |
| Invoice_Url | URL | |
| Amount_Paid | Number | (Euro, 2 Decimals) |
| Created_At | Date (ISO) | |
| Paid_At | Date (ISO) | |
| Expired_At | Date (ISO) | |

### Tabelle: `Leads`

| Feld | Typ | Hinweis |
|---|---|---|
| Status | Single Select | `new`, `contacted`, `booked`, `closed` |
| Examen | Single Select | `1_staatsexamen`, `2_staatsexamen` |
| Vorname | Single Line Text | |
| Nachname | Single Line Text | |
| Email | Email | |
| Telefon | Phone Number | |
| Uni | Single Line Text | |
| Stand | Single Line Text | |
| Nachricht | Long Text | |
| Internal_Notes | Long Text | |
| Created_At | Date (ISO) | |
| Contacted_At | Date (ISO) | |

4. **API-Token erstellen:**
   - airtable.com/create/tokens → "Create new token"
   - Name: `ucb-repetitorium-api`
   - Scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
   - Base: Nur die UCB-Repetitorium Base
   - **Token kopieren** → das ist dein `AIRTABLE_API_KEY`

5. **Base-ID herausfinden:** Öffne die Base, schaue in die URL: `https://airtable.com/appXXXXXXX/...` — das `appXXXXXXX` ist die `AIRTABLE_BASE_ID`.

---

## Schritt 4 — Stripe einrichten

1. Account erstellen auf [stripe.com](https://stripe.com)
2. Business-Profil ausfüllen (USt-ID, Adresse, Bankverbindung)
3. **Erst im Test-Mode arbeiten** (Toggle oben rechts)

### Produkt anlegen

1. Stripe Dashboard → **Products** → **Add product**
2. Name: `Klausurentraining Bad Aibling August 2026`
3. Preis: **1.290,00 €**, Type: `One-time`, **Tax Behavior: "Exempt"**
4. Nach dem Speichern: **Preis-ID kopieren** (`price_xxx`) → das ist dein `STRIPE_PRICE_KLAUSUREN_AUG26`

### API-Keys

Dashboard → **Developers** → **API keys**
- `Secret key` kopieren → `STRIPE_SECRET_KEY` (im Test-Mode beginnt mit `sk_test_`)
- (Für später für Live: später nochmal mit `sk_live_` ersetzen)

### Rechnungseinstellungen

Settings → **Branding**:
- Logo hochladen (UCB-Logo)
- Brand-Farbe: `#421D1D`
- Akzentfarbe: `#F0B66B`

Settings → **Invoice template**:
- Footer-Text: `Bildungsleistung umsatzsteuerfrei nach § 4 Nr. 21 UStG.`
- "Send invoice automatically" aktivieren

### Webhook (kommt später, nach Cloudflare Setup)

Erst nach Cloudflare-Deployment: Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**:
- URL: `https://admin.ucb-repetitorium.de/api/stripe-webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`
- Nach Erstellung: **Signing Secret** kopieren (`whsec_xxx`) → `STRIPE_WEBHOOK_SECRET`

---

## Schritt 5 — Resend einrichten

1. Account erstellen auf [resend.com](https://resend.com)
2. **Domain hinzufügen**: `ucb-repetitorium.de`
3. Resend zeigt 3 DNS-Records (SPF, DKIM, DMARC) → diese in Cloudflare DNS hinzufügen
4. Warten bis Verifizierung durchläuft (5–15 Minuten)
5. **API-Key erstellen** → `RESEND_API_KEY`

### From-Adressen

Diese Absender werden im Code verwendet:
- `noreply@ucb-repetitorium.de` (Transaktional)
- Reply-To: `info@ucb-muc.de`

Stelle sicher, dass `info@ucb-muc.de` als Inbox existiert und Mails empfängt.

---

## Schritt 6 — Cloudflare Pages: Site (öffentlich)

1. Cloudflare Dashboard → **Pages** → **Create a project** → **Connect to Git**
2. GitHub Repo auswählen: `ucb-repetitorium`
3. Projekt-Name: **`ucb-site`**
4. Build-Einstellungen:
   - Production branch: `main`
   - Build command: *(leer lassen)*
   - Build output directory: **`site`**
5. Deploy

### Custom Domain

Nach erfolgreichem Deploy:
1. Pages → `ucb-site` → **Custom domains** → **Set up a custom domain**
2. Domain: `ucb-repetitorium.de`
3. Auch `www.ucb-repetitorium.de` hinzufügen, auf Apex umleiten

---

## Schritt 7 — Cloudflare Pages: Admin (Dashboard + API)

1. Pages → **Create a project** → **Connect to Git**
2. Gleiches Repo: `ucb-repetitorium`
3. Projekt-Name: **`ucb-admin`**
4. Build-Einstellungen:
   - Production branch: `main`
   - Build command: *(leer)*
   - Build output directory: **`admin`**
5. Deploy

### Environment Variables setzen

Pages → `ucb-admin` → **Settings** → **Environment variables** → Add für **Production**:

```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PRICE_KLAUSUREN_AUG26=price_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx  (kommt in Schritt 8)
AIRTABLE_API_KEY=patxxx
AIRTABLE_BASE_ID=appXXX
AIRTABLE_BOOKINGS_TABLE=Bookings
AIRTABLE_LEADS_TABLE=Leads
RESEND_API_KEY=re_xxx
ADMIN_EMAIL=info@ucb-muc.de
ADMIN_PASSWORD=[STARKES PASSWORT GENERIEREN]
AUTH_SECRET=[64-CHAR-RANDOM-STRING — z.B. via `openssl rand -hex 32`]
PUBLIC_SITE_URL=https://ucb-repetitorium.de
```

Nach dem Setzen: **Re-deploy** triggern (sonst werden die Variablen nicht übernommen).

### Custom Domain für Admin

Pages → `ucb-admin` → **Custom domains** → `admin.ucb-repetitorium.de` hinzufügen.

### Zusätzliche Sicherheit (empfohlen)

Cloudflare → **Zero Trust** → **Access** → **Applications** → Application für `admin.ucb-repetitorium.de` erstellen mit Email-OTP-Schutz. Das ist eine zweite Sicherheitsebene zusätzlich zum Passwort.

---

## Schritt 8 — Stripe Webhook konfigurieren

Jetzt wo Admin-Backend live ist:

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. URL: `https://admin.ucb-repetitorium.de/api/stripe-webhook`
3. Events:
   - `checkout.session.completed`
   - `checkout.session.expired`
4. Nach Erstellung: **Signing Secret** klicken → kopieren
5. In Cloudflare Pages → `ucb-admin` → Environment Variables: `STRIPE_WEBHOOK_SECRET` aktualisieren
6. Re-deploy

---

## Schritt 9 — Frontend Backend-URLs anpassen

Im Code stehen die Backend-Calls auf `https://admin.ucb-repetitorium.de`. Falls deine Domain anders ist, in folgenden Dateien anpassen:

- `site/buchen/index.html` → `fetch('https://admin.ucb-repetitorium.de/api/create-checkout', ...)`
- `site/anfrage/index.html` → `fetch('https://admin.ucb-repetitorium.de/api/submit-lead', ...)`
- `site/index.html` → an entsprechender Stelle, falls Anfrage-Form direkt eingebaut

---

## Schritt 10 — Testen

### Test-Buchung

1. Im Stripe-Dashboard im **Test-Mode** bleiben
2. Browser → `https://ucb-repetitorium.de/buchen/`
3. Formular ausfüllen
4. Bei Stripe Checkout: Test-Karte verwenden:
   - Karte: `4242 4242 4242 4242`
   - Datum: beliebig in Zukunft
   - CVC: beliebig
5. Nach Zahlung sollte:
   - Du zur Erfolg-Page kommen
   - Eine Buchungs-Bestätigung per Mail bekommen (Empfänger-Mail)
   - Eine interne Mail an `info@ucb-muc.de` kommen
   - In Airtable: neuer Datensatz mit Status `paid`
   - Im Admin-Dashboard: Buchung sichtbar

### Test-Anfrage

1. `https://ucb-repetitorium.de` → unten zum Anfrage-Form scrollen
2. Formular ausfüllen, abschicken
3. Sollte:
   - Bestätigungs-Mail an Lead-Empfänger
   - Interne Mail an `info@ucb-muc.de`
   - Eintrag in Airtable Leads-Tabelle
   - Im Dashboard sichtbar

### Test Admin-Dashboard

1. `https://admin.ucb-repetitorium.de`
2. Passwort eingeben (das aus `ADMIN_PASSWORD`)
3. Buchungen + Anfragen sehen
4. Bei Anfragen: "Kontaktiert" markieren testen

---

## Schritt 11 — Live gehen

Wenn alles im Test-Mode funktioniert:

1. **Stripe Live aktivieren** (echte Geschäftsverifikation erforderlich, kann 1–3 Tage dauern)
2. `STRIPE_SECRET_KEY` und `STRIPE_PRICE_KLAUSUREN_AUG26` auf Live-Werte umstellen
3. Neuen Webhook im **Live-Mode** erstellen → `STRIPE_WEBHOOK_SECRET` updaten
4. Re-deploy
5. Mit kleiner Test-Buchung über deine eigene Karte abschließend testen
6. **Achtung:** Im Live-Mode entstehen echte Gebühren, ggf. kleine Test-Transaktion direkt wieder erstatten

---

## Wartung & Updates

- **Code-Änderungen**: Einfach in GitHub pushen → Cloudflare deployed automatisch
- **Email-Templates editieren**: `admin/emails/[name].html` ändern → nach `site/_emails/` kopieren → pushen
- **Neuer Kurs/Preis**: Stripe Dashboard → neues Produkt → Price-ID kopieren → in Cloudflare Env-Variable updaten
- **Stripe-Logs prüfen**: Stripe Dashboard → Developers → Logs
- **Airtable als Backup**: Regelmäßig CSV-Export der Bookings-Tabelle

---

## Troubleshooting

**Stripe-Webhook funktioniert nicht?**
- Stripe Dashboard → Webhooks → Endpoint anklicken → Failed attempts ansehen
- Häufig: `STRIPE_WEBHOOK_SECRET` falsch gesetzt → exakt aus Webhook-Detail-Page kopieren

**Mails kommen nicht an?**
- Resend Dashboard → Logs prüfen
- DNS-Records nochmal verifizieren (SPF, DKIM, DMARC)
- Spam-Folder checken
- Sender-Adresse muss auf verifizierter Domain liegen

**Admin-Login schlägt fehl?**
- `ADMIN_PASSWORD` exakt prüfen (Case-Sensitive)
- Browser-Cookies löschen, neu versuchen
- Cloudflare Pages Logs prüfen

**Buchung bleibt auf "pending" in Airtable?**
- Stripe-Webhook hat den Event nicht erreicht
- Webhook-URL korrekt? `STRIPE_WEBHOOK_SECRET` korrekt?

---

## Kontakt bei Problemen

Falls du Hilfe brauchst, hier sind die wichtigsten Links zu den Plattformen:

- Cloudflare Pages Docs: https://developers.cloudflare.com/pages/
- Stripe Docs: https://stripe.com/docs/api
- Airtable API: https://airtable.com/developers/web/api/introduction
- Resend Docs: https://resend.com/docs

Bei Code-Fragen → ich (Claude) bin Ansprechpartner.
