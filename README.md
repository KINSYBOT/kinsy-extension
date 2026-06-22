# KINSY Extension

KINSY is a Chrome/Brave companion for Kintara. It gives you a small, cute control panel that can farm `$KINS` loops for you while keeping the important parts visible: wallet status, active mode, backpack resources, and a readable activity feed.

KINSY does not take custody of your wallet. Phantom is used for wallet ownership checks and scoped session approval only.

## Install

1. Clone or download this repo.
2. Open `chrome://extensions` or `brave://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Pick the repo folder.
6. Pin KINSY to your toolbar.
7. Open `https://kintara.com/play`.
8. Click KINSY, connect Phantom, verify holding, choose a mode, and press **Start**.

## What You See

KINSY has two UI surfaces:

- **Toolbar popup**: full controls, resource tiles, mode picker, session status, and feed.
- **In-game HUD**: compact status panel inside Kintara with the same loop/resource/feed basics.

The UI is intentionally light and soft. It is a companion panel, not a trading terminal.

## Modes

| Mode | Behavior |
| --- | --- |
| Observe only | Shows status and resources without sending farming actions. |
| Auto-harvest | Uses the equipped tool to choose the basic farming loop. |
| Chop wood | Targets wood/tree nodes. Requires the right woodcutting tool. |
| Mine rocks | Targets rock nodes for stone, coal, or metal drops. Requires the right mining tool. |
| Fish | Targets fishing spots. Requires a fishing rod. |
| Smart Farming | Roadmap item. Disabled until implemented. |

## How Auth Works

KINSY uses a temporary backend session token.

1. The extension asks the backend for a challenge.
2. Phantom signs a plain message proving wallet ownership.
3. The backend verifies the signature.
4. The backend checks whether the wallet holds enough `$KINSY`.
5. If the holder gate passes, the backend returns a short-lived JWT.
6. The extension uses that JWT to connect to the KINSY backend WebSocket.

The Phantom prompt is a message signature, not a transaction.

It cannot:

- move SOL
- move SPL tokens
- approve token spending
- access your private key
- grant blanket wallet permissions

You can revoke or pause the KINSY session from the popup.

## How Farming Works

KINSY watches the Kintara game client from the browser extension and streams relevant state to the backend planner.

The backend planner decides what target to use for the selected mode. The extension then asks the Kintara client to act on that target and waits for server-accepted events before updating the visible resource counts.

The feed is intentionally explicit. If KINSY is waiting for position, missing a tool, changing mode, clicking a node, or receiving a resource grant, it should say so.

## Project Layout

```text
manifest.json
popup/       Toolbar popup UI
content/     Kintara page bridge and in-game HUD
background/  MV3 service worker, state, backend uplink
icons/       Extension icons
docs/        Kintara API notes
```

## Backend

The extension connects to the KINSY backend at:

```text
https://api.kinsai.xyz
wss://api.kinsai.xyz/ws/agent
```

The public website is:

```text
https://kinsy.fun
```

## Current Status

Live:

- Phantom connect
- holder verification
- temporary JWT session
- observe mode
- wood mode
- rock mode
- fish mode
- resource tiles
- popup feed
- in-game HUD

Roadmap:

- Smart Farming
- Telegram notes
- auto-bank / inventory safety
- deeper marketplace watch

## Safety Notes

KINSY is designed to be visible and easy to stop.

- Active modes require holder verification.
- Observe-only remains available when active mode is unavailable.
- Session tokens expire.
- Balance checks can push the extension back to observe-only.
- The extension should explain what it is doing in the feed.

