import { trackImageUrl } from '../assets/browser-loader';
import type { GameConfig } from '../config/schemas/game';
import type { AssetManifest, TrackDefinition } from '../config/schemas/track';
import type { RaceSetup } from '../race/types';
import { element } from './view';
import { showControlBindings } from './control-bindings';
import { installMenuNavigation } from './menu-navigation';
import { bitmapLabel } from './menu-font';

export interface GarageSelection {
  track: TrackDefinition;
  setup: RaceSetup;
}
interface GarageOptions {
  config: GameConfig;
  manifest: AssetManifest;
  onStart: (selection: GarageSelection) => void;
}
type Choice = 'track' | 'car';
const html = (id: string) => element(id, HTMLElement);

/** Owns race choices; the dialog and arrows edit the same selection. */
export class Garage {
  private trackIndex: number;
  private carIndex: number;
  private loading = false;

  constructor(private readonly options: GarageOptions) {
    const { config, manifest } = options;
    this.trackIndex = manifest.tracks.findIndex((track) => track.id === config.race.defaultTrack);
    this.carIndex = config.cars.findIndex((car) => car.id === config.race.defaultCar);
    if (this.trackIndex < 0 || this.carIndex < 0) {
      throw new Error('Unknown default circuit or car');
    }
    element('laps', HTMLInputElement).value = String(config.race.laps);
    element('opponents', HTMLSelectElement).value = String(config.race.opponents);
    element('weapons', HTMLInputElement).checked = config.race.weapons;
    showControlBindings(config.controls);

    for (const choice of ['track', 'car'] as const) {
      const entries = choice === 'track' ? manifest.tracks : config.cars;
      entries.forEach((entry, index) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.dataset.id = entry.id;
        card.textContent = entry.name;
        if ('speedMph' in entry) {
          const portrait = document.createElement('img');
          portrait.src = this.portraitUrl(entry.id);
          portrait.alt = '';
          const speed = document.createElement('small');
          speed.textContent = `${entry.speedMph} mph`;
          card.prepend(portrait);
          card.append(speed);
        }
        card.addEventListener('click', () => {
          if (choice === 'track') {
            this.trackIndex = index;
          } else {
            this.carIndex = index;
          }
          this.refresh();
          element('selection-dialog', HTMLDialogElement).close();
        });
        html(`${choice}s`).append(card);
      });
      html(`choose-${choice}`).addEventListener('click', () => this.openSelection(choice));
      for (const [direction, step] of [
        ['previous', -1],
        ['next', 1],
      ] as const) {
        html(`${direction}-${choice}`).addEventListener('click', () => this.cycle(choice, step));
      }
    }
    html('close-selection').addEventListener('click', () =>
      element('selection-dialog', HTMLDialogElement).close(),
    );
    element('race-form', HTMLFormElement).addEventListener('submit', (event) => {
      event.preventDefault();
      this.start(false);
    });
    html('watch').addEventListener('click', () => this.start(true));
    installMenuNavigation((choice, step) => this.cycle(choice, step));
    for (const id of ['start', 'watch', 'choose-track', 'choose-car']) {
      bitmapLabel(html(id));
    }
    for (const label of html('race-form').querySelectorAll<HTMLElement>('.menu-setting > span')) {
      const control = label.parentElement?.querySelector('input, select');
      if (control && !control.hasAttribute('aria-label')) {
        control.setAttribute('aria-label', label.textContent ?? '');
      }
      bitmapLabel(label);
      label.removeAttribute('aria-label');
      label.setAttribute('aria-hidden', 'true');
    }
    this.refresh();
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    html('setup').setAttribute('aria-busy', String(loading));
    for (const control of html('setup').querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement
    >('button, input, select')) {
      control.disabled = loading;
    }
  }

  private portraitUrl(id: string): string {
    return `${import.meta.env.BASE_URL}assets/original/portrait-${id}.png`;
  }

  private cycle(choice: Choice, step: number): void {
    if (this.loading) {
      return;
    }
    if (choice === 'track') {
      this.trackIndex =
        (this.trackIndex + step + this.options.manifest.tracks.length) %
        this.options.manifest.tracks.length;
    } else {
      this.carIndex =
        (this.carIndex + step + this.options.config.cars.length) % this.options.config.cars.length;
    }
    this.refresh();
  }

  private openSelection(choice: Choice): void {
    html('tracks').hidden = choice !== 'track';
    html('cars').hidden = choice !== 'car';
    html('selection-title').textContent = choice === 'track' ? 'Circuit' : 'Car';
    element('selection-dialog', HTMLDialogElement).showModal();
    html(`${choice}s`).querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }

  private refresh(): void {
    const track = this.options.manifest.tracks[this.trackIndex]!;
    const car = this.options.config.cars[this.carIndex]!;
    html('track-name').textContent = track.name;
    html('car-name').textContent = car.name;
    html('preview-track-name').textContent = track.name;
    html('preview-car-name').textContent = car.name;
    html('car-speed').textContent = `${car.speedMph} mph`;
    element('track-preview', HTMLImageElement).src = trackImageUrl(track.id);
    element('car-preview', HTMLImageElement).src = this.portraitUrl(car.id);
    for (const [group, selected] of [
      ['tracks', track.id],
      ['cars', car.id],
    ] as const) {
      html(group)
        .querySelectorAll<HTMLButtonElement>('button')
        .forEach((card) => card.setAttribute('aria-pressed', String(card.dataset.id === selected)));
    }
  }

  private start(spectate: boolean): void {
    if (this.loading || !element('race-form', HTMLFormElement).reportValidity()) {
      return;
    }
    this.options.onStart({
      track: this.options.manifest.tracks[this.trackIndex]!,
      setup: {
        carId: this.options.config.cars[this.carIndex]!.id,
        laps: element('laps', HTMLInputElement).valueAsNumber,
        opponents: Number(element('opponents', HTMLSelectElement).value),
        weapons: element('weapons', HTMLInputElement).checked,
        spectate,
      },
    });
  }
}
