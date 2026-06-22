# KINSY UI Changelog

## 2026-06-23 - $KINS balance display fix

### Scope

HUD data-display fix for the `$KINS` stat, plus state synchronization in the background service worker.

No backend API routes, message names, or storage keys were changed.

### Bug Identified

After Phantom connect and session authorization, the backend verification balance was stored at `state.license.balance`.

The HUD did not read `state.license.balance`. It only displayed:

- `state.agent.snapshot.kins` when an agent tick had produced a snapshot.
- Otherwise `state.agent.kins`, which initialized as `0.0`.

That meant an authorized wallet with a real verified balance could still show `$KINS +0.0` until a later agent tick refreshed token state.

Follow-up root cause: when `/api/auth/game-token-balance` or a snapshot returned a known `0`, the HUD treated that zero as the best answer and never fell through to the positive verified holder balance from `license.balance` or `agent.gate.balance`.

### Files Changed

`content/content.js`

- Changed the initial `$KINS` stat text from `+0.0` to `—`.
- Added `resolveKinsBalance(state)` with positive-balance priority across:
  - `state.license.balance`
  - `state.agent.gate.balance`
  - `state.agent.kinsBalance`
  - `state.agent.snapshot.kins`
  - positive legacy `state.agent.kins`
- If no positive value exists, the HUD may show a known zero.
- Added `formatKinsBalance(value)` so `$KINS` renders as a balance, not an earned delta.
- Updated HUD render so `$KINS` uses the resolved balance in both snapshot and non-snapshot states.

`background/background.js`

- Added `state.agent.kinsBalance` to store the current Kintara `$KINS` token balance separately from holder verification balance.
- On `STATE_GET`, quietly refreshes the Kintara `$KINS` balance when there is an active session but no known token balance.
- On `SESSION_AUTHORIZE`, copies the verified backend balance into:
  - `state.license.balance`
  - `state.agent.gate.balance`
- On `SESSION_AUTHORIZE`, also tries to fetch `/api/auth/game-token-balance` immediately and stores it in `state.agent.kinsBalance`.
- On backend gate updates, keeps `state.license.balance` synchronized when a numeric holder balance is present.
- When an adapter snapshot includes `snapshot.kins`, stores that current balance into `state.agent.kinsBalance` rather than only accumulating deltas.
- Added tolerant numeric helpers for balance parsing.

`background/adapter.js`

- Added tolerant parsing for `/api/auth/game-token-balance` responses.
- The adapter now accepts numeric/string balances from `uiAmount`, `uiAmountString`, `balance`, `data.balance`, `data.uiAmount`, `value.uiAmount`, `tokenAmount.uiAmount`, `amount`, or a root numeric/string body.

### Backend Handoff Notes

Current frontend display rule for the HUD `$KINS` stat:

```js
firstPositive([
  license.balance,
  agent.gate.balance,
  agent.kinsBalance,
  agent.snapshot.kins,
  agent.kins
]) ?? knownZero ?? null
```

The verified holder/authorization balance is `license.balance` after authorization and `agent.gate.balance` during live gate updates. A positive verified holder balance takes precedence over a zero from Kintara `/api/auth/game-token-balance`.

If backend responses change shape, keep returning a numeric UI amount in one of these fields:

- `balance.uiAmount`
- `balance.uiAmountString`
- `balance`
- `data.balance.uiAmount`
- `data.balance.uiAmountString`
- `data.balance`
- `data.uiAmount`
- `data.uiAmountString`
- `tokenAmount.uiAmount`
- `tokenAmount.uiAmountString`
- `amount`

### QA Checklist

- Connect Phantom.
- Authorize the KINSY session.
- Confirm the HUD `$KINS` stat updates immediately from the verified holder balance, even if `/api/auth/game-token-balance` returns `0`.
- Press Start and confirm later agent snapshots do not reset the display back to `0`.
- Confirm disconnect still resets state through the existing `INITIAL.agent` path.

## 2026-06-23 - Three-level HUD minimize states

### Scope

UI-only change for the in-game HUD overlay size behavior.

No background messages, storage schema, backend API calls, policy names, or runtime state fields were changed.

### What Changed

The HUD now has three display levels instead of the previous two-state compact/expanded toggle:

- `max` - full panel with status, resources, feed, mode controls, actions, Safety & automation, and disconnect.
- `mid` - status/feed panel matching the screenshot-style view, with no expanded controls.
- `min` - one-row header only, so the HUD can get out of the way of game elements.

The default mount state is `mid`.

### Files Changed

`content/content.js`

- Added `hudLevel` state initialized to `mid`.
- Added `setHudLevel(level)` to centralize HUD level class, `data-level`, button text, tooltip, and `aria-*` updates.
- Changed `#kinsai-hud-toggle` from a binary class toggle to a three-level cycle:
  - `max` -> `mid`
  - `mid` -> `min`
  - `min` -> `max`
- Kept the existing `.kinsai-hud-expanded-open` class for the `max` state.
- Added `.kinsai-hud-minimized` for the `min` state.
- Added `data-level="max|mid|min"` to `#kinsai-hud` for future styling or QA hooks.

`content/content.css`

- Changed the default HUD width to `min(520px, calc(100vw - 32px))` for the screenshot-like `mid` state.
- Kept the expanded `max` width at `min(560px, calc(100vw - 32px))`.
- Added `.kinsai-hud-minimized` width of `min(292px, calc(100vw - 32px))`.
- Added `.kinsai-hud-minimized .kinsai-hud-body { display: none; }` so the `min` state is header-only.
- Removed the header bottom border in `min` state.
- Increased the feed height in `mid` state with `max-height: 194px` to better match the provided screenshot.

### Backend Handoff Notes

Current behavior:

- HUD level is local DOM/UI state only.
- HUD level is not persisted across tab reloads.
- HUD level changes do not send `chrome.runtime.sendMessage`.
- Backend logic does not need to change for this UI behavior.

Stable UI hooks:

- `#kinsai-hud[data-level="max"]`
- `#kinsai-hud[data-level="mid"]`
- `#kinsai-hud[data-level="min"]`
- `.kinsai-hud-expanded-open` only when all controls are visible.
- `.kinsai-hud-minimized` only when the header-only row is visible.

### Visual QA Checklist

- Load or refresh Kintara so the HUD mounts in `mid`.
- Confirm `mid` shows header, wallet/title, loop/gold/$KINS, resources, and feed.
- Click the toggle once from `mid`; confirm it becomes one-row `min`.
- Click the toggle once from `min`; confirm it becomes full-control `max`.
- Click the toggle once from `max`; confirm it returns to `mid`.
- Confirm the `min` state does not show the feed, resources, setup buttons, mode controls, or Safety & automation.

## 2026-06-23 - Safety & automation active cards

### Scope

UI-only change for the expanded in-game HUD Safety & automation section.

No background messages, storage schema, backend API calls, policy names, or runtime state fields were changed.

### What Changed

The Safety & automation section now uses the requested six-card layout:

- `Loot Safety` - disabled roadmap card
- `Inventory Safe` - disabled roadmap card
- `Low HP Retreat` - disabled roadmap card
- `Telegram Alerts` - disabled roadmap card
- `Human-Like Mode` - active card, ON by default
- `Auto Reply` - active card, ON by default

The previous Auto-bank UI row from the earlier HUD pass was removed from the current Safety & automation markup so this section matches the latest final-layout request.

### Files Changed

`content/content.js`

- Removed the prior `Auto-bank` setting row from `.kinsai-hud-safety`.
- Added the active `Human-Like Mode` card inside `.kinsai-hud-safety`.
- Added checkbox hook `#kinsai-hud-human-like-mode`, checked by default.
- Added a small info control `.kinsai-hud-info` beside `Human-Like Mode`.
- Added tooltip copy:
  - `Natural pacing & movement`
  - `Short random idle breaks`
  - `Ambient walking around`
  - `Simple friendly replies when mentioned`
- Added the active `Auto Reply` card inside `.kinsai-hud-safety`.
- Added checkbox hook `#kinsai-hud-auto-reply`, checked by default.
- Added `Auto Reply` subtitle: `Reply when your player name is mentioned`.

`content/content.css`

- Removed the old `.kinsai-hud-automation` Auto-bank row styles.
- Added `.kinsai-hud-setting-card` for active Safety & automation cards.
- Added `.kinsai-hud-setting-copy`, `.kinsai-hud-setting-title`, `.kinsai-hud-setting-icon`, and `.kinsai-hud-setting-subtitle`.
- Added `.kinsai-hud-switch` for green ON toggles.
- Added `.kinsai-hud-info` and `.kinsai-hud-tooltip` for the Human-Like Mode popover.
- Kept disabled roadmap items on the existing muted `.kinsai-hud-safety section` treatment.

### Backend Handoff Notes

Current behavior:

- `#kinsai-hud-human-like-mode` is a native checkbox mounted with `checked`.
- `#kinsai-hud-auto-reply` is a native checkbox mounted with `checked`.
- Toggling either checkbox only changes its DOM checked state.
- No `chrome.runtime.sendMessage` call is emitted yet.
- No value is persisted to `chrome.storage.local`.
- No `STATE_CHANGED` render path reads or writes these controls yet.
- The current repo snapshot did not contain a standalone Human-Like Mode bar above Safety & automation. If a downstream branch has that bar, remove it and use the in-grid card above instead.

Suggested future state shape:

```js
agent: {
  automation: {
    humanLikeMode: {
      enabled: true
    },
    autoReply: {
      enabled: true
    }
  }
}
```

Suggested future message:

```js
chrome.runtime.sendMessage({
  type: 'AGENT_AUTOMATION_SET',
  payload: {
    humanLikeMode: {
      enabled: true
    },
    autoReply: {
      enabled: true
    }
  }
});
```

### Behavior Implied By The UI

Human-Like Mode should represent:

- Varied pacing and movement.
- Short random idle breaks.
- Occasional ambient walking.
- Simple friendly replies when mentioned.

Auto Reply should represent:

- Short friendly responses when chat mentions the current player name.

### Visual QA Checklist

- Expand the in-game HUD.
- Confirm Safety & automation shows the four disabled roadmap cards plus Human-Like Mode and Auto Reply.
- Confirm Human-Like Mode is inside the Safety & automation grid, not a standalone bar above it.
- Confirm Human-Like Mode and Auto Reply toggles are green and ON by default.
- Hover or focus the Human-Like Mode info icon and confirm the four-line tooltip appears.
- Confirm the UI does not mention avoiding detection.

## 2026-06-23 - Auto-bank moved into Safety & automation (superseded)

### Scope

UI-only change for the in-game HUD injected by `content/content.js` and styled by `content/content.css`.

No background messages, storage schema, backend API calls, policy names, or runtime state fields were changed.

Status: superseded by the `Safety & automation active cards` entry above. The current HUD no longer mounts `#kinsai-hud-auto-bank`, `#kinsai-hud-auto-bank-interval`, or `.kinsai-hud-automation`.

### What Changed

The disabled **Bank** roadmap tile was removed from the expanded HUD mode grid.

Before:

- Location: `.kinsai-hud-mode-grid`
- Element: disabled `<button>` with visible label `Bank`
- Meaning: future farming mode tile beside `Battle`, `Market`, `Trade`, and `Smart`
- Backend coupling: none

After:

- Location: `.kinsai-hud-safety`
- Element: setting row labeled `Auto-bank`
- Controls introduced:
  - Checkbox: `#kinsai-hud-auto-bank`
  - Interval selector: `#kinsai-hud-auto-bank-interval`
- Supported interval values:
  - `10` for 10 minutes
  - `20` for 20 minutes
  - `30` for 30 minutes

### Files Changed

`content/content.js`

- Removed the disabled Bank mode button from `.kinsai-hud-mode-grid`.
- Added a new full-width automation row as the first item under `Safety & automation`.
- Added the stable DOM hook `#kinsai-hud-auto-bank` for the checkbox.
- Added the stable DOM hook `#kinsai-hud-auto-bank-interval` for the cadence selector.

`content/content.css`

- Changed `.kinsai-hud-mode-grid` from five columns to four columns so the remaining eight mode tiles split into two even rows.
- Added `.kinsai-hud-automation` styling for the new Auto-bank row.
- Added `.kinsai-hud-automation-main` for checkbox and label alignment.
- Added scoped styles for `.kinsai-hud-automation input` and `.kinsai-hud-automation select`.
- The Auto-bank row is intentionally not covered by the disabled `.kinsai-hud-safety section` styling, because it is now presented as an available setting rather than a roadmap placeholder.

### Backend Handoff Notes

Behavior during that pass:

- Checking `#kinsai-hud-auto-bank` only changes the native checkbox state in the DOM.
- Changing `#kinsai-hud-auto-bank-interval` only changes the native select value in the DOM.
- No `chrome.runtime.sendMessage` call is emitted yet.
- No value is persisted to `chrome.storage.local`.
- No `STATE_CHANGED` render path reads or writes these controls yet.

Suggested future state shape:

```js
agent: {
  automation: {
    autoBank: {
      enabled: true,
      intervalMinutes: 20
    }
  }
}
```

Suggested future message:

```js
chrome.runtime.sendMessage({
  type: 'AGENT_AUTOMATION_SET',
  payload: {
    autoBank: {
      enabled: true,
      intervalMinutes: 20
    }
  }
});
```

### Historical Visual QA Checklist

- Expand the in-game HUD.
- Confirm the Mode grid no longer shows a `Bank` tile.
- Confirm the Mode grid renders as two rows of four tiles.
- Confirm `Auto-bank` appears under `Safety & automation`.
- Confirm the interval dropdown shows `10 min`, `20 min`, and `30 min`.
- Confirm the existing roadmap safety items remain visibly disabled.
- Confirm popup UI is unchanged.
