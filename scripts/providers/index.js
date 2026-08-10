/**
 * scripts/providers/index.js v15.3
 * Factory and registry — createAdapter(name), ADAPTER_MAP, detect(), createForHost().
 * Re-exports everything from window.__providers namespace.
 *
 * v15.3: detect() делегирован в spec.js (window.__spec.detectProvider)
 *
 * MUST be loaded LAST (after base-adapter.js, spec.js, all adapters, openai-normalizer.js).
 * Adds: window.__providers.createAdapter, window.__providers.ADAPTER_MAP,
 *       window.__providers.detect, window.__providers.createForHost
 */
(() => {
  'use strict';

  const P = window.__providers;

  // === ADAPTER_MAP — factory functions for each provider ===
  const ADAPTER_MAP = {
    glm: () => new P.GLMAdapter(),
    qwen: () => new P.QwenAdapter(),
    deepseek: () => new P.DeepSeekAdapter(),
    kimi: () => new P.KimiAdapter(),
  };

  /**
   * Create an adapter by provider name
   * @param {string} name - Provider key (glm, qwen, deepseek, kimi)
   * @returns {IProviderAdapter}
   */
  function createAdapter(name) {
    const factory = ADAPTER_MAP[name];
    if (!factory) {
      throw new Error(`[providers] Unknown adapter: "${name}". Available: ${Object.keys(ADAPTER_MAP).join(', ')}`);
    }
    return factory();
  }

  /**
   * Detect provider from hostname (delegated to spec.js)
   * @param {string} hostname - location.hostname
   * @returns {string} Provider key
   */
  function detect(hostname) {
    return window.__spec.detectProvider(hostname);
  }

  /**
   * Create adapter for current host
   * @returns {IProviderAdapter}
   */
  function createForHost() {
    const providerKey = detect();
    return ADAPTER_MAP[providerKey]?.() || new P.OpenAIAdapter();
  }

  // === Re-export everything to namespace ===
  P.ADAPTER_MAP = ADAPTER_MAP;
  P.createAdapter = createAdapter;
  P.detect = detect;
  P.createForHost = createForHost;

  // Convenience: also set window-level globals for backward compatibility
  window.IProviderAdapter = P.IProviderAdapter;
  window.GLMAdapter = P.GLMAdapter;
  window.OpenAIAdapter = P.OpenAIAdapter;
  window.QwenAdapter = P.QwenAdapter;
  window.DeepSeekAdapter = P.DeepSeekAdapter;
  window.KimiAdapter = P.KimiAdapter;
  window.OpenAINormalizer = P.OpenAINormalizer;
  window.ADAPTER_MAP = ADAPTER_MAP;

  // Set current adapter
  window.__currentAdapter = createForHost();

  console.log('[providers] Initialized. Available:', Object.keys(ADAPTER_MAP).join(', '),
    '| Current:', window.__currentAdapter.constructor.name);
})()
