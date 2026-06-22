// KINSY — Phantom bridge (MAIN world).
// Runs in the page's world so it can access window.solana directly.
// Talks to the isolated content script via window.postMessage.

(() => {
  const NS = 'kinsai';
  const log = (...a) => console.log(`[${NS}/bridge]`, ...a);

  function getPhantom() {
    const p = window?.phantom?.solana || window?.solana;
    if (p?.isPhantom) return p;
    return null;
  }

  function reply(id, ok, data) {
    window.postMessage({ src: NS, dir: 'bridge>cs', id, ok, ...(ok ? { data } : { error: data }) }, '*');
  }

  async function handle(req) {
    const phantom = getPhantom();
    if (!phantom) throw new Error('Phantom not detected on this page. Install Phantom and reload.');

    switch (req.op) {
      case 'CONNECT': {
        const res = await phantom.connect({ onlyIfTrusted: !!req.onlyIfTrusted });
        return { publicKey: res.publicKey.toString() };
      }
      case 'DISCONNECT': {
        await phantom.disconnect();
        return { ok: true };
      }
      case 'SIGN_MESSAGE': {
        const enc = new TextEncoder().encode(req.message);
        const res = await phantom.signMessage(enc, 'utf8');
        const sig = res?.signature ?? res; // some versions return raw bytes
        const bytes = sig instanceof Uint8Array ? sig : new Uint8Array(sig);
        // base64
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return {
          signature: btoa(bin),
          publicKey: phantom.publicKey?.toString?.() ?? null,
        };
      }
      default:
        throw new Error(`unknown op: ${req.op}`);
    }
  }

  window.addEventListener('message', async (event) => {
    const msg = event.data;
    if (!msg || msg.src !== NS || msg.dir !== 'cs>bridge' || msg.ch) return;
    if (!msg.id || !msg.op) return;
    try {
      const data = await handle(msg);
      reply(msg.id, true, data);
    } catch (err) {
      log('error', err);
      reply(msg.id, false, err?.message || String(err));
    }
  });

  // Announce readiness so the content script knows we're loaded.
  window.postMessage({ src: NS, dir: 'bridge>cs', event: 'READY', phantom: !!getPhantom() }, '*');
  log('ready, phantom=', !!getPhantom());
})();
