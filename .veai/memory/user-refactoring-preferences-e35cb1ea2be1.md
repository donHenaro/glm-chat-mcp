---
name: "user-refactoring-preferences"
description: "User requires GLM consultation before any refactoring in glm-chat-mcp, step-by-step with expert review"
type: feedback
lastUpdated: 2026-08-10T11:50
lastRecall: 2026-08-10T19:02
---

## User Refactoring Preferences for glm-chat-mcp

1. **Discuss with GLM first** — consult GLM (via chat.z.ai) to review the proposed plan and decide what to change vs. what to leave alone
2. **Step-by-step implementation** — implement one change at a time, discussing details with GLM before each step
3. **Full context** — provide GLM with complete analysis before asking for input

**GLM-confirmed refactoring order:** 1) spec.js SSOT first, 2) merge response.js + ai-extract.js, 3) slim hooks-auto-init.js, 4) decompose openai-bridge.js. This order avoids "перестановка мусора" (shuffling garbage) — fix foundations before combining modules.

**Why:** User values expert review and incremental, validated changes over blind execution.
