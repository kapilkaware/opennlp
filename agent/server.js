'use strict';
// Load .env manually — no dotenv package
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

// ─── .env loader ──────────────────────────────────────────────────────────────
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
})();

const Agent = require('./src/agent');
const { readBills, writeBills, readFollowups, writeFollowups } = require('./src/storage');
const emailHandlers = require('./src/tools/emailTools').handlers;

// Lazy singleton agent
let agentInstance = null;
function getAgent() {
  if (!agentInstance) agentInstance = new Agent();
  return agentInstance;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, statusCode, data) {
  setCORS(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    json(res, 404, { error: 'Not found' });
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';

  const content = fs.readFileSync(filePath);
  setCORS(res);
  res.writeHead(200, { 'Content-Type': mime });
  res.end(content);
}

// ─── Router ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const method = req.method.toUpperCase();

  // Preflight CORS
  if (method === 'OPTIONS') {
    setCORS(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // ── POST /chat ────────────────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/chat') {
      const { message, history = [] } = await parseBody(req);
      if (!message) return json(res, 400, { error: 'message is required' });
      if (!process.env.ANTHROPIC_API_KEY) {
        return json(res, 500, { error: 'ANTHROPIC_API_KEY is not set. Please configure it in your .env file.' });
      }
      const result = await getAgent().chat(message, history);
      return json(res, 200, result);
    }

    // ── GET /bills ────────────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/bills') {
      return json(res, 200, readBills());
    }

    // ── POST /bills ───────────────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/bills') {
      const { name, amount, due_date, category } = await parseBody(req);
      if (!name || amount == null || !due_date) {
        return json(res, 400, { error: 'name, amount, and due_date are required' });
      }
      const bills = readBills();
      const bill = { id: crypto.randomUUID(), name, amount, due_date, status: 'pending', category: category || 'general' };
      bills.push(bill);
      writeBills(bills);
      return json(res, 201, bill);
    }

    // ── PATCH /bills/:id ──────────────────────────────────────────────────────
    const billPatchMatch = pathname.match(/^\/bills\/([^/]+)$/);
    if (method === 'PATCH' && billPatchMatch) {
      const id = billPatchMatch[1];
      const body = await parseBody(req);
      const bills = readBills();
      const idx = bills.findIndex((b) => b.id === id);
      if (idx === -1) return json(res, 404, { error: 'Bill not found' });
      bills[idx] = { ...bills[idx], ...body };
      writeBills(bills);
      return json(res, 200, bills[idx]);
    }

    // ── GET /followups ────────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/followups') {
      return json(res, 200, readFollowups());
    }

    // ── POST /followups ───────────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/followups') {
      const { title, description, due_date, priority } = await parseBody(req);
      if (!title || !due_date) {
        return json(res, 400, { error: 'title and due_date are required' });
      }
      const followups = readFollowups();
      const followup = { id: crypto.randomUUID(), title, description: description || '', due_date, status: 'open', priority: priority || 'medium' };
      followups.push(followup);
      writeFollowups(followups);
      return json(res, 201, followup);
    }

    // ── PATCH /followups/:id ──────────────────────────────────────────────────
    const followupPatchMatch = pathname.match(/^\/followups\/([^/]+)$/);
    if (method === 'PATCH' && followupPatchMatch) {
      const id = followupPatchMatch[1];
      const body = await parseBody(req);
      const followups = readFollowups();
      const idx = followups.findIndex((f) => f.id === id);
      if (idx === -1) return json(res, 404, { error: 'Follow-up not found' });
      followups[idx] = { ...followups[idx], ...body };
      writeFollowups(followups);
      return json(res, 200, followups[idx]);
    }

    // ── GET /emails ───────────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/emails') {
      const emails = await emailHandlers.read_emails({});
      return json(res, 200, emails);
    }

    // ── POST /emails/send ─────────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/emails/send') {
      const { to, subject, body } = await parseBody(req);
      if (!to || !subject || !body) {
        return json(res, 400, { error: 'to, subject, and body are required' });
      }
      const result = await emailHandlers.send_email({ to, subject, body });
      return json(res, 200, result);
    }

    // ── GET / → serve public/index.html ──────────────────────────────────────
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return serveFile(res, path.join(__dirname, 'public', 'index.html'));
    }

    // ── GET /public/* → serve static files ───────────────────────────────────
    if (method === 'GET' && pathname.startsWith('/public/')) {
      const filePath = path.join(__dirname, pathname);
      return serveFile(res, filePath);
    }

    // ── 404 ───────────────────────────────────────────────────────────────────
    json(res, 404, { error: `Cannot ${method} ${pathname}` });

  } catch (err) {
    console.error('Request error:', err);
    json(res, 500, { error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => {
  console.log(`AI Agent server running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY is not set. Chat functionality will not work.');
  }
});

module.exports = server;
