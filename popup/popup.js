// KINSY — toolbar popup.
// The in-game HUD is the main control surface; this popup only handles setup
// and basic session actions so users don't have two competing dashboards.

const $ = (id) => document.getElementById(id);

const els = {
  body: document.body,
  subtitle: $('head-subtitle'),
  walletChip: $('wallet-chip'),
  sessionChip: $('session-chip'),
  walletValue: $('wallet-value'),
  loopValue: $('loop-value'),
  copy: $('popup-copy'),
  setupActions: $('setup-actions'),
  liveActions: $('live-actions'),
  btnConnect: $('btn-connect'),
  btnAuthorize: $('btn-authorize'),
  btnOpenGame: $('btn-open-game'),
  btnOpenHud: $('btn-open-hud'),
  btnToggle: $('btn-toggle'),
  btnRevoke: $('btn-revoke'),
  btnDisconnect: $('btn-disconnect'),
  hint: $('connect-hint'),
};

const send = (type, payload = {}) =>
  chrome.runtime.sendMessage({ type, payload });

const shorten = (addr) =>
  addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : '—';

function fmtRemain(until) {
  const ms = until - Date.now();
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = label;
}

function render(state) {
  const wallet = state?.wallet;
  const license = state?.license;
  const agent = state?.agent || {};
  const connected = !!wallet?.address;
  const authorized = !!license && license.expiresAt > Date.now();
  const running = !!agent.running;

  els.body.dataset.connected = String(connected);
  els.body.dataset.authorized = String(authorized);
  els.body.dataset.running = String(running);

  els.walletChip.textContent = connected ? '● Wallet' : '○ Wallet';
  els.walletChip.classList.toggle('is-good', connected);
  els.sessionChip.textContent = authorized ? '● Session' : '○ Session';
  els.sessionChip.classList.toggle('is-good', authorized);
  els.walletValue.textContent = shorten(wallet?.address);
  els.loopValue.textContent = agent.loop || 'idle';
  els.btnToggle.textContent = running ? 'Ⅱ Pause farming' : '▶ Start farming';

  if (!connected) {
    els.subtitle.textContent = 'connect to wake it up';
    els.copy.textContent = 'Connect Phantom, then use the in-game KINSY panel on Kintara for farming controls.';
    els.btnConnect.hidden = false;
    els.btnAuthorize.hidden = true;
    els.setupActions.hidden = false;
    els.liveActions.hidden = true;
    return;
  }

  if (!authorized) {
    els.subtitle.textContent = 'wallet connected';
    els.copy.textContent = 'Wake KINSY with a signed login message. Holder-gated modes unlock after the backend checks your $KINSY holding.';
    els.btnConnect.hidden = true;
    els.btnAuthorize.hidden = false;
    els.setupActions.hidden = false;
    els.liveActions.hidden = true;
    return;
  }

  els.subtitle.textContent = running ? 'farming live' : `session ready · ${fmtRemain(license.expiresAt)}`;
  els.copy.textContent = 'Use the in-game KINSY panel for modes, resources, feed, and roadmap controls.';
  els.setupActions.hidden = true;
  els.liveActions.hidden = false;
}

async function loadAndRender() {
  const res = await send('STATE_GET');
  render(res?.state ?? {});
}

async function withError(label, fn) {
  try {
    els.hint.textContent = '';
    await fn();
  } catch (err) {
    console.error(`[kinsy popup] ${label}`, err);
    els.hint.textContent = err?.message || String(err);
  }
}

async function openKintara() {
  const res = await send('OPEN_KINTARA');
  if (!res?.ok) throw new Error(res?.error || 'open Kintara failed');
}

els.btnConnect.addEventListener('click', () => withError('connect', async () => {
  setBusy(els.btnConnect, true, 'Waiting for Phantom…');
  const res = await send('PHANTOM_CONNECT');
  setBusy(els.btnConnect, false, 'Connect Phantom');
  if (!res?.ok) throw new Error(res?.error || 'connect failed');
  await loadAndRender();
}));

els.btnAuthorize.addEventListener('click', () => withError('authorize', async () => {
  setBusy(els.btnAuthorize, true, 'Signing…');
  const res = await send('SESSION_AUTHORIZE');
  setBusy(els.btnAuthorize, false, 'Wake KINSY');
  if (!res?.ok) throw new Error(res?.error || 'license refused');
  await loadAndRender();
}));

els.btnOpenGame.addEventListener('click', () => withError('open', openKintara));
els.btnOpenHud.addEventListener('click', () => withError('open', openKintara));

els.btnToggle.addEventListener('click', () => withError('toggle', async () => {
  const res = await send('AGENT_TOGGLE');
  if (!res?.ok) throw new Error(res?.error || 'toggle failed');
  await loadAndRender();
}));

els.btnRevoke.addEventListener('click', () => withError('revoke', async () => {
  const res = await send('SESSION_REVOKE');
  if (!res?.ok) throw new Error(res?.error || 'revoke failed');
  await loadAndRender();
}));

els.btnDisconnect.addEventListener('click', () => withError('disconnect', async () => {
  const res = await send('WALLET_DISCONNECT');
  if (!res?.ok) throw new Error(res?.error || 'disconnect failed');
  await loadAndRender();
}));

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'STATE_CHANGED') render(msg.state);
});

loadAndRender();
