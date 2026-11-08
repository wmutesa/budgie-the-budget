// Overlapping calendar items: the one that owns the spot under the cursor
// comes to the front, worked out from where each item sits in the normal
// stack (later lanes on top), not from what is in front right now. So after
// a big item is lifted, moving onto a part where a smaller one lies lifts
// that one instead: no item can hide the others.
export function liftOnHover(e) {
  const host = e.currentTarget;
  let best = null;
  for (const b of host.querySelectorAll('[data-lane]')) {
    const r = b.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue;
    if (!best || Number(b.dataset.lane) > Number(best.dataset.lane)) best = b;
  }
  const cur = host.querySelector('.lifted');
  if (cur === best) return;
  cur?.classList.remove('lifted');
  best?.classList.add('lifted');
}
export function dropLift(e) { e.currentTarget.querySelector('.lifted')?.classList.remove('lifted'); }
