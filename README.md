# UCB Repetitorium — Website & Booking System

Komplettes System für UCB Repetitorium: öffentliche Website mit Direktbuchung (Stripe) und Anfrageformular sowie Admin-Dashboard zur Verwaltung von Buchungen und Anfragen.

## Architektur

```
ucb-repetitorium/
├── site/                  ← Öffentliche Website (Cloudflare Pages Project 1)
│   ├── index.html         Homepage
│   ├── buchen/            Direktbuchung mit Stripe
│   ├── erfolg/            Thank-you-Page nach Zahlung
│   ├── anfrage/           Standalone Anfrage-Formular
│   ├── impressum.html
│   ├── datenschutz.html
│   ├── agb.html
│   ├── widerruf.html
│   ├── favicon/
│   └── _emails/           Email-Templates (gespiegelt aus admin/emails/)
│
└── admin/                 ← Admin-Dashboard + API (Cloudflare Pages Project 2)
    ├── index.html         Login-Page
    ├── dashboard.html     Buchungen + Anfragen verwalten
    ├── functions/         Cloudflare Pages Functions (Backend)
    │   ├── _middleware.js Auth-Guard
    │   └── api/
    │       ├── auth.js              Login/Logout
    │       ├── create-checkout.js   Stripe Checkout Session
    │       ├── stripe-webhook.js    Stripe → Airtable + Mails
    │       ├── submit-lead.js       Anfrage-Endpoint
    │       ├── bookings.js          Read Bookings (auth)
    │       ├── leads.js             Read Leads (auth)
    │       └── leads/[id].js        Update Lead Status
    └── emails/            Email-Templates (Quelle)
```

## Technologie-Stack

- **Hosting**: Cloudflare Pages (statisch + Functions)
- **Payment**: Stripe Checkout
- **Datenbank**: Airtable
- **Mail-Versand**: Resend
- **Domain**: ucb-repetitorium.de (zu registrieren)

## Setup

Komplette Schritt-für-Schritt-Anleitung in **[DEPLOY.md](./DEPLOY.md)**.

Kurz:
1. Domain registrieren
2. GitHub-Repo erstellen, Code pushen
3. Airtable-Base anlegen
4. Stripe-Konto anlegen, Produkt + Preis konfigurieren
5. Resend-Account anlegen, Domain verifizieren
6. Cloudflare Pages — zwei Projekte erstellen, Env-Variablen setzen
7. Stripe-Webhook konfigurieren
8. Live testen

## Environment Variables

Diese Variablen müssen in Cloudflare Pages (Projekt: **admin**) gesetzt werden:

| Variable | Beschreibung |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Secret Key (sk_live_xxx oder sk_test_xxx) |
| `STRIPE_PRICE_KLAUSUREN_AUG26` | Stripe Price ID für den Kurs |
| `STRIPE_WEBHOOK_SECRET` | Webhook Signing Secret (whsec_xxx) |
| `AIRTABLE_API_KEY` | Airtable Personal Access Token |
| `AIRTABLE_BASE_ID` | Airtable Base ID (z.B. appXXX) |
| `AIRTABLE_BOOKINGS_TABLE` | Name der Bookings-Tabelle (z.B. "Bookings") |
| `AIRTABLE_LEADS_TABLE` | Name der Leads-Tabelle (z.B. "Leads") |
| `RESEND_API_KEY` | Resend API Key |
| `ADMIN_EMAIL` | E-Mail für Admin-Benachrichtigungen (z.B. info@ucb-muc.de) |
| `ADMIN_PASSWORD` | Passwort für Admin-Dashboard-Login |
| `AUTH_SECRET` | Random String (32+ Zeichen) für Token-Signierung |
| `PUBLIC_SITE_URL` | https://ucb-repetitorium.de |

## Wichtige Hinweise

- Die **Rechtstexte sind Vorlagen** und sollten anwaltlich geprüft werden bevor das System live geht.
- Die **Email-Templates** liegen in zwei Orten: Quelle ist `admin/emails/`, gespiegelt nach `site/_emails/` damit das Backend sie via HTTP fetchen kann.
- Das **Admin-Dashboard** ist NUR via Cookie-Auth geschützt — empfohlen wird zusätzlich Cloudflare Access als zweite Sicherheitsebene.

## Mail-Flows

| Trigger | Empfänger | Template |
|---|---|---|
| Stripe Payment Success | Kunde | `booking-confirmation.html` |
| Stripe Payment Success | Admin | `internal-booking.html` |
| Anfrage-Submit | Lead | `lead-confirmation.html` |
| Anfrage-Submit | Admin | `internal-lead.html` |

## Lizenz & Eigentümer

UCB - Lohmer Repetitorium UG (haftungsbeschränkt)  
Rotbuchenstr. 1, 81547 München

Entwicklung: [theflori](https://theflori.com)
