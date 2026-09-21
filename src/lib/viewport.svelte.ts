const NARROW = '(max-width: 600px)';

/** Una sola fonte per "siamo stretti": i componenti la leggono, non la interrogano. */
class Viewport {
  narrow = $state(false);

  constructor() {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(NARROW);
    this.narrow = query.matches;
    query.addEventListener('change', (event) => (this.narrow = event.matches));
  }
}

export const viewport = new Viewport();
