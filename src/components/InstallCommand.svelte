<script lang="ts">
  import { toast } from '../lib/toast.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /**
   * Il comando da incollare su quella macchina, con il tasto per copiarlo.
   *
   * Stava scritto due volte, nella pagina degli agenti e nella scheda di un
   * luogo, con due spiegazioni diverse sotto: una diceva anche perché su un
   * Mac serve una macchina virtuale, l'altra no.
   */
  let { install }: { install: string } = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(install);
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 1600);
    } catch {
      toast.show('Copia non riuscita, il comando è quello che vedi');
    }
  }
</script>

<div class="install">
  <span class="eyebrow">Da lanciare su quella macchina</span>
  <div class="cmd">
    <code>{install}</code>
    <Button look="icon" title="Copia il comando" onclick={copy}>
      <Icon name={copied ? 'check' : 'link'} />
    </Button>
  </div>
  <p class="once">
    Si vede una volta sola, perché dentro c'è il token e qui ne resta solo un'impronta.
    Vuole <b>Linux</b>: su Windows incollala dentro WSL, su Mac dentro una macchina virtuale.
    Fuori di lì Docker non sta sulla rete di casa, e l'agente i dispositivi non li vedrebbe.
  </p>
</div>

<style>
  /* il comando da incollare: si legge come un terminale perché è un terminale.
     I `min-width` non sono decorativi: dentro una griglia una cella non scende
     sotto la larghezza del suo contenuto, e una riga di `curl` senza a capo è
     larga quanto vuole — è così che sfondava il bordo della scheda. */
  .install { display: grid; gap: 6px; min-width: 0; }

  .cmd {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    padding: 4px 4px 4px 9px;
    border-radius: var(--r-sm);
    background: var(--sunken-hover);
    box-shadow: inset 0 0 0 1px var(--hairline-soft);
  }

  .cmd code {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    font-size: 11px;
    line-height: 1.5;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .once { margin: 0; font-size: 11px; line-height: 1.45; color: var(--ink-3); }

  .once b { font-weight: 600; color: var(--ink-2); }
</style>
