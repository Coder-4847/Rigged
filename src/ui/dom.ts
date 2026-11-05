/** Tiny hyperscript helper: h('div.card', {onclick}, child, 'text'). */
type Child = Node | string | false | null | undefined;
export function h<T extends HTMLElement = HTMLElement>(spec: string, attrs: Record<string, unknown> = {}, ...kids: Child[]): T {
  const [tag, ...cls] = spec.split('.');
  const el = document.createElement(tag) as T;
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false || v === null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.classList.add(...String(v).split(' '));
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== false && c != null) el.append(c);
  return el;
}

export const fmt = (t: number): string => {
  const m = Math.floor(t / 60);
  return `${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
};

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export const STAR_SVG =
  '<svg viewBox="-1 -1 2 2"><path d="M0 -0.9 L0.27 -0.3 L0.9 -0.28 L0.4 0.12 L0.58 0.78 L0 0.4 L-0.58 0.78 L-0.4 0.12 L-0.9 -0.28 L-0.27 -0.3Z" fill="currentColor" stroke="rgba(0,0,0,.35)" stroke-width="0.1" stroke-linejoin="round"/></svg>';

export function starIcon(on: boolean): HTMLElement {
  const s = h(on ? 'span.star-ico.on' : 'span.star-ico');
  s.innerHTML = STAR_SVG;
  return s;
}
