/** Viewport fitting always works; browser fullscreen and orientation lock are enhancements. */
export function installDisplay(fullscreenButtons: HTMLButtonElement[]): void {
  const fitMenu = () =>
    document.documentElement.style.setProperty(
      '--menu-scale',
      String(Math.min(window.innerWidth / 640, window.innerHeight / 480)),
    );
  fitMenu();
  window.addEventListener('resize', fitMenu);
  for (const button of fullscreenButtons) {
    button.hidden = !document.fullscreenEnabled;
    button.addEventListener('click', () => {
      void toggleFullscreen();
    });
  }
  document.addEventListener('fullscreenchange', () => {
    for (const button of fullscreenButtons) {
      button.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
    }
    fitMenu();
  });
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen?.();
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    await orientation.lock?.('landscape').catch(() => {});
  } catch {
    // Some mobile browsers deny fullscreen; the viewport layout remains playable.
  }
}
