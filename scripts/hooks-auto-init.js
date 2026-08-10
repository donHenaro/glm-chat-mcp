/**
 * scripts/hooks-auto-init.js v16.0
 * Thin orchestrator: delegates network hooks to network-hooks.js,
 * debug trace to this file, provider modules to providers-bundle.js.
 *
 * v16.0: Network hook code removed (delegated to network-hooks.js).
 *        File: ~50 lines (down from 198).
 *
 * Load order (MCP browser_evaluate):
 *   1. providers-bundle.js   → window.__spec, window.__providers
 *   2. network-hooks.js      → window.__netBuffer, window.__netHooksInstalled
 *   3. hooks-auto-init.js    → this file (orchestrator)
 */
(() => {
  'use strict';

  // === Debug Logging ===
  const DEBUG = true;
  const Debug = {
    log:    (m, ...a) => DEBUG && console.log(`%c[${m}]`, 'color: #00bfff; font-weight: bold;', ...a),
    warn:   (m, ...a) => DEBUG && console.warn(`%c[${m}]`, 'color: orange; font-weight: bold;', ...a),
    error:  (m, ...a) => DEBUG && console.error(`%c[${m}]`, 'color: red; font-weight: bold;', ...a),
    success:(m, ...a) => DEBUG && console.log(`%c[${m}]`, 'color: #0f0; font-weight: bold;', ...a),
  };
  window.__netDebug = Debug;

  // === Provider detection (from spec.js) ===
  const provider = window.__spec ? window.__spec.detectProvider() : 'unknown';
  Debug.log('AUTO-INIT', `Provider: ${provider}, URL: ${location.href}`);

  // === Step 1: Verify network hooks (installed by network-hooks.js) ===
  if (window.__netHooksInstalled) {
    Debug.log('AUTO-INIT', `Network hooks active (${window.__netBuffer?.entries?.length || 0} entries)`);
  } else {
    Debug.warn('AUTO-INIT', 'Network hooks NOT installed — load network-hooks.js before this script');
  }

  // === Step 2: Initialize debug trace ===
  if (!window.__trace) {
    window.__trace = {
      entries: [], _maxEntries: 200,
      log(a, d = {}) { const e = { ts: Date.now(), iso: new Date().toISOString(), action: a, ...d }; this.entries.push(e); if (this.entries.length > this._maxEntries) this.entries.shift(); return e; },
      error(a, e, d = {}) { return this.log(`error:${a}`, { errorMessage: e?.message || String(e), ...d }); },
      success(a, r = {}) { return this.log(`success:${a}`, r); },
      startTimer(l) { window[`__timer_${l}`] = Date.now(); },
      endTimer(l) { const s = window[`__timer_${l}`]; if (!s) return -1; const d = Date.now() - s; delete window[`__timer_${l}`]; this.log(`timer:end:${l}`, { durationMs: d }); return d; },
      dump(n = 50) { return this.entries.slice(-n); },
      stats() { return { totalEntries: this.entries.length, errors: this.entries.filter(e => e.action.startsWith('error:')).length }; },
      clear() { this.entries = []; return { cleared: true }; },
      export() { return this.entries.map(e => `| ${e.iso} | ${e.action} |`).join('\n'); },
    };
    Debug.success('AUTO-INIT', 'Debug trace initialized');
  }

  // === Step 3: Initialize adapter (from provider modules) ===
  if (window.__providers?.createForHost && !window.__currentAdapter) {
    window.__currentAdapter = window.__providers.createForHost();
    Debug.success('AUTO-INIT', `Adapter: ${window.__currentAdapter.constructor.name} (from modules)`);
  } else if (!window.__currentAdapter && window.GLMAdapter) {
    window.__currentAdapter = provider === 'glm' ? new window.GLMAdapter() : new window.OpenAIAdapter();
    Debug.success('AUTO-INIT', `Adapter: ${window.__currentAdapter.constructor.name} (legacy)`);
  }

  // === Log result ===
  window.__trace?.success('auto-init', { provider, hooks: window.__netHooksInstalled, adapter: !!window.__currentAdapter });

  return {
    status: 'auto-initialized',
    provider,
    hooksInstalled: window.__netHooksInstalled,
    bufferLen: window.__netBuffer?.entries?.length || 0,
    adapterLoaded: !!window.__currentAdapter,
    hint: 'All systems ready. Network hooks + debug trace active.',
  };
})()
