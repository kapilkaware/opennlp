'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BILLS_FILE = path.join(DATA_DIR, 'bills.json');
const FOLLOWUPS_FILE = path.join(DATA_DIR, 'followups.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile(filePath) {
  ensureDataDir();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return [];
  }
}

function writeJsonFile(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readBills() {
  return readJsonFile(BILLS_FILE);
}

function writeBills(bills) {
  writeJsonFile(BILLS_FILE, bills);
}

function readFollowups() {
  return readJsonFile(FOLLOWUPS_FILE);
}

function writeFollowups(followups) {
  writeJsonFile(FOLLOWUPS_FILE, followups);
}

module.exports = { readBills, writeBills, readFollowups, writeFollowups };
