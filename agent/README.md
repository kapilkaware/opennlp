# AI Personal Assistant

A locally deployable Node.js + Express agent powered by Claude. Manages emails, bills, and follow-ups via a chat UI.

## Features

- **Chat** — conversational interface backed by Claude with tool use
- **Email** — read recent emails (IMAP) and send replies (SMTP/nodemailer)
- **Bills** — add, list, and mark bills as paid (stored locally in JSON)
- **Follow-ups** — create, list, and complete follow-up tasks

## Setup

### 1. Install dependencies

```bash
cd agent
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...

# Gmail IMAP (enable "App Passwords" in Google Account settings)
EMAIL_USER=you@gmail.com
EMAIL_PASS=your_app_password
EMAIL_HOST=imap.gmail.com
EMAIL_PORT=993

# Gmail SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

PORT=3000
```

> For Gmail, generate an [App Password](https://myaccount.google.com/apppasswords) — your regular password won't work with IMAP/SMTP.
> For Outlook, use `imap-mail.outlook.com` (IMAP) and `smtp-mail.outlook.com` (SMTP).

### 3. Run

```bash
npm start
```

Open **http://localhost:3000** in your browser.

## REST API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat` | Send a message: `{ message, history[] }` |
| GET | `/bills` | List all bills |
| POST | `/bills` | Add a bill: `{ name, amount, due_date, category }` |
| PATCH | `/bills/:id` | Update a bill |
| GET | `/followups` | List all follow-ups |
| POST | `/followups` | Add a follow-up: `{ title, due_date, description, priority }` |
| PATCH | `/followups/:id` | Update a follow-up |
| GET | `/emails` | Fetch recent emails via IMAP |
| POST | `/emails/send` | Send an email: `{ to, subject, body }` |

## Data storage

Bills and follow-ups are persisted as JSON files in `agent/data/`:
- `data/bills.json`
- `data/followups.json`
