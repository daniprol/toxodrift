import type { Multiplayer, OnlineStart } from './multiplayer';
import { MultiplayerConfigSchema } from '../network/servers';
import { bitmapLabel } from './menu-font';
import { installDisplay } from '../platform/display';
import { loadManifest, loadRaceAssets, type RaceAssets } from '../assets/browser-loader';
import { parseConfig } from '../config/parse';
import { GameConfigSchema } from '../config/schemas/game';
import type { RaceSetup } from '../race/types';
import { Garage, type GarageSelection } from './garage';
import { RaceSession } from './race-session';
import { element, mountView } from './view';

/** Composes the garage and replaces the entire session on restart or track changes. */
export async function startApplication(root: HTMLElement): Promise<void> {
  mountView(root);
  installDisplay([
    element('fullscreen', HTMLButtonElement),
    element('race-fullscreen', HTMLButtonElement),
  ]);

  const loading = element('loading', HTMLElement);
  const garageScreen = element('garage', HTMLElement);
  const raceScreen = element('race-screen', HTMLElement);
  const canvas = element('race-canvas', HTMLCanvasElement);
  const soundButton = element('sound', HTMLButtonElement);

  function showError(error: unknown): void {
    loading.hidden = false;
    loading.textContent = error instanceof Error ? error.message : String(error);
    loading.classList.add('error');
  }

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}config/game.jsonc`);

    if (!response.ok) {
      throw new Error('Unable to load game configuration');
    }

    const config = parseConfig({
      text: await response.text(),
      schema: GameConfigSchema,
      name: 'game.jsonc',
    });

    const manifest = await loadManifest();
    let session: RaceSession | null = null;
    let onlineRace = false;
    let restartOptions: { assets: RaceAssets; setup: RaceSetup } | null = null;

    function beginRace(options: { assets: RaceAssets; setup: RaceSetup }): void {
      session?.dispose();
      session = null;

      garageScreen.hidden = true;
      raceScreen.hidden = false;
      element('race-title', HTMLElement).textContent = options.assets.track.definition.name;
      soundButton.textContent = config.audio.enabled ? 'Sound on' : 'Sound off';

      onlineRace = false;
      element('pause', HTMLButtonElement).hidden = false;
      element('restart', HTMLButtonElement).hidden = false;
      element('leave', HTMLButtonElement).textContent = 'Garage';
      element('network-status', HTMLElement).hidden = true;
      session = new RaceSession({ canvas, config, ...options });
      restartOptions = options;
    }

    async function startRace(selection: GarageSelection): Promise<void> {
      garage.setLoading(true);
      loading.hidden = true;

      try {
        const assets = await loadRaceAssets({ definition: selection.track, config });
        beginRace({ assets, setup: selection.setup });
      } catch (error) {
        garageScreen.hidden = false;
        raceScreen.hidden = true;
        showError(error);
      } finally {
        garage.setLoading(false);
      }
    }

    function showModes(): void {
      element('setup', HTMLElement).hidden = true;
      element('mode-menu', HTMLElement).hidden = false;
      element('single-player', HTMLButtonElement).focus();
    }
    function beginOnline(options: OnlineStart): void {
      session?.dispose();
      onlineRace = true;
      restartOptions = null;
      garageScreen.hidden = true;
      raceScreen.hidden = false;
      element('race-title', HTMLElement).textContent = options.assets.track.definition.name;
      element('pause', HTMLButtonElement).hidden = true;
      element('restart', HTMLButtonElement).hidden = true;
      element('leave', HTMLButtonElement).textContent = 'Multiplayer';
      // Server owns gameplay settings; personal controls, colors and audio stay local.
      const onlineConfig = {
        ...options.config,
        controls: config.controls,
        audio: config.audio,
        display: config.display,
      };
      session = new RaceSession({
        canvas,
        assets: options.assets,
        config: onlineConfig,
        setup: {
          carId: options.settings.carId,
          laps: options.settings.laps,
          opponents: options.settings.participants - 1,
          weapons: options.settings.weapons,
        },
        online: {
          room: options.room,
          racerId: options.racerId,
          inputRate: options.inputRate,
          interpolationMs: options.interpolationMs,
        },
      });
    }
    // Multiplayer config is loaded on demand, so offline play has no server dependency.
    let multiplayer: Multiplayer | undefined;
    element('multiplayer-button', HTMLButtonElement).addEventListener('click', () => {
      void (async () => {
        if (!multiplayer) {
          const { Multiplayer } = await import('./multiplayer');
          const response = await fetch(`${import.meta.env.BASE_URL}config/multiplayer.jsonc`);
          if (!response.ok) {
            throw new Error('Unable to load multiplayer configuration');
          }
          const multiplayerConfig = parseConfig({
            text: await response.text(),
            schema: MultiplayerConfigSchema,
            name: 'multiplayer.jsonc',
          });
          multiplayer = new Multiplayer({
            config: multiplayerConfig,
            manifest,
            onStart: beginOnline,
            onMenu: showModes,
          });
        }
        loading.hidden = true;
        element('mode-menu', HTMLElement).hidden = true;
        multiplayer.show();
      })().catch(showError);
    });
    element('single-player', HTMLButtonElement).addEventListener('click', () => {
      loading.hidden = true;
      element('mode-menu', HTMLElement).hidden = true;
      element('setup', HTMLElement).hidden = false;
      element('start', HTMLButtonElement).focus();
    });
    element('single-back', HTMLButtonElement).addEventListener('click', showModes);
    for (const id of ['single-player', 'multiplayer-button']) {
      bitmapLabel(element(id, HTMLButtonElement));
    }

    const garage = new Garage({
      config,
      manifest,
      onStart: (selection) => void startRace(selection),
    });

    for (const id of ['pause', 'resume']) {
      element(id, HTMLButtonElement).addEventListener('click', () => session?.togglePause());
    }

    soundButton.addEventListener('click', () => {
      soundButton.textContent = session?.toggleMute() ? 'Sound off' : 'Sound on';
    });

    element('restart', HTMLButtonElement).addEventListener('click', () => {
      if (restartOptions) {
        beginRace(restartOptions);
      }
    });

    element('leave', HTMLButtonElement).addEventListener('click', () => {
      session?.dispose();
      session = null;
      restartOptions = null;
      garageScreen.hidden = false;
      raceScreen.hidden = true;
      if (onlineRace) {
        onlineRace = false;
        void multiplayer?.leave().then(() => multiplayer?.show());
      } else {
        element('start', HTMLButtonElement).focus();
      }
    });

    loading.hidden = true;
    showModes();
  } catch (error) {
    showError(error);
  }
}
