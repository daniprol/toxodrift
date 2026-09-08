import { element } from './view';

/** Up/down move between settings; left/right edit; native Enter/Space activate. */
export function installMenuNavigation(
  cycle: (choice: 'track' | 'car', step: number) => void,
): void {
  element('garage', HTMLElement).addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }
    const dialog = element('selection-dialog', HTMLDialogElement);
    if (dialog.open) {
      const group = dialog.querySelector<HTMLElement>('.selection-grid:not([hidden])')!;
      const buttons = [...group.querySelectorAll<HTMLButtonElement>('button')];
      const index = buttons.findIndex((button) => button === document.activeElement);
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[event.key]!;
      event.preventDefault();
      buttons[(Math.max(0, index) + step + buttons.length) % buttons.length]!.focus();
      return;
    }
    const rows = [...document.querySelectorAll<HTMLElement>('[data-menu-row]')].filter(
      (row) => row.getClientRects().length > 0,
    );
    if (
      !rows.length ||
      (event.target instanceof HTMLElement && event.target.closest('#multiplayer'))
    ) {
      return;
    }
    const active = document.activeElement;
    const index = rows.findIndex((row) => row === active);
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      rows[
        (Math.max(0, index) + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
      ]!.focus();
      return;
    }
    const step = event.key === 'ArrowRight' ? 1 : -1;
    if (active?.id === 'choose-track' || active?.id === 'choose-car') {
      event.preventDefault();
      cycle(active.id === 'choose-track' ? 'track' : 'car', step);
    } else if (active instanceof HTMLInputElement && active.type === 'number') {
      event.preventDefault();
      if (step > 0) {
        active.stepUp();
      } else {
        active.stepDown();
      }
    } else if (active instanceof HTMLSelectElement) {
      event.preventDefault();
      active.selectedIndex =
        (active.selectedIndex + step + active.options.length) % active.options.length;
    } else if (active instanceof HTMLInputElement && active.type === 'checkbox') {
      event.preventDefault();
      active.checked = step > 0;
    }
  });
}
