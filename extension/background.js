/**
 * Olympus ESPN Connector — service worker.
 *
 * ESPN's espn_s2 auth cookie is HttpOnly, so a web page can't read it. An
 * extension with the `cookies` permission + host access to espn.com can,
 * via chrome.cookies.get. This is the same mechanism FantasyPros uses.
 *
 * We only ever READ the two cookies, and only when the Olympus page (via its
 * content script) asks. Nothing is stored or sent anywhere by this worker —
 * the values go straight back to the Olympus tab that requested them.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OLYMPUS_ESPN_PING') {
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'OLYMPUS_ESPN_COOKIES') {
    Promise.all([
      chrome.cookies.get({ url: 'https://fantasy.espn.com', name: 'espn_s2' }),
      chrome.cookies.get({ url: 'https://fantasy.espn.com', name: 'SWID' }),
    ])
      .then(([s2, swid]) => {
        sendResponse({
          espnS2: s2 ? s2.value : null,
          swid: swid ? swid.value : null,
        });
      })
      .catch(() => sendResponse({ espnS2: null, swid: null }));
    return true; // async response
  }

  return false;
});
