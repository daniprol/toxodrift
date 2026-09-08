import { trackImageUrl } from '../assets/browser-loader';
import type { GameConfig } from '../config/schemas/game';
import type { AssetManifest, TrackDefinition } from '../config/schemas/track';
import type { RaceSetup } from '../race/types';
import { element } from './view';
import { showControlBindings } from './control-bindings';

export interface GarageSelection {
  track: TrackDefinition;
  setup: RaceSetup;
}

interface GarageOptions {
  config: GameConfig;
  manifest: AssetManifest;
  onStart: (selection: GarageSelection) => void;
}

const html = (id: string) => element(id, HTMLElement);

function selectCard(group: string, selectedId: string): void {
  html(group)
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((card) => {
      card.setAttribute('aria-pressed', String(card.dataset.id === selectedId));
    });
}

/** Owns editable garage choices and emits a snapshot when a race is requested. */
export class Garage {
  private selectedTrackId: string;
  private selectedCarId: string;

  constructor(private readonly options: GarageOptions) {
    const { config, manifest } = options;
    this.selectedTrackId = config.race.defaultTrack;
    this.selectedCarId = config.race.defaultCar;

    if (!manifest.tracks.some((track) => track.id === this.selectedTrackId)) {
      throw new Error(`Unknown default track: ${this.selectedTrackId}`);
    }

    element('laps', HTMLInputElement).value = String(config.race.laps);
    element('opponents', HTMLSelectElement).value = String(config.race.opponents);
    element('weapons', HTMLInputElement).checked = config.race.weapons;
    html('track-count').textContent = `${manifest.tracks.length} ORIGINAL CIRCUITS`;
    showControlBindings(config.controls);

    for (const track of [...manifest.tracks].sort(
      (a, b) => Number(b.id === this.selectedTrackId) - Number(a.id === this.selectedTrackId),
    )) {
      const card = document.createElement('button');
      card.className = 'track-card';
      card.type = 'button';
      card.dataset.id = track.id;

      const image = document.createElement('img');
      image.src = trackImageUrl(track.id);
      image.alt = '';
      image.loading = 'lazy';

      const caption = document.createElement('span');
      caption.textContent = track.name;

      const number = document.createElement('small');
      number.textContent = track.id.toUpperCase();
      card.append(image, caption, number);
      card.addEventListener('click', () => {
        this.selectedTrackId = track.id;
        selectCard('tracks', this.selectedTrackId);
      });
      html('tracks').append(card);
    }

    for (const car of config.cars) {
      const card = document.createElement('button');
      card.className = 'car-card';
      card.type = 'button';
      card.dataset.id = car.id;

      const name = document.createElement('strong');
      name.textContent = car.name;

      const speed = document.createElement('span');
      speed.textContent = `${car.speedMph} MPH`;
      card.append(name, speed);
      card.addEventListener('click', () => {
        this.selectedCarId = car.id;
        selectCard('cars', this.selectedCarId);
      });
      html('cars').append(card);
    }

    selectCard('tracks', this.selectedTrackId);
    selectCard('cars', this.selectedCarId);

    element('race-form', HTMLFormElement).addEventListener('submit', (event) => {
      event.preventDefault();
      this.start(false);
    });

    element('watch', HTMLButtonElement).addEventListener('click', () => this.start(true));
  }

  setLoading(loading: boolean): void {
    html('setup').setAttribute('aria-busy', String(loading));

    for (const control of html('setup').querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement
    >('button, input, select')) {
      control.disabled = loading;
    }
  }

  private start(spectate: boolean): void {
    if (!element('race-form', HTMLFormElement).reportValidity()) {
      return;
    }

    const track = this.options.manifest.tracks.find((entry) => entry.id === this.selectedTrackId)!;

    this.options.onStart({
      track,
      setup: {
        carId: this.selectedCarId,
        laps: element('laps', HTMLInputElement).valueAsNumber,
        opponents: Number(element('opponents', HTMLSelectElement).value),
        weapons: element('weapons', HTMLInputElement).checked,
        spectate,
      },
    });
  }
}
