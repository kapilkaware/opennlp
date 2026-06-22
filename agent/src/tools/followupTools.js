'use strict';
const crypto = require('node:crypto');
const { readFollowups, writeFollowups } = require('../storage');

const tools = [
  {
    name: 'list_followups',
    description: 'List all follow-ups, optionally filtered by status.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'done'],
          description: 'Filter follow-ups by status. If omitted, returns all follow-ups.'
        }
      },
      required: []
    }
  },
  {
    name: 'add_followup',
    description: 'Add a new follow-up item to track.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the follow-up' },
        description: { type: 'string', description: 'Detailed description of the follow-up' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level of the follow-up'
        }
      },
      required: ['title', 'due_date']
    }
  },
  {
    name: 'complete_followup',
    description: 'Mark a follow-up as done by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The UUID of the follow-up to mark as done' }
      },
      required: ['id']
    }
  }
];

async function listFollowups({ status } = {}) {
  const followups = readFollowups();
  if (status) return followups.filter((f) => f.status === status);
  return followups;
}

async function addFollowup({ title, description, due_date, priority }) {
  const followups = readFollowups();
  const followup = {
    id: crypto.randomUUID(),
    title,
    description: description || '',
    due_date,
    status: 'open',
    priority: priority || 'medium'
  };
  followups.push(followup);
  writeFollowups(followups);
  return followup;
}

async function completeFollowup({ id }) {
  const followups = readFollowups();
  const idx = followups.findIndex((f) => f.id === id);
  if (idx === -1) return { error: `Follow-up with id ${id} not found` };
  followups[idx].status = 'done';
  writeFollowups(followups);
  return followups[idx];
}

const handlers = {
  list_followups: listFollowups,
  add_followup: addFollowup,
  complete_followup: completeFollowup
};

module.exports = { tools, handlers };
