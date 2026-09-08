import markup from './view.html?raw';

export function mountView(root: HTMLElement): void {
  root.innerHTML = markup;
  for (const name of ['menu-background', 'menu-font']) {
    root.style.setProperty(
      `--${name}`,
      `url("${import.meta.env.BASE_URL}assets/original/${name}.png")`,
    );
  }
}

export function element<T extends HTMLElement>(id: string, type: { new (...args: never[]): T }): T {
  const value = document.getElementById(id);

  if (!(value instanceof type)) {
    throw new Error(`Missing UI element: ${id}`);
  }

  return value;
}
