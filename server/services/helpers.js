/**
 * server/services/helpers.js
 * Shared helpers: token estimation, tool prompt building, tool_calls parsing.
 */

/**
 * Estimate tokens: ~4 chars/token for English, ~1 for CJK.
 */
function estimateTokens(text) {
  if (!text) return 0;
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const otherChars = text.length - cjkChars;
  return Math.ceil(cjkChars + otherChars / 4);
}

/**
 * Build tool injection prompt.
 */
function buildToolPrompt(tools, prompt) {
  const toolInstructions = tools.map(t => {
    const func = t.function;
    const params = func.parameters?.properties ? JSON.stringify(func.parameters) : 'none';
    return `- ${func.name}: ${func.description || 'No description'}. Parameters: ${params}`;
  }).join('\n');

  const toolSystemMsg = `[TOOL INSTRUCTIONS]
You have access to the following tools. When you need to call a tool, respond with a JSON block in this exact format:
\`\`\`json
{"tool_calls": [{"name": "function_name", "arguments": {"param1": "value1"}}]}
\`\`\`

Available tools:
${toolInstructions}

Important: Only use tool calls when the task requires it. For normal questions, respond with regular text.
[/TOOL INSTRUCTIONS]

`;
  return toolSystemMsg + prompt;
}

/**
 * Parse tool_calls from model response text.
 */
function parseToolCalls(text) {
  if (!text) return null;
  // Try fenced JSON
  const toolCallRegex = /```json\s*([\s\S]*?)```/;
  const match = text.match(toolCallRegex);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        return parsed.tool_calls.map((tc, idx) => ({
          id: `call_${Date.now()}_${idx}`,
          type: 'function',
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
          }
        }));
      }
    } catch {}
  }
  // Try raw JSON
  try {
    const parsed = JSON.parse(text);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls.map((tc, idx) => ({
        id: `call_${Date.now()}_${idx}`,
        type: 'function',
        function: {
          name: tc.name,
          arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
        }
      }));
    }
  } catch {}
  return null;
}

const STREAM_BUFFER = [];

module.exports = { estimateTokens, buildToolPrompt, parseToolCalls, STREAM_BUFFER };
