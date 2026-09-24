import '@fontsource-variable/inter/wght.css';
// I fogli di Leaflet restano qui anche se lui arriva dopo, con la mappa:
// caricati dopo i nostri vincerebbero sulle correzioni di styles/map.css.
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import './styles/index.css';

import { mount } from 'svelte';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app') as HTMLElement });
