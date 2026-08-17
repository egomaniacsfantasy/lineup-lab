/**
 * Odds Gods ESPN Connector — content script.
 *
 * Runs only on Odds Gods pages. Relays between the page and the service
 * worker, so the page never touches a chrome API:
 *
 *   page  --postMessage-->  content script  --runtime-->  worker
 *   worker --> content script --postMessage--> page
 *
 * Announces itself on load AND answers pings, so the connect screen can flip
 * to "installed" the moment the user finishes, with no page reload.
 */
(() => {
  const announce = () => {
    window.postMessage(
      { source: 'oddsgods-ext', type: 'ODDSGODS_READY' },
      window.location.origin,
    );
  };

  announce();

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'oddsgods-page') return;

    if (data.type === 'ODDSGODS_PING') {
      announce();
      return;
    }

    if (data.type === 'ODDSGODS_GET_SESSION') {
      chrome.runtime.sendMessage({ type: 'ODDSGODS_GET_SESSION' }, (response) => {
        window.postMessage(
          {
            source: 'oddsgods-ext',
            type: 'ODDSGODS_SESSION',
            espnS2: response ? response.espnS2 : null,
            swid: response ? response.swid : null,
          },
          window.location.origin,
        );
      });
    }
  });
})();
