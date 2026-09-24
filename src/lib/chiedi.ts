import ThresholdForm from '../components/ThresholdForm.svelte';
import { devices, type Device, type DeviceTest } from './devices.svelte';
import { provaDa, scelteDi, unitaDiScelta, vuoleSoglia, type Modo } from './prove';
import { ui } from './ui.svelte';

/**
 * Chiedere una prova su un dispositivo, un passo per volta.
 *
 * Prima quale dispositivo, poi cosa di lui, e solo se è un numero la soglia.
 * Tre domande corte invece di un elenco con tutte le combinazioni: una casa
 * con venti dispositivi ne farebbe sessanta. La stessa strada serve a chi
 * scrive quando parte una scena, a chi scrive una sua condizione, e a chi
 * scrive un avviso: è la stessa domanda, e si fa nello stesso modo.
 */
export function chiediProva(
  anchor: HTMLElement,
  modo: Modo,
  fatto: (prova: DeviceTest) => void,
  /** Le scelte da non riproporre, per chi ne ha già scritte. */
  gia: (deviceId: string, scelta: string) => boolean = () => false,
): void {
  // una funzione e non un elenco, così l'elenco aperto segue chi riprende
  // a rispondere e chi smette
  const buoni = () =>
    devices.presenti
      .filter((device) => scelteDi(device, modo).some((one) => !gia(device.id, one.id)))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'))
      .map((device) => ({ id: device.id, label: device.name, salute: devices.saluteDi(device) }));

  ui.askPick(anchor, {
    title: 'Quale dispositivo?',
    options: buoni,
    onPick: (deviceId: string) => {
      const device = devices.list.find((one) => one.id === deviceId);
      if (!device) return;

      ui.askPick(anchor, {
        title: `Di «${device.name}», cosa?`,
        options: scelteDi(device, modo).filter((one) => !gia(device.id, one.id)),
        onPick: (scelta: string) => completa(device, scelta, modo, fatto),
      });
    },
  });
}

/**
 * Da una scelta fatta alla prova finita: subito, o dopo aver chiesto la
 * soglia se è un numero. Chi ha la sua strada per arrivare fin qui — gli
 * avvisi, che hanno anche «se smette di rispondere» — passa da qui per
 * l'ultimo passo.
 */
export function completa(device: Device, scelta: string, modo: Modo, fatto: (prova: DeviceTest) => void): void {
  if (!vuoleSoglia(scelta)) {
    const prova = provaDa(device, scelta);
    if (prova) fatto(prova);
    return;
  }

  const domanda = scelteDi(device, modo).find((one) => one.id === scelta)?.label.replace('…', '') ?? '';
  ui.openModal({
    title: device.name,
    view: ThresholdForm,
    props: {
      domanda,
      unit: unitaDiScelta(device, scelta),
      onsave: (soglia: number) => {
        const prova = provaDa(device, scelta, soglia);
        if (prova) fatto(prova);
      },
    },
  });
}
