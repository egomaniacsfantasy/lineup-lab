/**
 * Olympus ESPN Connector — content script (runs only on the Olympus site).
 *
 * Bridges the Olympus connect page and the extension's service worker:
 *   page  --window.postMessage-->  content script  --chrome.runtime-->  worker
 *   worker --> content script --window.postMessage--> page
 *
 * The page never touches chrome APIs directly; the worker only answers the
 * Olympus tab. Cookies are handed straight to the page, which stores them
 * on the user's device — nothing is sent to any third party.
 */
(function () {
  // Announce the extension's presence so the page can show the right CTA.
  window.postMessage({ source: 'olympus-ext', type: 'OLYMPUS_ESPN_READY' }, window.location.origin);

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'olympus-page') return;

    if (data.type === 'OLYMPUS_ESPN_PING') {
      chrome.runtime.sendMessage({ type: 'OLYMPUS_ESPN_PING' }, () => {
        window.postMessage(
          { source: 'olympus-ext', type: 'OLYMPUS_ESPN_READY' },
          window.location.origin,
        );
      });
      return;
    }

    if (data.type === 'OLYMPUS_ESPN_REQUEST') {
      chrome.runtime.sendMessage({ type: 'OLYMPUS_ESPN_COOKIES' }, (response) => {
        window.postMessage(
          {
            source: 'olympus-ext',
            type: 'OLYMPUS_ESPN_RESULT',
            espnS2: response ? response.espnS2 : null,
            swid: response ? response.swid : null,
          },
          window.location.origin,
        );
      });
    }
  });
})();
