<script lang="ts">
  import { ui } from '../lib/ui.svelte';
  import { viewport } from '../lib/viewport.svelte';
  import Icon from './Icon.svelte';

  /**
   * Un luogo si aggiunge indicando dove sta: sul grande si tocca la mappa,
   * sul telefono — dove la mappa non c'è — si cerca l'indirizzo, che è poi
   * quello che si fa da fermi in strada quando il posto ce l'hai davanti e
   * il nome della via ce l'hai in testa.
   */
  const add = (): void => {
    if (viewport.narrow) ui.paletteOpen = true;
    else ui.setPicking(!ui.picking);
  };
</script>

<button id="add-btn" type="button" class:active={ui.picking} onclick={add}>
  <Icon name="plus" />
  <span class="add-label">{ui.picking ? 'Annulla' : 'Aggiungi luogo'}</span>
</button>

<style>
/* HUD
   What floats free of the panels: the add button, the picking hint and the
   toast that carries an undo. */

/* ------------------------------------------------------------- add button */

#add-btn {
  position: absolute;
  right: 18px;
  bottom: calc(22px + env(safe-area-inset-bottom));
  z-index: var(--z-hud);
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 50px;
  padding: 0 22px 0 18px;
  border: 0;
  border-radius: 99px;
  background: var(--accent-grad);
  color: var(--on-accent);
  font-size: 14.5px;
  font-weight: 560;
  letter-spacing: -0.012em;
  box-shadow: var(--shadow-3), inset 0 1px 0 rgb(255 255 255 / 0.16);
  transition: transform 0.18s var(--ease), box-shadow 0.25s, background 0.25s;
  animation: rise 0.5s 0.05s var(--ease);
}

#add-btn:hover { transform: translateY(-2px); box-shadow: var(--shadow-3), 0 0 0 6px color-mix(in srgb, var(--accent) 8%, transparent); }

#add-btn:active { transform: translateY(0); }

#add-btn :global(.ico) { width: 19px; height: 19px; stroke-width: 2; transition: transform 0.3s var(--ease); }

#add-btn.active {
  background: linear-gradient(180deg, #d94a3d 0%, #b93225 100%);
  color: #fff;
}

#add-btn.active :global(.ico) { transform: rotate(135deg); }

@media (max-width: 600px) {
  #add-btn {
      left: 12px;
      right: 12px;
      bottom: calc(12px + env(safe-area-inset-bottom));
      justify-content: center;
    }

  /* an open sheet fills the bottom: the add button would sit under it */
    :global(.sheet-open) #add-btn { display: none; }
}
</style>
