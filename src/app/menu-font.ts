// Original 32×32 menu glyph advances, from dRally fonts.c (MIT).
const ADVANCES = [
  20, 9, 14, 20, 21, 24, 21, 10, 12, 11, 16, 21, 9, 20, 8, 19, 21, 10, 20, 19, 20, 20, 19, 18, 19,
  18, 8, 9, 16, 21, 16, 15, 22, 22, 21, 20, 22, 19, 18, 22, 22, 10, 17, 21, 19, 27, 21, 22, 20, 22,
  21, 20, 20, 22, 24, 31, 22, 23, 19, 12, 20, 12, 20, 19, 9, 20, 18, 17, 18, 16, 15, 19, 18, 8, 14,
  19, 16, 22, 18, 18, 16, 18, 18, 17, 16, 18, 19, 26, 18, 19, 16, 11, 6, 11, 15, 20,
];

/** Real bitmap lettering with one accessible label, rather than announced individual letters. */
export function bitmapLabel(element: HTMLElement): void {
  const text = element.textContent ?? '';
  element.setAttribute('aria-label', text);
  const label = document.createElement('span');
  label.className = 'bitmap-text';
  label.setAttribute('aria-hidden', 'true');
  for (const character of text) {
    const index = character.charCodeAt(0) - 32;
    const glyph = document.createElement('i');
    glyph.style.width = `${ADVANCES[index] ?? 20}px`;
    glyph.style.backgroundPosition = `0 -${index * 32}px`;
    label.append(glyph);
  }
  element.replaceChildren(label);
}
