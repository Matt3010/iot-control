import '@fontsource-variable/inter/wght.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import './styles/index.css';

import { mount } from 'svelte';
import App from './App.svelte';
import { misuraIlFondo } from './lib/schermo';

// prima di disegnare: la prima schermata deve già arrivare in fondo
misuraIlFondo();

export default mount(App, { target: document.getElementById('app') as HTMLElement });
