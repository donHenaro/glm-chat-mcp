/**
 * server/routes/nonstream.handler.js
 * Non-streaming response handler for POST /v1/chat/completions.
 */

const state = require('../state');
const { TIMEOUT_MS } = require('../config');
const { cacheHash, cacheSet } = require('../services/cache');
const { estimateTokens, parseToolCalls } = require('../services/helpers');
const { metrics } = require('../utils/metrics');

/**
 * Handle non-streaming (blocking) response.
 */
async function handleNonStreaming(req, res, page, chatId, startTime, model, provider, messages, toolDefinitions, promptTokens) {
  const useDomFallback = provider.adapter === 'kimi' || provider.url.includes('deepseek.com');
  let answerText = '';
  let thinkingText = '';

  while (Date.now() - startTime < TIMEOUT_MS) {
    await page.waitForTimeout(1000);

    const state_ = await page.evaluate((domFallback) => {
      const latest = window.__netBuffer?.getLatest();
      const netAnswer = window.__netBuffer?.getLatestTokens?.() || '';
      const netThinking = window.__netBuffer?.getLatestThinking?.() || '';

      if (domFallback && !netAnswer) {
        const mdBlocks = document.querySelectorAll('[class*="markdown"], [class*="message-content"], .agent-chat-item, .ds-markdown');
        const lastBlock = mdBlocks[mdBlocks.length - 1];
        const domAnswer = lastBlock ? lastBlock.innerText.trim() : '';
        const isLoading = !!document.querySelector('[class*="loading"], [class*="typing"], .ds-loading');
        return { answer: domAnswer, thinking: netThinking, complete: domAnswer.length > 0 && !isLoading };
      }
      return { answer: netAnswer, thinking: netThinking, complete: latest?.complete || false };
    }, useDomFallback);

    answerText = state_.answer;
    thinkingText = state_.thinking;
    if (state_.complete && answerText.length > 0) break;
  }

  // Parse tool_calls from response
  let parsedToolCalls = null;
  let contentText = answerText;
  let finishReason = 'stop';

  if (toolDefinitions) {
    parsedToolCalls = parseToolCalls(answerText);
    if (parsedToolCalls) {
      finishReason = 'tool_calls';
      contentText = null;
      console.log(`[bridge] Parsed ${parsedToolCalls.length} tool_calls from response`);
    }
  }

  const response = {
    id: chatId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: contentText,
        ...(thinkingText ? { reasoning_content: thinkingText } : {}),
        ...(parsedToolCalls ? { tool_calls: parsedToolCalls } : {}),
      },
      finish_reason: finishReason,
    }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: estimateTokens(answerText + thinkingText),
      total_tokens: promptTokens + estimateTokens(answerText + thinkingText),
    },
  };

  // Cache the response
  cacheSet(cacheHash(model, messages), response, state.responseCache);

  // Track assistant message in session history
  if (state.sessions[req.headers['x-session-id']]?.messages) {
    state.sessions[req.headers['x-session-id']].messages.push({ role: 'assistant', content: contentText || '' });
  }

  res.json(response);
}

module.exports = { handleNonStreaming };
