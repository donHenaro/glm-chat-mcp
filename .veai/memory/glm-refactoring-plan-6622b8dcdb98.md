---
name: "glm-refactoring-plan"
description: "GLM refactoring v15.3 COMPLETE: 7 steps — dead code, spec.js, ai-extract/bridge/Docker. All implementations detailed"
type: project
lastUpdated: 2026-08-10T17:15
lastRecall: 2026-08-10T18:08
---

## GLM-Confirmed Refactoring Plan for glm-chat-mcp (v15.3) — COMPLETE

### ✅ ALL 7 STEPS DONE
1. **Step 1 — Dead code deletion** (719 lines): cdp-intercept.js, progress-monitor.js, cloak-browser-mcp.js, package-cloak.json
2. **Step 2 — SKILL.md reduction** (216 → 85 lines, -60%): removed file tree, changelog, Provider Status, Kimi-specific triggers
3. **Step 3 — spec.js v2.0** (~190 lines deduped): Single Source of Truth for selectors, detectProvider, parseSSETokens across 8 files
4. **Step 4 — response.js + ai-extract.js merge** (420 → 341 lines): removed formatCheckpoint, needsContextRepeat, extractAllResponses; strategy 5 scoped to chat-container
5. **Step 5 — hooks-auto-init.js slimmed** (198 → 75 lines, -62%): thin orchestrator using window globals
6. **Step 6 — openai-bridge.js decomposition** (961 → 15 modules): app.js entry point, routes/chat.js, routes/admin.js, routes/{stream,nonstream,final}.js, services/{browser,cache,session,helpers,streaming}.js, utils/{metrics,rate-limit}.js, config.js, state.js. GLM found 8 issues (TIMOUT_MS duplicate, STREAM_BUFFER unused, SESSION_TTL_MS duplicate, metrics not exported, getOrCreateContext unused, auth middleware, DEFAULT_MODEL not exported) — all fixed
7. **Step 7 — Docker hardened**: Dockerfile HEALTHCHECK, optional xvfb (INSTALL_XVFB arg), multi-stage comments; docker-entrypoint.sh uses command -v checks; Playwright base 1.52.0 → 1.61.0 sync fix

### Verification (Aug 2026)
- Docker compose: container healthy, /v1/models (8 models), /v1/status, /metrics all 200 OK
- Browser scripts: spec.js v2.0 injects correctly, detectProvider() → 'glm'
- Session reuse works, Playwright headless runs

### DO NOT TOUCH
- `provider-adapter.js` architecture (SSE adapters, OpenAINormalizer) — stable
- Network hooks mechanism (fetch/EventSource interception) — complex but working
- Multi-turn dialogues (UUID chat persistence) — critical feature
- `mode-switcher.js` — tested universal mode switcher
