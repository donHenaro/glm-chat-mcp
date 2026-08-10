/**
 * server/routes/final.chunks.js
 * SSE final chunk sender (tool calls + usage + stop chunk).
 */

const { estimateTokens, parseToolCalls, STREAM_BUFFER } = require('../services/helpers');

async function sendStreamFinalChunks(res, page, chatId, model, toolDefinitions, promptTokens, includeStreamUsage) {
  // Use buffered tokens instead of re-querying the page
  const buffered = STREAM_BUFFER || [];
  let allTokens;
  if (buffered.length > 0) {
    const answer = buffered.filter(t => t.phase === 'answer').map(t => t.text || '').join('');
    const thinking = buffered.filter(t => t.phase === 'thinking').map(t => t.text || '').join('');
    allTokens = { answer, thinking };
  } else {
    // Fallback: query page directly
    allTokens = await page.evaluate(() => {
      const latest = window.__netBuffer?.getLatest();
      const tokens = latest?.sseTokens || [];
      const answer = tokens.filter(t => t.phase === 'answer').map(t => t.text || '').join('');
      const thinking = tokens.filter(t => t.phase === 'thinking').map(t => t.text || '').join('');
      return { answer, thinking };
    });
  }
  // Clear buffer after collecting
  STREAM_BUFFER.length = 0;
  const completionTokens = estimateTokens(allTokens.answer + allTokens.thinking);
  let streamFinishReason = 'stop';
  if (toolDefinitions && allTokens.answer) {
    const parsed = parseToolCalls(allTokens.answer);
    if (parsed) {
      streamFinishReason = 'tool_calls';
      for (let i = 0; i < parsed.length; i++) {
        const tc = parsed[i];
        const toolChunk = { id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: 'call_' + Date.now() + '_' + i, type: 'function', function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments) } }] }, finish_reason: null }] };
        res.write('data: ' + JSON.stringify(toolChunk) + '\n\n');
      }
    }
  }
  // Final usage chunk (if requested)
  if (includeStreamUsage) {
    const usageChunk = { id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: {}, finish_reason: streamFinishReason }], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } };
    res.write('data: ' + JSON.stringify(usageChunk) + '\n\n');
  } else {
    const stopChunk = { id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: {}, finish_reason: streamFinishReason }] };
    res.write('data: ' + JSON.stringify(stopChunk) + '\n\n');
  }
}

module.exports = { sendStreamFinalChunks };
