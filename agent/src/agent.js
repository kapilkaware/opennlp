'use strict';
const https = require('node:https');
const emailTools = require('./tools/emailTools');
const billTools = require('./tools/billTools');
const followupTools = require('./tools/followupTools');

const MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_API_HOST = 'api.anthropic.com';
const ANTHROPIC_API_PATH = '/v1/messages';

const SYSTEM_PROMPT = `You are a helpful AI assistant that can manage emails, track bills, and manage follow-up tasks.
You have access to tools to read and send emails, list and add bills, and manage follow-ups.
Be concise and helpful. When asked to show data, present it in a clear, readable format.`;

// ─── Raw HTTPS call to Anthropic Messages API ──────────────────────────────────

function callAnthropic(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: ANTHROPIC_API_HOST,
      port: 443,
      path: ANTHROPIC_API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const msg = (parsed.error && parsed.error.message) || data;
            reject(new Error(`Anthropic API error ${res.statusCode}: ${msg}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Anthropic response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Anthropic API request timed out'));
    });

    req.write(body);
    req.end();
  });
}

// ─── Agent class ───────────────────────────────────────────────────────────────

class Agent {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.tools = [
      ...emailTools.tools,
      ...billTools.tools,
      ...followupTools.tools
    ];
    this.handlers = {
      ...emailTools.handlers,
      ...billTools.handlers,
      ...followupTools.handlers
    };
  }

  async executeToolCall(toolName, toolInput) {
    const handler = this.handlers[toolName];
    if (!handler) return { error: `Unknown tool: ${toolName}` };
    try {
      return await handler(toolInput);
    } catch (err) {
      return { error: err.message };
    }
  }

  async chat(userMessage, history = []) {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set. Please configure it in your .env file.');
    }

    const messages = [
      ...history,
      { role: 'user', content: userMessage }
    ];

    let currentMessages = [...messages];
    let response;

    // Agentic loop: keep going until end_turn or non-tool stop
    while (true) {
      response = await callAnthropic(this.apiKey, {
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: this.tools,
        messages: currentMessages
      });

      if (response.stop_reason === 'end_turn') {
        break;
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

        // Append assistant turn (all content blocks including text + tool_use)
        currentMessages.push({ role: 'assistant', content: response.content });

        // Execute all tool calls in parallel
        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => {
            const result = await this.executeToolCall(block.name, block.input);
            return {
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result)
            };
          })
        );

        // Append all tool results as a single user message
        currentMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Any other stop reason (e.g. max_tokens) — stop
      break;
    }

    // Extract final text
    const textBlocks = (response.content || []).filter((b) => b.type === 'text');
    const finalText = textBlocks.map((b) => b.text).join('\n');

    // Build updated history: original messages + final assistant response
    const updatedHistory = [
      ...messages,
      { role: 'assistant', content: response.content }
    ];

    return { response: finalText, history: updatedHistory };
  }
}

module.exports = Agent;
