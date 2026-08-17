/**
 * Odds Gods ESPN Connector — service worker.
 *
 * ESPN marks its `espn_s2` session cookie HttpOnly, so no web page can read it
 * (`document.cookie` will never contain it). An extension holding the
 * `cookies` permission can, and that is the entire reason this extension
 * exists. It does nothing else.
 *
 * It answers exactly two questions, and only for an Odds Gods tab:
 *   - are you installed?
 *   - what is the current ESPN session?
 *
 * It stores nothing, sends nothing anywhere, and never sees an ESPN password:
 * the values go straight back to the tab that asked.
 */

const ESPN_URL = 'https://fantasy.espn.com';

async function readEspnSession() {
  const [s2, swid] = await Promise.all([
    chrome.cookies.get({ url: ESPN_URL, name: 'espn_s2' }),
    chrome.cookies.get({ url: ESPN_URL, name: 'SWID' }),
  ]);
  return {
    espnS2: s2 ? s2.value : null,
    swid: swid ? swid.value : null,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ODDSGODS_PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  if (message?.type === 'ODDSGODS_GET_SESSION') {
    readEspnSession()
      .then(sendResponse)
      .catch(() => sendResponse({ espnS2: null, swid: null }));
    return true; // async
  }

  return false;
});
