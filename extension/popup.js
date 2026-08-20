/**
 * The popup answers one question: is this working right now?
 *
 * Before this existed, installing the connector produced a puzzle-piece icon
 * and no feedback of any kind. If a league then failed to connect there was no
 * way to tell whether the extension was broken, or ESPN was signed out, or the
 * league id was wrong. The three failures looked identical, and only one of
 * them is the user's to fix.
 */
const ESPN_URL = 'https://fantasy.espn.com';
const APP_CONNECT = 'https://oddsgods.net/league#connect';

const el = (id) => document.getElementById(id);

async function readSession() {
  try {
    const [s2, swid] = await Promise.all([
      chrome.cookies.get({ url: ESPN_URL, name: 'espn_s2' }),
      chrome.cookies.get({ url: ESPN_URL, name: 'SWID' }),
    ]);
    return Boolean(s2?.value && swid?.value);
  } catch {
    return false;
  }
}

function render(signedIn) {
  const status = el('status');
  status.classList.remove('status--on', 'status--off');
  status.classList.add(signedIn ? 'status--on' : 'status--off');

  el('statusTitle').textContent = signedIn
    ? 'Signed in to ESPN'
    : 'Not signed in to ESPN';
  el('statusNote').textContent = signedIn
    ? 'Ready. Open Odds Gods and press Connect.'
    : 'Sign in to ESPN first, then come back here.';

  const primary = el('primary');
  const secondary = el('secondary');

  /* The button people need is not the same button in both states, so the
     order swaps rather than making them read which one applies. */
  if (signedIn) {
    primary.textContent = 'Open Odds Gods';
    primary.href = APP_CONNECT;
    secondary.textContent = 'Open ESPN';
    secondary.href = ESPN_URL;
  } else {
    primary.textContent = 'Sign in to ESPN';
    primary.href = ESPN_URL;
    secondary.textContent = 'Open Odds Gods';
    secondary.href = APP_CONNECT;
  }
}

for (const id of ['primary', 'secondary']) {
  el(id).addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: event.currentTarget.href });
    window.close();
  });
}

el('ver').textContent = `v${chrome.runtime.getManifest().version}`;
readSession().then(render);
