# AI Agent — Node.js + Express + Claude

A locally deployable AI agent with a chat UI that can manage emails, track bills, and handle follow-up tasks — powered by Claude (claude-sonnet-4-6).

## Features

- **Chat UI** — Single-page vanilla JS interface with conversation history
- **Email management** — Read inbox via IMAP, send emails via SMTP
- **Bill tracking** — Add, list, and mark bills as paid (JSON storage)
- **Follow-up management** — Add, list, and complete follow-up items
- **Agentic loop** — Claude autonomously selects and chains tools to fulfil requests

## Requirements

- Node.js 18+
- npm
- An Anthropic API key
- IMAP/SMTP credentials (optional — only needed for email features)

## Setup

### 1. Install dependencies

```bash
cd /home/user/opennlp/agent
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```
ANTHROPIC_API_KEY=sk-ant-...

# IMAP (for reading email)
EMAIL_USER=you@gmail.com
EMAIL_PASS=your_app_password
EMAIL_HOST=imap.gmail.com
EMAIL_PORT=993

# SMTP (for sending email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

PORT=3000
```

> **Gmail users:** Use an App Password (not your regular password). Enable 2FA, then generate an app password at https://myaccount.google.com/apppasswords

### 3. Start the server

```bash
npm start
```

### 4. Open the UI

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat` | Send a message to the agent |
| GET | `/bills` | List all bills |
| POST | `/bills` | Add a bill |
| PATCH | `/bills/:id` | Update a bill |
| GET | `/followups` | List all follow-ups |
| POST | `/followups` | Add a follow-up |
| PATCH | `/followups/:id` | Update a follow-up |
| GET | `/emails` | Read inbox emails |
| POST | `/emails/send` | Send an email |

### POST /chat

```json
{
  "message": "Show me all pending bills",
  "history": []
}
```

Response:
```json
{
  "response": "Here are your pending bills...",
  "history": [...]
}
```

## File Structure

```
agent/
├── server.js              # Express server + REST routes
├── package.json
├── .env.example
├── data/
│   ├── bills.json         # Bill storage (auto-created)
│   └── followups.json     # Follow-up storage (auto-created)
├── public/
│   └── index.html         # Chat UI
└── src/
    ├── agent.js           # Claude agent with agentic loop
    ├── storage.js         # JSON file read/write helpers
    └── tools/
        ├── emailTools.js  # IMAP + SMTP tool definitions
        ├── billTools.js   # Bill CRUD tool definitions
        └── followupTools.js # Follow-up CRUD tool definitions
```

## Example Prompts

- "Check my emails"
- "Add a bill: electricity $120 due 2026-07-01"
- "Show all pending bills"
- "Mark bill [id] as paid"
- "Add a follow-up: call dentist tomorrow, high priority"
- "Show open follow-ups"
- "Send an email to boss@company.com about the project update"
