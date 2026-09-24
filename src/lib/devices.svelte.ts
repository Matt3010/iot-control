import { rimpiazza, ritira } from './rimpiazza';
import { nomeAzione } from './azioni';
import { daQuando, healthOf, salute, type Salute } from './health';
import { api } from './api';
import { toast } from './toast.svelte';
import type { Capability, DeviceValue, Health, LinkedAccount, PairingStep } from './types';
import type { CatalogEntry } from '../../shared/protocol';

/** Un agente, per come lo vede il sito: il servizio installato in quel posto. */
export interface Agent {
  id: string;
  name: string;
  /** Collegata adesso, non "l'ultima volta che". */
  online: boolean;
  lastSeenAt: string | null;
  devices: number;
  createdAt: string;
}

export interface Device {
  /** Se vuoi essere avvisato quando questo smette di rispondere. */
  watch?: boolean;
  id: string;
  agentId: string;
  name: string;
  capabilities: Capability[];
  online: boolean;
  state: Record<string, DeviceValue>;
  lastSeenAt: string;
  /**
   * Da quando l'agente non lo racconta più. Resta con le sue scene e i suoi
   * avvisi, e se lo ricolleghi torna com'era; se ne va solo con «Rimuovi».
   */
  goneAt?: string;
}

/** Una riga del registro di un agente: cosa è successo, e quando. */
export interface LogEntry {
  id: string;
  agentId: string;
  at: string;
  kind: 'up' | 'down' | 'inventory' | 'device-up' | 'device-down' | 'command' | 'scene' | 'account';
  subject?: string;
  detail?: string;
  ok?: boolean;
  who?: string;
}

/** Una riga di una scena: a chi, cosa, e con che valore. */
export interface SceneStep {
  deviceId?: string;
  code?: string;
  value?: DeviceValue;
  /** Le parole di un avviso. Le righe che ce le hanno non muovono niente. */
  notify?: string;
  /** Un'altra scena da far partire da qui. */
  scene?: string;
  /** Secondi da aspettare prima di questa riga. Zero: insieme alla precedente. */
  after?: number;
}

/**
 * Quando una scena parte da sola.
 *
 * Un'ora come la si legge su un orologio e i giorni in cui vale. Il fuso è
 * quello dell'account, non scritto qui: «le sette di sera» restano le sette
 * anche dopo il cambio dell'ora, e chi guarda da un'altra città le legge
 * all'ora di chi le ha scritte.
 */
export interface Timing {
  at: string;
  /** Un giorno solo, e poi basta: `2026-09-25`. Con questo i giorni tacciono. */
  on?: string;
  /** Da domenica (0) a sabato (6). Vuoto vuol dire tutti i giorni. */
  days: number[];
  /** Sospesa senza cancellarla, per l'estate o per una settimana fuori. */
  off?: boolean;
}

/** Come si guarda il valore di un dispositivo: preciso, sopra o sotto. */
export type Op = 'is' | 'above' | 'below';

export interface DeviceTest {
  deviceId: string;
  code: string;
  op: Op;
  value: string | number;
}

/** Quello che fa partire una scena da sola: ne basta uno. */
export type SceneTrigger = DeviceTest & { id?: string };

/** Quello che deve essere vero perché parta da sola: tutto. */
export type SceneCondition =
  | ({ id?: string; kind: 'device' } & DeviceTest)
  | { id?: string; kind: 'days'; days: number[] }
  | { id?: string; kind: 'hours'; from: string; to: string }
  | { id?: string; kind: 'dates'; from: string; to: string }
  | SceneConditionGroup;

/** Più condizioni legate: tutte (`all`) o almeno una (`any`). Può contenerne altri. */
export interface SceneConditionGroup {
  id?: string;
  kind: 'group';
  match: 'all' | 'any';
  items: SceneCondition[];
}

/**
 * Più cose che partono insieme, ognuna con la sua azione.
 *
 * «Sera» chiude le tende e accende l'abat-jour: due azioni diverse su due
 * cose diverse, premute una volta. Non ha uno stato suo — due tende possono
 * stare una aperta e una chiusa, e per quello non c'è una parola sola.
 */
export interface Scene {
  id: string;
  name: string;
  steps: SceneStep[];
  when?: Timing;
  triggers?: SceneTrigger[];
  only?: SceneConditionGroup;
  /** L'ultima volta che è partita, a mano o da sola. Mai, se manca. */
  ranAt?: string;
  /** Se stava andando quando la pagina l'ha chiesta. Dopo lo dice `devices.running`. */
  corre?: { run: string; at: number; of: number; resta?: number };
  /**
   * Quando il fusibile l'ha fermata: ripartiva da sola di continuo. Resta
   * ferma, orario compreso, finché qualcuno non la cambia o non la fa
   * partire a mano.
   */
  blownAt?: string;
}

/**
 * Una regola scritta su un dispositivo: «quando diventa così, dimmelo».
 *
 * `says` è come si legge, e la scrive il server quando la regola nasce: le
 * parole di un dispositivo le sa lui, e riscriverle qui vorrebbe dire due
 * frasi che possono divergere.
 */
export interface Rule {
  id: string;
  deviceId: string;
  code: string;
  /** Preciso, sopra o sotto: le regole di prima sono tutte precise. */
  op?: Op;
  becomes: string;
  says: string;
  off?: boolean;
}

/** Un agente appena creato: il token si vede una volta sola, e poi mai più. */
export interface NewAgent {
  agent: Agent;
  token: string;
  /** La riga da incollare su quella macchina. */
  install: string;
}

/**
 * Quanto un comando resta fermo dopo essere andato a buon fine: il tempo di
 * un dito che rimbalza, non di più.
 */
const SETTLE_MS = 500;

/**
 * E quanto resta fermo quando non è arrivata risposta. Qui il tempo serve a
 * un'altra cosa: a non far ripremere finché non si sa com'è finita davvero.
 */
const UNSURE_MS = 6000;

/**
 * Quello che si accende, e gli agenti da cui arriva. Lo stato non si chiede:
 * si riceve. Un filo solo aperto verso il server porta ogni cambiamento mentre
 * accade — che lo abbia premuto tu da qui, qualcun altro dall'app Smart Life,
 * o l'interruttore sul muro.
 */
class Devices {
  agents = $state<Agent[]>([]);
  list = $state<Device[]>([]);
  /** Finché è vero l'elenco non è vuoto: non si sa ancora. */
  loading = $state(true);

  /**
   * I comandi partiti e non ancora confermati, come `dev-1:power`. Serve a
   * mettere l'attesa sul controllo che l'ha chiesta, e non sulla pagina.
   */
  busy = $state<string[]>([]);

  /** Le scene: più cose che partono a un colpo solo. */
  scenes = $state<Scene[]>([]);

  /**
   * I registri aperti, per agente. Ce n'è uno solo per volta di solito, ma la
   * chiave è l'agente: così una riga nuova sa a quale registro appartiene, e
   * quelli chiusi non si ricaricano per niente.
   */
  logs = $state<Record<string, LogEntry[]>>({});

  byId(id: string | undefined): Device | undefined {
    return id ? this.list.find((device) => device.id === id) : undefined;
  }

  agentOf(device: Device): Agent | undefined {
    return this.agents.find((agent) => agent.id === device.agentId);
  }

  /** I dispositivi di un agente, per mostrarli raggruppati come stanno davvero. */
  ofAgent(agentId: string): Device[] {
    return this.list.filter((device) => device.agentId === agentId);
  }

  isBusy(deviceId: string, code: string): boolean {
    return this.busy.includes(`${deviceId}:${code}`);
  }

  /**
   * L'interruttore di un dispositivo: la prima levetta che non è
   * un'impostazione né un tasto a impulso, comunque si chiami.
   *
   * Si guardava `power` e basta. Una presa che dice `on`, o una ciabatta con
   * `switch_1`, restavano spente per sempre; e contando tutto quello che non
   * era un sensore, telecamere, tende e pulsanti finivano nel totale come
   * cose spente — «1 di 7 accesi» in una casa con due luci. A impulso
   * «acceso» dura mezzo secondo e non dice niente di quello che comanda; una
   * spia o lo stato dopo un blackout non sono la cosa accesa.
   */
  interruttore(device: Device | undefined): Capability | undefined {
    return (device?.capabilities as Capability[] | undefined)?.find(
      (one) => one.kind === 'switch' && !one.setting && !one.pulse,
    );
  }

  /** Acceso o spento, per chi deve solo saperlo: la riga, il pallino. */
  isOn(device: Device | undefined): boolean {
    const levetta = this.interruttore(device);
    return !!levetta && device?.online === true && device.state[levetta.code] === true;
  }

  /**
   * Se sotto quegli agenti c'è qualcosa di acceso. È quello che serve a un pin
   * su una mappa: «al locale è rimasto acceso qualcosa» si legge da lontano,
   * «la lampadina 7 è al 40%» no. Un luogo può averne più d'uno, e basta che
   * uno solo abbia qualcosa acceso.
   */
  anyOn(agentIds: string[] | undefined): boolean {
    if (!agentIds?.length) return false;
    const sotto = this.#accesi.split(' ');
    return agentIds.some((id) => sotto.includes(id));
  }

  /*
   * Gli agenti sotto cui è acceso qualcosa, in una stringa.
   *
   * Ogni lettura di un sensore riscrive lo stato di un dispositivo, e chi
   * chiedeva `anyOn` guardava dentro a tutti: sulla mappa ogni grado in più
   * di un termometro ridisegnava tutti i pin, luoghi per dispositivi. Qui
   * lo stato si guarda una volta per cambiamento, e fuori arriva una stringa
   * che resta uguale — e non sveglia nessuno — finché non si accende o si
   * spegne qualcosa.
   */
  #accesi = $derived(
    [...new Set(this.list.filter((device) => this.isOn(device)).map((device) => device.agentId))].sort().join(' '),
  );


  /**
   * Come stanno gli agenti di un luogo, in una parola sola — quella che il
   * pin porta sulla mappa:
   *
   * - `live`     tutto collegato e tutto risponde
   * - `degraded` collegato, ma qualcosa là dentro non risponde
   * - `lost`     un agente che si era collegato adesso non c'è più
   * - `new`      mai collegato: non è un guasto, è da installare
   */
  health(agentIds: string[] | undefined): Health | null {
    const mine = (agentIds ?? []).map((id) => this.agents.find((agent) => agent.id === id)).filter((a) => !!a);
    // La regola sta in un file suo, senza rune: un colore che si guarda tutti
    // i giorni dev'essere verificabile senza aprire un browser.
    return healthOf(mine, this.presenti);
  }

  /**
   * I dispositivi che ci sono, senza quelli spariti. Uno sparito non è un
   * guasto da segnare sul pin, e non si sceglie per una scena nuova: resta
   * solo nella sua scheda, ad aspettare di tornare o di essere rimosso.
   */
  get presenti(): Device[] {
    return this.list.filter((device) => !device.goneAt);
  }

  /** «Rimuovi», per uno sparito: se ne va con le righe, le partenze e gli avvisi che lo nominavano. */
  async remove(device: Device): Promise<void> {
    await api.delete(`/devices/${device.id}`);
    this.list = this.list.filter((one) => one.id !== device.id);
    await this.load();
  }

  /** Se l'agente di un dispositivo è collegato adesso. */
  agentUp(agentId: string): boolean {
    return this.agents.find((agent) => agent.id === agentId)?.online ?? false;
  }

  /** Se risponde, con le parole per dirlo. Dipende anche dal suo agente. */
  saluteDi(device: Device | undefined): Salute {
    // sparito non è «non risponde»: non c'è, e si dice da quando
    if (device?.goneAt) return { state: 'unknown', says: `Non c’è più ${daQuando(device.goneAt)}` };
    return salute(device ? this.agentUp(device.agentId) : false, device?.online ?? false);
  }

  /** Quanti ne sono accesi su quanti se ne possono accendere: solo chi ha un interruttore. */
  tally(agentId: string): { on: number; total: number } {
    const theirs = this.ofAgent(agentId).filter((device) => !device.goneAt && !!this.interruttore(device));
    return { on: theirs.filter((device) => this.isOn(device)).length, total: theirs.length };
  }

  /**
   * Perché l'ultima lettura non è arrivata, finché la prossima non ce la fa.
   * Quello che c'era resta sullo schermo: è vecchio, non sbagliato.
   */
  loadError = $state<string | null>(null);

  /**
   * Se almeno una lettura è arrivata. Senza, quello che c'è sullo schermo
   * non è vecchio: non c'è proprio, e va detto in un altro modo.
   */
  letto = $state(false);

  /** I dispositivi di cui è arrivato un evento senza che fossero nell'elenco. */
  #ignoti = new Set<string>();

  #giro: Promise<void> | null = null;
  #coda: Promise<void> | null = null;

  /**
   * Rileggere agenti, dispositivi e scene.
   *
   * Le richieste arrivano a mucchi — il filo dice «agenti» e «dispositivi»
   * insieme, e chi rimuove un dispositivo rilegge anche lui mentre il filo
   * sta già rileggendo — e ognuna erano tre richieste al server. Adesso ce
   * n'è una in corso e al massimo una in coda: chi arriva mentre si legge
   * aspetta quella dopo, che vede anche quello che è appena cambiato.
   */
  load(): Promise<void> {
    if (this.#coda) return this.#coda;
    if (this.#giro) {
      this.#coda = this.#giro.then(() => {
        this.#coda = null;
        return this.load();
      });
      return this.#coda;
    }
    this.#giro = this.#leggi().finally(() => (this.#giro = null));
    return this.#giro;
  }

  async #leggi(): Promise<void> {
    try {
      const [agents, list, scenes] = await Promise.all([
        api.get<Agent[]>('/agents'),
        api.get<Device[]>('/devices'),
        api.get<Scene[]>('/scenes'),
      ]);
      this.agents = agents;
      this.list = list;
      this.scenes = scenes;
      this.loadError = null;
      this.letto = true;
      // quelle che stanno andando, per chi ha aperto la pagina a metà
      this.running = Object.fromEntries(
        scenes
          .filter((scene) => scene.corre)
          .map((scene) => {
            const { run, at, of, resta } = scene.corre!;
            return [scene.id, { run, at, of, ...(resta ? { fino: Date.now() + resta } : {}) }];
          }),
      );
    } catch (error) {
      /*
       * Si tiene quello che c'era. Svuotare voleva dire far sparire le scene
       * da sotto a chi le stava scrivendo, e chiudergli la finestra, per un
       * server che non ha risposto una volta.
       */
      this.loadError = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  /* -------------------------------------------------------------- registro */

  /**
   * I registri che qualcuno sta guardando, detti prima che arrivino le
   * righe. La risposta può arrivare dopo che la finestra si è già chiusa:
   * senza saperlo, il registro finiva fra quelli aperti e restava lì per
   * sempre, riletto a ogni riga nuova per nessuno.
   */
  #guardati = new Set<string>();

  /** Aprire il registro di un agente: si legge adesso e si tiene aggiornato. */
  async openLog(agentId: string): Promise<void> {
    this.#guardati.add(agentId);
    await this.#leggiLog(agentId);
  }

  async #leggiLog(agentId: string): Promise<void> {
    try {
      const righe = await api.get<LogEntry[]>(`/agents/${agentId}/log`);
      if (this.#guardati.has(agentId)) this.logs = { ...this.logs, [agentId]: righe };
    } catch (error) {
      if (this.#guardati.has(agentId)) toast.show(`Il registro dell’agente non si è letto. ${(error as Error).message}`);
    }
  }

  /** I registri aperti, riletti: il filo è stato giù e le righe nuove non sono arrivate. */
  rileggiRegistri(): void {
    for (const agentId of this.#guardati) void this.#leggiLog(agentId);
  }

  closeLog(agentId: string): void {
    this.#guardati.delete(agentId);
    const { [agentId]: _via, ...rest } = this.logs;
    this.logs = rest;
  }

  /* ----------------------------------------------------------------- scene */

  /** I dispositivi nominati da una scena, senza ripetizioni e senza fantasmi. */
  membersOf(scene: Scene): Device[] {
    const seen = new Set<string>();
    const out: Device[] = [];
    for (const step of scene.steps) {
      // le righe che mandano un avviso non nominano nessuno
      if (!step.deviceId || seen.has(step.deviceId)) continue;
      const device = this.list.find((one) => one.id === step.deviceId);
      if (!device) continue;
      seen.add(step.deviceId);
      out.push(device);
    }
    return out;
  }

  /**
   * Una riga detta a parole: «Tenda 1 · Apri», «Mansarda · Accendi».
   *
   * Il nome del dispositivo davanti, perché una scena si legge per sapere
   * cosa muove; poi cosa gli succede, con la parola che userebbe il suo
   * comando — non `power=true`, che è come lo dice il protocollo.
   */
  saysOf(step: SceneStep): { who: string; what: string } {
    /*
     * Una riga che manda un avviso non ha un chi, ha delle parole — e può
     * non averle ancora: appena aggiunta è vuota, e resta una riga d'avviso
     * lo stesso. Guardare se il testo c'è invece che se è pieno la faceva
     * finire fra i dispositivi, dove diventava «Sparito».
     */
    if (step.notify !== undefined) return { who: 'Avviso', what: step.notify };

    // e una che ne chiama un'altra ha un nome, che e' quello dell'altra
    if (step.scene) {
      const altra = this.scenes.find((one) => one.id === step.scene);
      return { who: 'Scena', what: altra?.name ?? 'sparita' };
    }

    const device = this.list.find((one) => one.id === step.deviceId);
    const capability = device?.capabilities.find((entry) => entry.code === step.code);

    /*
     * Un dispositivo che non c'è più si dice a parole.
     *
     * Le righe dei dispositivi spariti il server le toglie da sé, ma fra il
     * momento in cui sparisce e quello in cui l'elenco si rilegge la riga
     * resta qui — e «Sparito · undefined» non è una frase, è il nome di una
     * variabile finito sullo schermo.
     */
    if (!device) return { who: 'Un dispositivo che non c’è più', what: '' };

    const who = device.name;

    if (!capability) return { who, what: step.value === undefined ? '' : String(step.value) };
    // la stessa parola della pastiglia da cui è nata (lib/azioni.ts)
    return { who, what: nomeAzione(device, capability as Capability, step.value) };
  }

  /* ----------------------------------------------------------- le regole */

  /** Le regole scritte sui dispositivi. Poche per definizione. */
  rules = $state<Rule[]>([]);

  async loadRules(): Promise<void> {
    this.rules = await api.get<Rule[]>('/alerts/rules');
  }

  /** Quelle scritte su un dispositivo. */
  rulesOf(deviceId: string): Rule[] {
    return this.rules.filter((one) => one.deviceId === deviceId);
  }

  async addRule(deviceId: string, code: string, becomes: string, op: Op = 'is'): Promise<void> {
    try {
      this.rules = [...this.rules, await api.post<Rule>('/alerts/rules', { deviceId, code, becomes, op })];
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async flipRule(rule: Rule, off: boolean): Promise<void> {
    const before = rule.off;
    rule.off = off || undefined;
    try {
      await api.put(`/alerts/rules/${rule.id}`, { off });
    } catch (error) {
      rule.off = before;
      toast.show((error as Error).message);
    }
  }

  async removeRule(rule: Rule): Promise<void> {
    const at = this.rules.indexOf(rule);
    if (at >= 0) this.rules.splice(at, 1);
    try {
      await api.delete(`/alerts/rules/${rule.id}`);
    } catch (error) {
      if (at >= 0) this.rules.splice(at, 0, rule);
      toast.show((error as Error).message);
    }
  }

  /**
   * Accende o spegne l'avviso su un dispositivo.
   *
   * Si vede subito e si corregge se il server dice di no, come per tutto il
   * resto: una levetta che aspetta la rete per muoversi sembra rotta.
   */
  async watch(device: Device, wanted: boolean): Promise<void> {
    const before = device.watch;
    device.watch = wanted || undefined;
    try {
      await api.put(`/devices/${device.id}/watch`, { watch: wanted });
    } catch (error) {
      device.watch = before;
      toast.show((error as Error).message);
    }
  }

  /**
   * Se si può far partire. Con dei dispositivi dentro basta che uno
   * risponda: una scena tutta spenta non parte. Senza, parte sempre — una
   * scena fatta di avvisi e di altre scene non ha nessuno da aspettare.
   */
  reachable(scene: Scene): boolean {
    const loro = this.membersOf(scene);
    return !loro.length || loro.some((device) => device.online);
  }

  async createScene(name: string, steps: SceneStep[]): Promise<Scene> {
    const made = await api.post<Scene>('/scenes', { name, steps });
    const at = this.scenes.findIndex((scene) => scene.id === made.id);
    if (at >= 0) {
      rimpiazza(this.scenes[at]!, made);
      return this.scenes[at]!;
    }
    this.scenes.push(made);
    return made;
  }

  /**
   * Cambia una scena. `when: null` vuol dire «non parte più da sola», che è
   * diverso da non nominarlo: il primo cancella l'orario, il secondo lo
   * lascia dov'è.
   */
  async patchScene(
    scene: Scene,
    patch: {
      name?: string;
      steps?: SceneStep[];
      when?: Timing | null;
      triggers?: SceneTrigger[];
      only?: SceneConditionGroup;
    },
  ): Promise<void> {
    const before = { ...scene, steps: [...scene.steps] };
    const scritto = { ...patch, ...(patch.when === null ? { when: undefined } : {}) };
    Object.assign(scene, scritto);
    try {
      rimpiazza(scene, await api.put<Scene>(`/scenes/${scene.id}`, { name: scene.name, ...patch }));
    } catch (error) {
      ritira(scene, scritto as Partial<Scene>, before);
      toast.show((error as Error).message);
    }
  }

  async removeScene(scene: Scene): Promise<void> {
    const at = this.scenes.indexOf(scene);
    if (at >= 0) this.scenes.splice(at, 1);
    try {
      await api.delete(`/scenes/${scene.id}`);
    } catch (error) {
      if (at >= 0) this.scenes.splice(at, 0, scene);
      toast.show((error as Error).message);
    }
  }

  /**
   * La scena, tutta. Non si finge niente: lo stato lo raccontano i
   * dispositivi quando si sono mossi davvero, uno per uno, dal filo aperto.
   */
  async runScene(scene: Scene): Promise<void> {
    const key = `scena:${scene.id}`;
    if (this.busy.includes(key)) return;
    this.busy = [...this.busy, key];

    let rest = SETTLE_MS;
    try {
      await api.post(`/scenes/${scene.id}/run`, {});
    } catch (error) {
      const why = (error as Error).message;
      const silence = why.includes('non ha risposto') || why.includes('nessuna risposta');
      rest = silence ? UNSURE_MS : 0;
      toast.show(why);
    }

    if (rest) await new Promise((done) => setTimeout(done, rest));
    this.busy = this.busy.filter((held) => held !== key);
  }

  /** Le scene che stanno andando: a che momento, e quando finisce l'attesa di adesso. */
  running = $state<Record<string, { run: string; at: number; of: number; fino?: number }>>({});

  /**
   * Quello che arriva dal filo. Il filo non è suo: è uno solo per tutta
   * l'app, e sta in `live`. Qui si applica soltanto la parte che riguarda
   * quello che si accende.
   */
  apply(
    event: { kind: 'device' | 'agent' | 'devices' | 'agents' | 'scene' | 'running' | 'log' } & Record<
      string,
      unknown
    >,
  ): void {
    /*
     * A che punto è una scena che sta partendo.
     *
     * Una con dentro delle attese dura minuti, e senza dirlo sembra non
     * essere partita: chi l'ha premuta la preme di nuovo, e le tende fanno
     * due giri. Il conto arriva dal server perché è lui che la sta
     * eseguendo — e arriva anche a chi la guarda da un altro telefono.
     */
    if (event.kind === 'running') {
      const sceneId = event.sceneId as string;
      const run = event.run as string;
      /*
       * La stessa scena può andare due volte insieme. Si mostra l'ultima
       * partita, e la fine di quella di prima non la cancella.
       */
      if (event.done) {
        if (this.running[sceneId]?.run === run) delete this.running[sceneId];
      } else {
        const resta = event.resta as number | undefined;
        this.running[sceneId] = {
          run,
          at: event.at as number,
          of: event.of as number,
          ...(resta ? { fino: Date.now() + resta } : {}),
        };
      }
      return;
    }

    // L'elenco è cambiato — uno nuovo, o uno sparito — e non vale la pena
    // raccontarlo pezzo per pezzo: si rilegge, che è corto e sempre vero.
    if (event.kind === 'devices' || event.kind === 'agents') {
      void this.load();
      return;
    }

    // una riga nuova nel registro di qualcuno: se lo stiamo leggendo, si rilegge
    if (event.kind === 'log') {
      const agentId = event.agentId as string;
      if (this.#guardati.has(agentId)) void this.#leggiLog(agentId);
      return;
    }

    if (event.kind === 'scene') {
      const id = event.id as string;
      const value = event.value as Scene | null;
      const at = this.scenes.findIndex((scene) => scene.id === id);
      if (!value) {
        if (at >= 0) this.scenes.splice(at, 1);
      } else if (at >= 0) {
        rimpiazza(this.scenes[at]!, value);
      } else {
        this.scenes.push(value);
      }
      return;
    }

    if (event.kind === 'agent') {
      const agent = this.agents.find((candidate) => candidate.id === event.agentId);
      if (agent) agent.online = event.online as boolean;
      return;
    }

    const device = this.byId(event.deviceId as string);
    if (!device) {
      /*
       * Un dispositivo che non conosciamo: forse l'agente ne ha trovato uno
       * nuovo, e allora si rilegge — una volta sola per quel dispositivo.
       * Se dopo la rilettura non c'è ancora, non è nostro da vedere (a un
       * ospite le telecamere non si mostrano, ma i loro eventi arrivano lo
       * stesso) e rileggere tutto a ogni suo messaggio non lo farebbe
       * comparire.
       */
      const id = event.deviceId as string;
      if (this.#ignoti.has(id)) return;
      this.#ignoti.add(id);
      void this.load();
      return;
    }
    device.online = event.online as boolean;
    device.state = event.state as Record<string, DeviceValue>;
  }

  /* --------------------------------------------------------------- comandi */

  /**
   * Si accende subito e si aspetta. Se l'agente dice di no, torna com'era e
   * il motivo arriva intero: "non risponde" è un'informazione, una luce che
   * finge di essersi accesa non lo è.
   */
  async command(device: Device, code: string, value: DeviceValue, prima?: { value: DeviceValue | undefined }): Promise<void> {
    const key = `${device.id}:${code}`;
    if (this.busy.includes(key)) return;

    /*
     * Com'era prima, per tornarci se va male. Un cursore lo dice da sé
     * (`prima`), perché mentre lo trascini l'anteprima ha già scritto il
     * valore nuovo, e tornare «a com'era» voleva dire restare dove l'avevi
     * lasciato, come se il comando fosse passato.
     */
    const before: Record<string, DeviceValue> = { ...device.state };
    if (prima && prima.value !== undefined) before[code] = prima.value;
    else if (prima) delete before[code];
    device.state = { ...device.state, [code]: value };
    this.busy = [...this.busy, key];

    /**
     * Quanto resta fermo il comando dopo che è finito. Poco se è andata bene:
     * solo il tempo di non far partire due volte lo stesso dito. Molto di più
     * se non è arrivata risposta, e il motivo è sotto.
     */
    let rest = SETTLE_MS;

    try {
      await api.post(`/devices/${device.id}/command`, { code, value });
    } catch (error) {
      device.state = before;
      const why = (error as Error).message;

      /*
       * «Non ha risposto» non vuol dire «non è successo niente». Il comando
       * può essere arrivato lo stesso — la risposta si è persa per strada, o
       * il cloud di Tuya ci ha messo più di quanto aspettiamo — e a quel punto
       * l'interruttore che torna indietro racconta una bugia comoda: sembra
       * che non sia partito, si preme di nuovo, e la tapparella fa due giri.
       *
       * Quindi lo si dice, e si tiene fermo il comando per qualche secondo:
       * il tempo che lo stato vero arrivi da solo dal filo aperto.
       */
      const silence = why.includes('non ha risposto');
      rest = silence ? UNSURE_MS : 0;
      toast.show(
        silence
          ? 'Nessuna risposta, e il comando potrebbe essere partito lo stesso. Un attimo prima di riprovare.'
          : why,
      );
    }

    if (rest) await new Promise((done) => setTimeout(done, rest));
    this.busy = this.busy.filter((held) => held !== key);
  }

  /* ---------------------------------------------------------------- agenti */

  async createAgent(name: string): Promise<NewAgent> {
    const made = await api.post<NewAgent>('/agents', { name });
    this.agents.push(made.agent);
    return made;
  }

  async renameAgent(agent: Agent, name: string): Promise<void> {
    const before = agent.name;
    agent.name = name;
    try {
      rimpiazza(agent, await api.put<Agent>(`/agents/${agent.id}`, { name }));
    } catch (error) {
      agent.name = before;
      toast.show((error as Error).message);
    }
  }

  /**
   * Una battuta della conversazione per collegare un account a quell'agente.
   * Torna il passo successivo: cosa chiedere, e la stringa da disegnare come
   * QR quando c'è. Di Tuya, qui dentro, non si sa niente.
   */
  pair(
    agent: Agent,
    action: 'start' | 'submit' | 'cancel',
    options: { handler?: string; flowId?: string; input?: Record<string, string | boolean> } = {},
  ): Promise<PairingStep | null> {
    return api.post<PairingStep | null>(`/agents/${agent.id}/pair`, { action, ...options });
  }

  /**
   * Un numero per agente che cresce quando i suoi account cambiano: chi
   * mostra i collegamenti di quell'agente lo legge, e rilegge l'elenco.
   */
  versioniAccount = $state<Record<string, number>>({});

  accountsCambiati(agentId: string): void {
    this.versioniAccount[agentId] = (this.versioniAccount[agentId] ?? 0) + 1;
  }

  /** Cosa si può collegare a quell'agente: tutto il catalogo della sua centrale. */
  catalog(agent: Agent): Promise<CatalogEntry[]> {
    return api
      .post<CatalogEntry[] | null>(`/agents/${agent.id}/pair`, { action: 'catalog' })
      .then((list) => list ?? []);
  }

  /** Cosa è già collegato a quell'agente: Tuya, eWeLink, quello che c'è. */
  linked(agent: Agent): Promise<LinkedAccount[]> {
    return api
      .post<LinkedAccount[] | null>(`/agents/${agent.id}/pair`, { action: 'list' })
      .then((list) => list ?? []);
  }

  /**
   * Staccare un account. I suoi dispositivi non se ne vanno: al prossimo
   * inventario restano come spariti, con le loro scene e i loro avvisi,
   * finché non li rimuovi o non torna.
   */
  unlink(agent: Agent, entryId: string): Promise<LinkedAccount[]> {
    return api
      .post<LinkedAccount[] | null>(`/agents/${agent.id}/pair`, { action: 'unlink', entryId })
      .then((list) => list ?? []);
  }

  /** Il token di prima smette di funzionare all'istante: l'agente va reinstallato. */
  newToken(agent: Agent): Promise<NewAgent> {
    return api.post<NewAgent>(`/agents/${agent.id}/token`, {});
  }

  /**
   * Un agente che se ne va porta via i suoi dispositivi. I luoghi che lo
   * tenevano restano dove sono: erano luoghi prima di essere interruttori.
   */
  async removeAgent(agent: Agent): Promise<void> {
    // per identità e non per oggetto: una rilettura nel frattempo li ha sostituiti
    const theirs = this.ofAgent(agent.id);
    this.agents = this.agents.filter((one) => one.id !== agent.id);
    this.list = this.list.filter((device) => device.agentId !== agent.id);

    try {
      await api.delete(`/agents/${agent.id}`);
    } catch (error) {
      // si rimette solo quello che nel frattempo non è tornato da sé
      if (!this.agents.some((one) => one.id === agent.id)) this.agents = [...this.agents, agent];
      const ci = new Set(this.list.map((device) => device.id));
      this.list = [...this.list, ...theirs.filter((device) => !ci.has(device.id))];
      toast.show((error as Error).message);
    }
  }
}

export const devices = new Devices();
