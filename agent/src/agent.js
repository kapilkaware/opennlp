const Anthropic = require('@anthropic-ai/sdk');
const emailTools = require('./tools/emailTools');
const billTools = require('./tools/billTools');
const followupTools = require('./tools/followupTools');

const MODEL = 'claude-sonnet-4-6';

class Agent {
  constructor(anthropicClient) {
    this.client = anthropicClient;
    const { tools, handlers } = this.registerTools();
    this.tools = tools;
    this.handlers = handlers;
  }

  registerTools() {
    const tools = [
      ...emailTools.tools,
      ...billTools.tools,
      ...followupTools.tools
    ];
    const handlers = {
      ...emailTools.handlers,
      ...billTools.handlers,
      ...followupTools.handlers
    };
    return { tools, handlers };
  }

  async executeToolCall(toolName, toolInput) {
    const handler = this.handlers[toolName];
    if (!handler) {
      return { error: `Unknown tool: ${toolName}` };
    }
    try {
      const result = await handler(toolInput);
      return result;
    } catch (err) {
      return { error: err.message };
    }
  }

  async chat(userMessage, history = []) {
    const messages = [
      ...history,
      { role: 'user', content: userMessage }
    ];

    let response;
    let currentMessages = [...messages];

    while (true) {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: `You are a helpful AI assistant that can manage emails, track bills, and manage follow-up tasks.
You have access to tools to read and send emails, list and add bills, and manage follow-ups.
Be concise and helpful. When asked to show data, present it in a clear, readable format.`,
        messages: currentMessages,
        tools: this.tools
      });

      if (response.stop_reason === 'end_turn') {
        break;
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

        // Append assistant message with all content blocks
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

        // Append all tool results in a single user message
        currentMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Any other stop reason — break
      break;
    }

    // Extract final text response
    const textBlocks = response.content.filter((b) => b.type === 'text');
    const finalText = textBlocks.map((b) => b.text).join('\n');

    // Build updated history (append assistant final response)
    const updatedHistory = [
      ...messages,
      { role: 'assistant', content: response.content }
    ];

    return { response: finalText, history: updatedHistory };
  }
}

module.exports = Agent;
