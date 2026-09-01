/**
 * The welcome page, told by the browser rather than guessing.
 *
 * This page used to be three static instructions, and the first was "pin the
 * extension" — a thing nobody has to do, in the position of the thing
 * everybody has to do. Somebody arriving here already signed in to ESPN was
 * given a list where the only item that mattered was the last one.
 *
 * The extension can simply look. So step one ticks itself off when ESPN is
 * already signed in, and the page says which of the two things is actually
 * left. Same reasoning as the popup beside it: the three ways this can fail
 * look identical from the outside, and only one of them is the user's to fix.
 */
const ESPN_URL = 'https://fantasy.espn.com';

const el = (id) => document.getElementById(id);

async function espnSignedIn() {
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
  el('lede').textContent = signedIn
    ? 'You are signed in to ESPN already, so there is one thing left.'
    : 'Two things and your ESPN league is priced. You only do this once.';

  const step = el('stepSignIn');
  step.classList.toggle('done', signedIn);

  el('signInMark').textContent = signedIn ? '✓' : '1';
  el('signInTitle').textContent = signedIn ? 'Signed in to ESPN' : 'Sign in to ESPN';
  el('signInBody').textContent = signedIn
    ? 'Your ESPN session is live in this browser. Nothing to do here.'
    : "On ESPN's own site, in this browser. Your password goes to ESPN and never touches Odds Gods.";

  /* The button for a step that is done is a button that undoes nothing and
     invites a detour, so it goes. */
  el('signInAction').hidden = signedIn;
}

/* Re-checked rather than read once: people go and sign in with this tab still
   open, and a page that needs a reload to notice is a page that tells them the
   thing they just did did not work. */
void espnSignedIn().then(render);
setInterval(() => void espnSignedIn().then(render), 3000);
