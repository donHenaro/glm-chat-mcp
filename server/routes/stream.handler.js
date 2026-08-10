/**
 * server/routes/stream.handler.js
 * SSE streaming response handler for POST /v1/chat/completions.
 * Extracted from openai-bridge.js monolith lines ~430-520.
 */

const { TIMEOUT_MS } = require('../config');
const { estimateTokens, parseToolCalls, STREAM_BUFFER } = require('../services/helpers');
const { metrics } = require('../utils/metrics');
const { sendStreamFinalChunks } = require('./final.chunks');

/**
 * Handle SSE streaming response.
 */
async function handleStreaming(req, res, page, chatId, startTime, model, provider, toolDefinitions, promptTokens, includeStreamUsage) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const firstChunk = { id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] };
  res.write(`data: ${JSON.stringify(firstChunk)}\n\n`);

  const useDomFallback = provider.adapter === 'kimi' || provider.url.includes('deepseek.com');
  let lastTokenCount = 0;
  let lastDomText = '';

  while (Date.now() - startTime < TIMEOUT_MS) {
    await page.waitForTimeout(500);

    const state = await page.evaluate((domFallback) => {
      if (domFallback) {
        const mdBlocks = document.querySelectorAll('[class*="markdown"], [class*="message-content"], .agent-chat-item');
        const lastBlock = mdBlocks[mdBlocks.length - 1];
        const text = lastBlock ? lastBlock.innerText.trim() : '';
        const isLoading = !!document.querySelector('[class*="loading"], [class*="typing"]');
        return { tokens: text ? [{ text, phase: 'answer' }] : [], complete: text.length > 0 && !isLoading, total: text ? 1 : 0, domText: text };
      }
      const latest = window.__netBuffer?.getLatest();
      const tokens = latest?.sseTokens || [];
      const complete = latest?.complete || false;
      return { tokens: tokens.map(t => ({ text: t.text, phase: t.phase })), complete, total: tokens.length, domText: '' };
    }, useDomFallback);

    if (useDomFallback && state.domText) {
      if (state.domText.length > lastDomText.length) {
        const newChars = state.domText.slice(lastDomText.length);
        lastDomText = state.domText;
        // Buffer for final chunks
        STREAM_BUFFER.push({ text: newChars, phase: 'answer' });
        res.write(`data: ${JSON.stringify({ id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: { content: newChars }, finish_reason: null }] })}\n\n`);
      }
    } else {
      for (let i = lastTokenCount; i < state.total; i++) {
        const token = state.tokens[i];
        if (!token) continue;
        const delta = token.phase === 'thinking' ? { reasoning_content: token.text } : { content: token.text };
        // Buffer for final chunks
        STREAM_BUFFER.push({ text: token.text, phase: token.phase });
        res.write(`data: ${JSON.stringify({ id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      }
      lastTokenCount = state.total;
    }

    if (state.complete && state.total > 0) {
      await sendStreamFinalChunks(res, page, chatId, model, toolDefinitions, promptTokens, includeStreamUsage);
      break;
    }
  }

  res.end();
}

module.exports = { handleStreaming };
