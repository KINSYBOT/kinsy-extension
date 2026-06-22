# Kintara API — reverse-engineered reference

Captured via Burp on 2026-06-21 (`all_requests.xml`, 218 transactions over a real
play session). Two hosts. Two transports. Solana-signed cookie auth.

## Hosts

| Host                  | Role                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| `kintara.com`          | Game origin. Auth, player state, save-* mutations, WS upgrades.       |
| `fanout.kintara.com`   | Public/anon-friendly read fan-out: server list, chat poll, stats.     |

All HTTP is HTTPS / HTTP/2 behind Cloudflare. Both hosts allow CORS from
`https://kintara.com`.

## Auth

Two-step challenge → signed-message verify. Identical pattern to standard
Solana sign-in. The client never sees or sends a private key — only signs a
message in Phantom and posts the bytes.

### 1. `GET kintara.com /api/auth/challenge`

```json
{
  "ok": true,
  "challengeId": "53e27c8eb4e7309987121b1f51780342",
  "message": "Sign in to Kintara\nChallenge: 53e27c8eb4e7309987121b1f51780342\nIssued: 2026-06-21T15:41:54.728Z"
}
```

### 2. `POST kintara.com /api/auth/verify`

Body:
```json
{
  "publicKey":   "<base58 Solana pubkey>",
  "signature":   [<64 byte ed25519 signature as int[]>],
  "message":     "Sign in to Kintara\nChallenge: <id>\nIssued: <iso>",
  "challengeId": "<from step 1>"
}
```

Response on success: full `auth/me`-shape body plus two `Set-Cookie` headers:
```
__Host-kintara_session=<JWT>; Path=/; HttpOnly; SameSite=Lax; Secure
kintara_session=<JWT>;        Path=/; HttpOnly; SameSite=Lax; Secure
```

The JWT payload (header.payload.sig) decodes to:
```json
{ "pid": <player id>, "w": "<wallet pubkey>", "exp": <unix>, "e": 0 }
```

### `POST kintara.com /api/auth/logout`

Clears both cookies (`Max-Age=0`). Returns `{ "ok": true }`.

## Player read-only

| Method | Path                              | Notes                                        |
| ------ | --------------------------------- | -------------------------------------------- |
| GET    | `/api/auth/me`                    | Full player snapshot — see below             |
| GET    | `/api/auth/dashboard-summary`     | Compact view for landing                     |
| GET    | `/api/auth/game-token-balance`    | $KINS balance: `{ uiAmount, decimals, symbol }` |
| GET    | `/api/auth/viewer-level`          | `{ avgLevel: 1 }`                            |
| GET    | `/api/auth/gate-check?shard=N`    | Is wallet allowed on shard N: `{ gate: "ok" }` |
| GET    | `/api/captcha/active`             | `{ captcha: null }` when not gated           |
| GET    | `/api/club/status`                | Membership tier + pricing                    |
| GET    | `/api/arena/leaderboard?windowMin=60&limit=100&_=<ms>` | PvP arena      |
| GET    | `/api/site/feed`                  | News feed                                    |

### `GET /api/auth/me` (truncated)

```json
{
  "ok": true,
  "player": {
    "id": 16757,
    "wallet_pubkey": "DbRfcUjqAfGRyyctiJTu1gai1hXZA7xgvTXs4haqJa1C",
    "username":      "...",
    "display_name":  "KINSAI",
    "motto":         "zzz",
    "created_at": "...",
    "updated_at": "..."
  },
  "outfit": { "hat": 0, "top": 0, "pants": 0, "shoe": 0, "skinTone": 1, "outfitSchema": 15, "hatC": 3816778, "topC": 2450411, "pantsC": 2450411, "shoeC": 16777215, "strapC": 1790656, "hatFx": null, "topFx": null, "pantsFx": null, "shoeFx": null, "aura": null, "glasses": null, "pantsPattern": null, "torsoDecal": null },
  "backpack": {
    "wood": 68, "stone": 20, "coal": 23, "metal": 0, "gold": 0, "fish": 0,
    "cooked_fish_meat": 0, "raw_chicken": 0, "cooked_chicken": 0,
    "potion_health": 0, "potion_shield": 0, "potion_strength": 0, "potion_poison": 0,
    "hotbar":         [ {"n":1,"t":"tool_axe"}, {"n":1,"t":"wild_sword"}, {"n":1,"t":"tool_pickaxe"}, {"n":1,"t":"tool_hammer"}, null, null ],
    "invSlots":       [ /* 24 slots, { n, t } or null */ ],
    "bankSlots":      [ /* ~300 slots */ ],
    "petSlots":       [ /* 30 */ ],
    "cosmeticSlots":  [ /* 90 */ ],
    "furnitureSlots": [ /* 30 */ ],
    "mountSlots":     [ /* 30 */ ],
    "bankPages": 1,
    "equippedHotbar": 0,
    "mountTrexRiding": false /* + 11 other mounts */
  },
  "meta": {
    "hp": 100, "wildShield": 0,
    "spawn":   { "col": 18, "row": 13, "realm": "world" },
    "skills":  { "mining": true, "logging": true, "building": true, "wildSword": true, "fishingRod": false },
    "skillXp": { "combat": 0, "mining": 125, "cooking": 0, "fishing": 0, "smithing": 0, "woodcutting": 575 },
    "dailyQuest":  { "day": "2026-06-21", "prog": {}, "cfgRev": 140, "claimed": {}, "kindTotals": {} },
    "_stateSeq": 190
  },
  "tutorialStep": 9,
  "isAdmin": false,
  "stateSeq": 190,
  "cosmeticShop": { "daily": {...}, "weekly": {...} },
  "petShop":       { "weekly": {...} },
  "furnitureShop": { "limited": {...}, "catalogue": [...] },
  "alchemistMountShop": { "weekly": {...} },
  "clubMember": false
}
```

`_stateSeq` / `stateSeq` is a monotonic version counter. Use this to detect
whether the server saw a state change between two polls.

## Player mutations (the "save-*" family)

All under `kintara.com`, all `POST application/json`, all require the session
cookie. All idempotent — they accept whatever you submit (within validation)
and overwrite the server copy.

| Path                                | Sample body                                                  |
| ----------------------------------- | ------------------------------------------------------------ |
| `/api/auth/save-spawn`              | `{ "realm": "bankShop", "col": 2, "row": 4 }`                |
| `/api/auth/save-hp`                 | `{ "hp": 100, "wildShield": 0, "le": 1 }`                    |
| `/api/auth/save-backpack`           | full backpack object — see `/auth/me`                        |
| `/api/auth/save-outfit`             | `{ "outfit": { ... } }`                                      |
| `/api/auth/save-skills`             | `{ "skills": { "mining": true, ... } }`                      |
| `/api/auth/save-motto`              | `{ "motto": "zzz" }`                                         |
| `/api/auth/display-name`            | `{ "displayName": "KINSAI" }`                                |
| `/api/auth/profile-badge`           | `{ "badge": "" }`                                            |
| `/api/auth/client-settings`         | full client-settings object                                  |
| `/api/auth/grant-tool`              | `{ "type": "tool_axe" }`  — grants a starter tool            |
| `/api/auth/daily-quest-progress`    | `{}` — poll/sync                                             |
| `/api/auth/tutorial-progress`       | `{ "action": "advance", "fromStep": 0 }`                     |
| `/api/auth/casino-blackjack-recover`| `{}` — refunds stuck bets, returns backpack                   |

**Important client-authoritative posture.** `save-spawn` and `save-backpack`
trust the client's submitted state. The server presumably validates against
business rules (e.g. you can't dump 999 gold without earning it via the WS
gameplay channel), but at the HTTP layer you POST the new state and the
server stores it. For the agent, this means we can drive position and
inventory persistence as long as our actions are consistent with what the
WS server-authoritative gameplay reports.

## World / lobby

| Method | Host                | Path                                                              |
| ------ | ------------------- | ----------------------------------------------------------------- |
| GET    | `kintara.com`        | `/api/servers`                                                    |
| GET    | `fanout.kintara.com` | `/api/servers` (anon-friendly, same shape)                        |
| GET    | `fanout.kintara.com` | `/api/site/stats` — `{ onlineNow, monthlyActive }`                |
| GET    | `fanout.kintara.com` | `/api/property-signs/status` — mansion/house/trailer/flat owners  |
| GET    | `fanout.kintara.com` | `/api/token/blimp-stats` — $KINSAI mint, price, MC, holders       |
| GET    | `fanout.kintara.com` | `/api/world/expansion-tribute` — global resource goal             |
| GET    | `fanout.kintara.com` | `/api/world/merchant-campaign` — campaign goals + progress        |
| POST   | `kintara.com`        | `/api/world/merchant-campaign/contribute` — `{ wood, stone, coal, cooked_fish_meat, metal }` |
| GET    | both                | `/api/world/chat/bootstrap?region=R&shard=N` — last N chat        |
| GET    | both                | `/api/world/chat?after=ID&region=R&shard=N` — incremental poll    |

### Chat poll shape

```json
{
  "ok": true,
  "maxId": 123413,
  "shardId": 21,
  "messages": [
    { "id": 109924, "playerId": 4130, "shardId": 21,
      "displayName": "jobba", "walletPubkey": "",
      "region": "bank_shop", "worldX": 2.5, "worldZ": -0.5,
      "message": "<text>", "createdAtMs": 1781931060965 },
    ...
  ]
}
```

Polls drive incremental chat updates with `after=<last maxId>`. Empty result:
```json
{ "ok": true, "maxId": 115675, "shardId": 21, "messages": [] }
```

### Regions seen
- `world`
- `bank_shop`
- `mine`

(more likely exist — capture from a longer play session for the full list.)

## Friends / social

| Method | Path                              | Body / Notes                                 |
| ------ | --------------------------------- | -------------------------------------------- |
| GET    | `/api/friends/list`               | `{ friends: [] }`                            |
| GET    | `/api/friends/pending`            | `{ incoming: [], outgoing: [...] }`          |
| GET    | `/api/friends/pending-count`      | count                                        |
| GET    | `/api/friends/dm/unread-summary`  | `{ senders: [] }`                            |
| POST   | `/api/friends/request`            | `{ "peerId": 16682 }`                        |

## WebSocket protocol

Two channels at `wss://kintara.com/`. Both use the same session cookie as the
HTTP API. All frames are plain JSON. Every message has a `t` field
identifying the type.

| Path                | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `/ws/queue/sN`      | Pre-join queue for shard N (lobby)              |
| `/ws/presence/sN`   | In-game presence + state stream for shard N     |

Captured from a real session of player `id=16757` ("KINSAI") on shard 22.
9,500 frames total, 18 unique message types.

### Queue channel (`/ws/queue/sN`)

| Dir | `t`              | Body                                |
| --- | ---------------- | ----------------------------------- |
| C→S | `q_ping`         | `{}` — keepalive                    |
| C→S | `q_leave`        | `{}` — voluntary exit               |
| S→C | `queue_pos`      | `{ pos, ahead }`                    |
| S→C | `queue_ready`    | `{}` — slot available, proceed      |
| S→C | `queue_evicted`  | `{ reason: "replaced" \| ... }`     |

### Presence channel (`/ws/presence/sN`)

#### Client → server

##### `pos` — position + action heartbeat (every ~100ms)

Base fields (always present):
```json
{
  "t":"pos",
  "region":"world",
  "x":-14.5, "y":0.25, "z":-19.5,
  "ry":1.5707963267948966,
  "mov":false,
  "le":1,
  "tut":9,
  "eq":"tool_axe",
  "sms":0,
  "trx":0
}
```

Action context (added while doing something):
- `act` — `"mine"` | `"build"` | (other action codes likely exist)
- `mc`, `mr` — mining tile col/row
- `mp` — mining progress, float `0..1`

NPC hosting (only if `npcHostId` is us):
- `npcs` — `{ const: {x,y,z,ry}, log: {x,y,z,ry} }`

Verbose variant (sent rarely, e.g. on join / outfit change): adds `outfit`,
`pet`, `dm`/`dms`, `wm`/`wmg`, `sm`/`sms`, `wfm`/`tfm`/`ucm`/`cm`/`gfm`/`wmm`/`hm`/`ttm`
(various potion + cooldown timers).

##### `harv_hit` — harvest action

```json
{ "t":"harv_hit", "region":"world",
  "k":"rock", "keys":["16,15"],
  "hasCoal":false, "hasMetal":false,
  "actionProof":"<JWT from previous action_proof frame>" }
```

`k` is `"rock"` or `"tree"`. `keys` is one or more `"col,row"` cells (multi-cell
resources span two tiles). The `actionProof` is required for the server to
credit the action — see flow below. First hit on a brand-new target may omit
`actionProof`; subsequent hits in the same combo must include the latest one.

##### `bld` — place a building

```json
{ "t":"bld", "region":"world", "k":"firepit", "c":17, "r":11, "rot":0, "nm":"KINSAI" }
```

##### `ffp_get` — read firepit state

```json
{ "t":"ffp_get" }
```

##### `cq` — sync daily quests

```json
{ "t":"cq", "a":"sync" }
```

#### Server → client

##### `snap` — world snapshot (most frequent frame)

```json
{
  "t":"snap", "region":"world", "onlineTotal":1241,
  "players":[
    {"id":13631, "x":-9.5, "z":-12.5, "ry":0, "mov":false,
     "php":100, "wsh":0, "cv":1, "le":2, "wsp":0},
    ...
  ],
  "npcs":{
    "const":{"x":-14.5,"y":0.25,"z":-7.5,"ry":0},
    "log":  {"x":-22.5,"y":0.25,"z":17.5,"ry":0}
  },
  "npcHostId":5191
}
```

Minimal player shape per entry: `id, x, z, ry, mov, php (hp), wsh (wild shield),
cv (?), le (avg level), wsp (?)`. Occasionally the snapshot includes the full
verbose player shape (`name, outfit, eq, avg, dm/dms/...`).

Verbose snapshots additionally include world objects:
- `res` — active resource nodes (rocks/trees) with state
- `wear` — wear progress on resources
- `shacks` — built shacks
- `firepits` — placed firepits
- `onlineIds` — connected player IDs (occasional)

The `npcHostId` is the player whose client is currently authoritative for
the npc positions in this region. If `npcHostId === self.id`, our client
must include `npcs` in its `pos` heartbeats.

##### `res_evt` — resource state change

```json
{ "t":"res_evt", "region":"world", "evt":"wear",
  "kind":"rock", "keys":["16,15"],
  "hasCoal":false, "hasMetal":false,
  "h":4, "hm":6,
  "loot":"stone",
  "by":16757,
  "actionProof":"<JWT>",
  "l2t":"tool_pickaxe_l2", "l2d":6910,   // optional: tier-2 tool drop
  "stateSeq":217                          // optional: present when self
}
```

`evt` is one of:
- `"wear"` — resource took a hit; `h`/`hm` are remaining/max hp
- `"clear"` — resource fully cleared and removed (no `h`/`loot`)

`by` is the player who hit it. When `by === self.id`, this is the credit for
our own action.

##### `action_proof` — JWT authorizing the next harvest

```json
{ "t":"action_proof", "region":"world",
  "kind":"rock", "keys":["16,15"],
  "hasCoal":false, "hasMetal":false,
  "proof":"<JWT>",
  "stateSeq":217 }
```

The JWT payload (base64url) decodes to:
```json
{
  "a":16757,                  // player id
  "iat":1782078089168,
  "exp":1782078149168,        // ~60s lifetime
  "k":"harvest.hit",
  "n":"<random nonce>",
  "s":{                       // signed state
    "kind":"rock",
    "keys":["16,15"],
    "region":"world",
    "hasCoal":0, "hasMetal":0
  },
  "v":1
}
```

Flow for harvesting a rock:
1. Move adjacent (`pos` frames with new `x,z`).
2. Begin mining: include `act:"mine"`, `mc`, `mr`, `mp` in `pos` frames.
3. Server emits `action_proof` when conditions are met.
4. Client sends `harv_hit` with that `proof` as `actionProof`.
5. Server broadcasts `res_evt` (`wear`) crediting the hit.
6. Repeat steps 2-5 until `h` reaches 0; server then broadcasts
   `res_evt` (`clear`).
7. On loot grant, server sends `inv_grant` with new backpack and `stateSeq`.
8. On XP, server sends `skill_xp`.

##### `inv_grant`

```json
{
  "t":"inv_grant",
  "backpack":{ /* full backpack object */ },
  "grant":"firepit",
  "srvDeducted":{ /* what the server removed for this grant */ },
  "stateSeq":218
}
```

##### `skill_xp`

```json
{
  "t":"skill_xp",
  "xp":{"combat":0,"woodcutting":675,"mining":125,"fishing":0,"cooking":0,"smithing":0},
  "skill":"woodcutting",
  "oldLevel":2, "newLevel":2,
  "levelsGained":0, "avgLevelsGained":0,
  "avg":1, "avgBar":0.3197916666666667
}
```

##### Other broadcasts

| `t`             | Body                                                  |
| --------------- | ----------------------------------------------------- |
| `online_total`  | `{ n: 1241 }` — periodic online count                 |
| `mp_rsv`        | `{ id, by, until }` — marketplace listing reserve     |
| `region_ack`    | `{ region: "world" }` — server confirms region switch |
| `cave_state`    | `{ st: "none" }`                                      |
| `wild_bg_rm`    | `{ id, sh }` — wilderness background object removed   |
| `arena_lb`      | `{ windowMin, rows: [...] }`                          |
| `ffp_st`        | `{ active, c, r, sid }` — firepit state push          |
| `bld`           | `{ region, k, c, r, rot, by, ownerName }`             |
| `bld_rm`        | `{ region, k, c, r, by, kit }`                        |

### Action proof — anti-cheat note

Every gameplay-impactful action requires a server-issued JWT proof:
- The proof is opaque (HS256-signed); we cannot forge new proofs.
- A proof is bound to a specific action (`k`), a specific tile set (`s.keys`),
  and a single player (`a`).
- It expires ~60s after issue (`exp`).
- The client must echo it back in the corresponding action frame.

This rules out blind action injection — to mine, we genuinely have to be
adjacent, in the right `act` state, on the right tile, and wait for the
server's permission. The agent's job is to drive the legitimate sequence
faster and more consistently than a human, not to bypass the proof.

## What we can build today (HTTP + WS)

- Real Solana sign-in via Phantom in the kintara.com tab
- Live read of `/auth/me`, `/dashboard-summary`, `/game-token-balance` for
  popup + HUD (gold, $KINS, HP, position, inventory)
- Poll `/api/world/chat?after=...` to surface chat events / mod announcements
- Poll `/api/world/merchant-campaign` to show campaign progress and trigger
  contribute when criteria met
- Poll `/api/site/stats` and `/api/token/blimp-stats` to feed the dashboard
- React to `tutorialStep` / `dailyQuest` server-side
- Drive `/api/auth/save-spawn` for non-combat re-routing
- Programmatic `/api/auth/grant-tool` if tools are missing

## Building on the WS

The bot drives gameplay by riding the game client's existing WebSocket. We
wrap `window.WebSocket` in the MAIN world (see
`extension/content/ws-bridge.js`) before the game opens its connection, so
every frame the game sends or receives is observed. We can also inject
outgoing frames on the same socket.

Capabilities now reachable:
- Real-time position + action telemetry
- Drop detection (via `res_evt` `clear` events on us)
- Skill XP tracking (`skill_xp`)
- Adjacent-rock / adjacent-tree mining + chopping (with proper
  `pos:"mine"` → `action_proof` → `harv_hit` choreography)
- Building placement (`bld`)
- Marketplace listing reserve detection (`mp_rsv`)
- Arena leaderboard live (`arena_lb`)

Still needs a longer capture or live experimentation:
- Full action vocabulary (combat, fishing, cooking, smithing, casino)
- The verbose `pos` schema's potion / cooldown timers
- WS frames for marketplace orderbook & spinner wheel
- Wilderness / PvP handshake

## Headers required for HTTP calls

```
Cookie: __Host-kintara_session=<jwt>
Origin: https://kintara.com
Referer: https://kintara.com/play   (or kintara.com/ for lobby calls)
Sec-Fetch-Site: same-origin
Accept: */*
Content-Type: application/json     (POST only)
```

The extension already runs inside the kintara.com tab via the content script,
so the cookie is sent automatically by the browser when we call from a fetch
attached to a `kintara.com` tab. No manual cookie forwarding required.
