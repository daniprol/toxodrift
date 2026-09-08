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
    let restartOptions: { assets: RaceAssets; setup: RaceSetup } | null = null;

    function beginRace(options: { assets: RaceAssets; setup: RaceSetup }): void {
      session?.dispose();
      session = null;

      garageScreen.hidden = true;
      raceScreen.hidden = false;
      element('race-title', HTMLElement).textContent = options.assets.track.definition.name;
      soundButton.textContent = config.audio.enabled ? 'Sound on' : 'Sound off';

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
      element('start', HTMLButtonElement).focus();
    });

    loading.hidden = true;
    element('setup', HTMLElement).hidden = false;
  } catch (error) {
    showError(error);
  }
}
