import { toast } from './toast.svelte';

export interface Spot {
  lat: number;
  lng: number;
  /** Quanto è larga l'incertezza, in metri: il cerchio intorno al puntino. */
  accuracy: number;
}

/**
 * Dove sei. Il browser la dà solo se glielo chiedi tu con un gesto, e solo
 * in https (o su localhost): senza, le distanze restano quelle dal centro
 * della mappa.
 */
class Here {
  spot = $state<Spot | null>(null);
  asking = $state(false);

  get available(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;
  }

  locate(then?: (spot: Spot) => void): void {
    if (this.asking) return;

    if (!this.available) {
      toast.show('Il browser dà la posizione solo su https');
      return;
    }

    this.asking = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.asking = false;
        this.spot = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
        then?.(this.spot);
      },
      (error) => {
        this.asking = false;
        toast.show(
          error.code === error.PERMISSION_DENIED
            ? 'Senza il permesso resto al centro della mappa'
            : 'Non sono riuscito a trovarti',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  forget(): void {
    this.spot = null;
  }
}

export const here = new Here();
