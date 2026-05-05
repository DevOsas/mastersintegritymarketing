# Masters Integrity Marketing Customer Retention Revenue Calculator

This is a Node.js and Express app for Masters Integrity Marketing that helps local businesses estimate how much extra revenue they could generate through stronger customer retention, better follow-up, and simple upsell campaigns.

The app:

- Presents a premium calculator form on `index.html`
- Sends submissions to an Express backend
- Validates the data
- Calculates monthly and yearly opportunity
- Generates a branded PDF report with PDFKit
- Emails the report to the user with a provider-based delivery layer
- Can optionally push each new lead into a webhook-based prospect list system
- Redirects successful users to a premium `offer.html` sales page

## Tech stack

- Node.js
- Express
- Nodemailer
- PDFKit
- dotenv
- cors
- express-rate-limit
- Resend Email API support
- Tailwind CDN
- Vanilla JavaScript

## Project files

- `index.html`
- `offer.html`
- `server.js`
- `package.json`
- `.env.example`
- `.gitignore`
- `README.md`

## Setup

1. Install Node.js 18 or newer.
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root using `.env.example`.
4. Add your email and booking values:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
RESEND_API_KEY=
FROM_EMAIL=reports@mastersintegritymarketing.com
BOOKING_LINK=https://your-booking-link.com
```

5. Start the app:

```bash
npm start
```

6. Open:

```text
http://localhost:3000
```

## Environment variables

Required values:

- `EMAIL_PROVIDER`
- `FROM_EMAIL`
- `BOOKING_LINK`

Provider-specific values:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `RESEND_API_KEY`
- `LEAD_SYNC_PROVIDER`
- `LEAD_SYNC_WEBHOOK_URL`

### Email provider modes

Use `EMAIL_PROVIDER=smtp` to send via Nodemailer and a normal SMTP server.

Use `EMAIL_PROVIDER=resend` to send via the Resend Email API.

#### SMTP mode example

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
FROM_EMAIL=reports@mastersintegritymarketing.com
BOOKING_LINK=https://your-booking-link.com
```

#### Resend mode example

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxx
FROM_EMAIL=reports@mastersintegritymarketing.com
BOOKING_LINK=https://your-booking-link.com
```

### Lead sync provider modes

Use `LEAD_SYNC_PROVIDER=none` to disable CRM/list syncing.

Use `LEAD_SYNC_PROVIDER=webhook` to send each lead to any platform that accepts a JSON webhook.

Use `LEAD_SYNC_PROVIDER=clientforce` only as a placeholder for now. Direct Clientforce API support is not wired because their public API details have not been provided yet.

#### Webhook lead sync example

```env
LEAD_SYNC_PROVIDER=webhook
LEAD_SYNC_WEBHOOK_URL=https://your-automation-or-crm-endpoint.com/webhook
```

## How the calculator works

The backend calculates:

- Current monthly revenue
- Current yearly revenue
- Projected yearly revenue
- Extra monthly revenue from retention improvement
- Extra yearly revenue
- Extra monthly upsell revenue
- Total monthly opportunity
- Total yearly opportunity

### Formula notes

- Current yearly revenue = `current customers * current retention rate * average order value * purchase frequency`
- Projected yearly revenue from retention = `current customers * projected retention rate * average order value * purchase frequency`
- Projected yearly upsell and cross-sell revenue = `current customers * projected retention rate * average order value * (upsell % + cross-sell %) * purchase frequency`
- Total yearly opportunity = `projected yearly revenue - current yearly revenue`
- Total monthly opportunity = `total yearly opportunity / 12`

## Email delivery notes

- Email credentials stay on the backend only.
- No SMTP secrets are exposed in frontend JavaScript.
- The server sends the PDF report as an email attachment after a successful calculation.
- The current email providers are `smtp` and `resend`.
- The code is now structured so SendGrid, Mailgun, or Postmark can be added behind the same internal email interface later.

## Lead sync notes

- The current lead sync providers are `none` and `webhook`.
- Webhook mode can be used with Zapier, Make, n8n, Airtable automations, HubSpot workflows, or any CRM intake endpoint that accepts JSON.
- A `clientforce` provider placeholder is included for future direct integration once API details are available.

## Offer page booking link

The CTA buttons on `offer.html` pull the booking URL from the backend using `/api/config`, so you can change the link in `.env` without editing frontend code.

## API endpoints

### `POST /api/calculate`

Accepts:

```json
{
  "businessName": "Blue Dental Studio",
  "contactName": "Jane Owner",
  "email": "jane@example.com",
  "phone": "555-555-5555",
  "businessType": "Dental Clinic",
  "totalCurrentCustomers": 1200,
  "averageOrderValue": 250,
  "purchaseFrequencyPerYear": 3,
  "currentRetentionRate": 35,
  "projectedRetentionRate": 50,
  "upsellPercent": 10,
  "crossSellPercent": 5
}
```

Returns a success response after the PDF is generated and the email is sent.
It also reports whether lead sync ran successfully.

### `GET /api/config`

Returns the public booking link for the offer page CTA buttons.

## Notes

- `express-rate-limit` is included to reduce spam or abuse.
- Static files are served directly by Express from the project root.
- If email delivery fails, the frontend shows a friendly error message instead of redirecting.

