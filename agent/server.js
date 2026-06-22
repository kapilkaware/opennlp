require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const Agent = require('./src/agent');
const { readBills, writeBills, readFollowups, writeFollowups } = require('./src/storage');
const emailHandlers = require('./src/tools/emailTools').handlers;
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let agent = null;

function getAgent() {
  if (!agent) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return null;
    }
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    agent = new Agent(client);
  }
  return agent;
}

// ─── Chat ───────────────────────────────────────────────────────────────────

app.post('/chat', async (req, res) => {
  try {
    const a = getAgent();
    if (!a) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set. Please configure it in your .env file.' });
    }
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    const result = await a.chat(message, history);
    res.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Bills ───────────────────────────────────────────────────────────────────

app.get('/bills', (req, res) => {
  try {
    const bills = readBills();
    res.json(bills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/bills', (req, res) => {
  try {
    const { name, amount, due_date, category } = req.body;
    if (!name || amount == null || !due_date) {
      return res.status(400).json({ error: 'name, amount, and due_date are required' });
    }
    const bills = readBills();
    const bill = { id: uuidv4(), name, amount, due_date, status: 'pending', category: category || 'general' };
    bills.push(bill);
    writeBills(bills);
    res.status(201).json(bill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/bills/:id', (req, res) => {
  try {
    const bills = readBills();
    const idx = bills.findIndex((b) => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Bill not found' });
    bills[idx] = { ...bills[idx], ...req.body };
    writeBills(bills);
    res.json(bills[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Follow-ups ───────────────────────────────────────────────────────────────

app.get('/followups', (req, res) => {
  try {
    const followups = readFollowups();
    res.json(followups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/followups', (req, res) => {
  try {
    const { title, description, due_date, priority } = req.body;
    if (!title || !due_date) {
      return res.status(400).json({ error: 'title and due_date are required' });
    }
    const followups = readFollowups();
    const followup = { id: uuidv4(), title, description: description || '', due_date, status: 'open', priority: priority || 'medium' };
    followups.push(followup);
    writeFollowups(followups);
    res.status(201).json(followup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/followups/:id', (req, res) => {
  try {
    const followups = readFollowups();
    const idx = followups.findIndex((f) => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Follow-up not found' });
    followups[idx] = { ...followups[idx], ...req.body };
    writeFollowups(followups);
    res.json(followups[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Emails ───────────────────────────────────────────────────────────────────

app.get('/emails', async (req, res) => {
  try {
    const emails = await emailHandlers.read_emails({});
    res.json(emails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/emails/send', async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }
    const result = await emailHandlers.send_email({ to, subject, body });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Agent server running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY is not set. Chat functionality will not work.');
  }
});

module.exports = app;
