/* Freeze the page behind a dialog or sheet, and hand back the undo.

   Inside the app shell the thing that scrolls is .app-content, not the body,
   so a body-only lock did nothing there: reaching the end of a drawer kept
   scrolling the Hub underneath it. Outside the shell (the phone home screen,
   the design fixtures) the body is the scroller. Locking both covers every
   surface the dialogs open over. */
export function lockPageScroll(): () => void {
  const targets: HTMLElement[] = [
    document.body,
    ...Array.from(document.querySelectorAll<HTMLElement>('.app-content')),
  ];
  const previous = targets.map((element) => element.style.overflow);
  targets.forEach((element) => {
    element.style.overflow = 'hidden';
  });
  return () => {
    targets.forEach((element, index) => {
      element.style.overflow = previous[index];
    });
  };
}
