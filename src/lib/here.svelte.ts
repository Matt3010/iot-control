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

  /** Torna il punto, o null se non si è potuto: chi ha chiesto deve saperlo. */
  locate(then?: (spot: Spot) => void): Promise<Spot | null> {
    if (this.asking) return Promise.resolve(this.spot);

    if (!this.available) {
      toast.show('Il browser dà la posizione solo su https');
      return Promise.resolve(null);
    }

    this.asking = true;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          this.asking = false;
          this.spot = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
          then?.(this.spot);
          resolve(this.spot);
        },
        (error) => {
          this.asking = false;
          toast.show(
            error.code === error.PERMISSION_DENIED
              ? 'Senza il permesso resto al centro della mappa'
              : 'Non sono riuscito a trovarti',
          );
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    });
  }

  forget(): void {
    this.spot = null;
  }
}

export const here = new Here();
