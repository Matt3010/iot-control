import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { conEntita, senza } from '../../../shared/regole.js';
import { senzaRighe } from '../rules/chiamate.js';
import { iso, type Transaction } from '../persistence/db.js';
import { sceneRuns, scenes } from '../persistence/schema.js';
import { NESSUNA_CONDIZIONE, type Scene, type SceneCondition, type SceneConditionGroup, type SceneStep, type Timing } from '../types.js';

type Row = typeof scenes.$inferSelect;

const toScene = (row: Row): Scene => ({
  id: row.id,
  ownerId: row.ownerId,
  name: row.name,
  steps: row.steps,
  ...(row.timing ? { when: row.timing } : {}),
  ...(row.lastRunAt ? { lastRunAt: row.lastRunAt } : {}),
  ...(row.ranAt ? { ranAt: iso(row.ranAt) as string } : {}),
  triggers: row.triggers ?? [],
  only: row.only ?? NESSUNA_CONDIZIONE,
  ...(row.blownAt ? { blownAt: iso(row.blownAt) as string } : {}),
});

export class SceneRepository {
  constructor(private readonly tx: Transaction) {}

  /**
   * Sono partite adesso: quella premuta e quelle che chiama. Torna le scene
   * come sono dopo, per dirlo a chi guarda. Chi ne fa partire una a mano la
   * riaccende anche, se il fusibile l'aveva fermata.
   */
  async markRan(ids: string[], riaccendi?: string): Promise<Scene[]> {
    if (!ids.length) return [];
    const rows = await this.tx.db
      .update(scenes)
      .set({
        ranAt: new Date(),
        ...(riaccendi
          ? { blownAt: sql`case when ${scenes.id} = ${riaccendi} then null else ${scenes.blownAt} end` }
          : {}),
      })
      .where(inArray(scenes.id, ids))
      .returning();
    return rows.map(toScene);
  }

  /**
   * Il fusibile salta. Solo chi lo trova ancora intero torna con la scena:
   * due passaggi nello stesso istante non mandano due avvisi.
   */
  async blow(id: string): Promise<Scene | undefined> {
    const [row] = await this.tx.db
      .update(scenes)
      .set({ blownAt: new Date() })
      .where(and(eq(scenes.id, id), isNull(scenes.blownAt)))
      .returning();
    return row ? toScene(row) : undefined;
  }

  /** Le scene sono di chi le ha fatte, come gli agenti. */
  async findAllOf(ownerId: string): Promise<Scene[]> {
    const rows = await this.tx.db.select().from(scenes).where(eq(scenes.ownerId, ownerId));
    return rows.map(toScene);
  }

  /**
   * Quelle che partono quando una di queste cose di quel dispositivo cambia.
   *
   * Lo chiede il database, dentro all'elenco dei trigger, con il suo indice:
   * a ogni grado di una sonda leggere tutte le scene di tutti per guardarle
   * una a una sarebbe il modo più lento di non trovarne nessuna.
   */
  async findTriggeredBy(deviceId: string, codes: string[]): Promise<Scene[]> {
    if (!codes.length) return [];
    const rows = await this.tx.db
      .select()
      .from(scenes)
      .where(or(...codes.map((code) => sql`${scenes.triggers} @> ${JSON.stringify([{ deviceId, code }])}::jsonb`)));
    return rows.map(toScene);
  }

  /** Le cose che fanno partire almeno una scena, dispositivo e codice: come `AlertRepository.watchedPairs`. */
  async triggerPairs(): Promise<{ deviceId: string; code: string }[]> {
    const { rows } = await this.tx.db.execute<{ deviceId: string; code: string }>(sql`
      select distinct t->>'deviceId' as "deviceId", t->>'code' as "code"
      from ${scenes}, jsonb_array_elements(${scenes.triggers}) t
    `);
    return rows;
  }

  /**
   * Quelle con questi id, sue. Chi fa partire una scena legge lei e quelle
   * che chiama, non tutte quelle dell'account.
   */
  async findManyOf(ownerId: string, ids: string[]): Promise<Scene[]> {
    if (!ids.length) return [];
    const rows = await this.tx.db
      .select()
      .from(scenes)
      .where(and(eq(scenes.ownerId, ownerId), inArray(scenes.id, ids)));
    return rows.map(toScene);
  }

  /**
   * Quelle con un orario acceso, di tutti: le guarda l'orologio, che non
   * lavora per nessuno in particolare. Le altre non gli servono.
   */
  async findTimed(): Promise<Scene[]> {
    const rows = await this.tx.db
      .select()
      .from(scenes)
      .where(and(isNotNull(scenes.timing), sql`coalesce((${scenes.timing}->>'off')::boolean, false) = false`));
    return rows.map(toScene);
  }

  async findById(id: string): Promise<Scene | undefined> {
    const [row] = await this.tx.db.select().from(scenes).where(eq(scenes.id, id)).limit(1);
    return row ? toScene(row) : undefined;
  }

  async owns(ownerId: string, id: string): Promise<boolean> {
    return (await this.findById(id))?.ownerId === ownerId;
  }

  async insert(ownerId: string, name: string, steps: SceneStep[]): Promise<Scene> {
    const [row] = await this.tx.db
      .insert(scenes)
      .values({ id: `scn-${randomUUID()}`, ownerId, name, steps })
      .returning();
    return toScene(row as Row);
  }

  /**
   * Una modifica. Chi la cambia l'ha guardata, quindi se il fusibile l'aveva
   * fermata riparte da capo.
   */
  async update(
    id: string,
    patch: Partial<Pick<Scene, 'name' | 'steps' | 'when' | 'triggers' | 'only'>>,
  ): Promise<Scene | undefined> {
    const set = {
      blownAt: null,
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.steps === undefined ? {} : { steps: patch.steps }),
      ...(patch.triggers === undefined ? {} : { triggers: patch.triggers }),
      ...(patch.only === undefined ? {} : { only: patch.only }),
      ...('when' in patch ? { timing: patch.when ?? null } : {}),
    };

    const [row] = await this.tx.db.update(scenes).set(set).where(eq(scenes.id, id)).returning();
    return row ? toScene(row) : undefined;
  }

  /**
   * Si prende il turno di questo minuto, se nessuno l'ha già preso.
   *
   * L'orologio non esegue mai di sua iniziativa: prima scrive che quella
   * scena è partita in quel minuto, e solo se la scrittura ha vinto la fa
   * partire davvero. La condizione sta dentro alla scrittura, non in una
   * lettura fatta prima: è il database a dire chi è arrivato primo, e due
   * server che battono lo stesso minuto ne vedono uno solo tornare con una
   * riga in mano.
   */
  async claim(id: string, minute: string): Promise<boolean> {
    const rows = await this.tx.db
      .update(scenes)
      .set({ lastRunAt: minute })
      .where(
        and(eq(scenes.id, id), or(isNull(scenes.lastRunAt), ne(scenes.lastRunAt, minute))),
      )
      .returning({ id: scenes.id });
    return rows.length > 0;
  }

  /**
   * Toglie l'orario a una scena: un appuntamento passato non è un
   * appuntamento. Solo se è ancora quello letto, perché chi lo ha appena
   * riscritto non deve vederselo cancellare dall'orologio.
   */
  async forgetWhen(id: string, letto: Timing): Promise<Scene | undefined> {
    const [row] = await this.tx.db
      .update(scenes)
      .set({ timing: null })
      .where(and(eq(scenes.id, id), sql`${scenes.timing} = ${JSON.stringify(letto)}::jsonb`))
      .returning();
    return row ? toScene(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.tx.db.delete(scenes).where(eq(scenes.id, id)).returning({ id: scenes.id });
    return rows.length > 0;
  }

  /**
   * Un dispositivo che non esiste più si porta via le righe, le partenze e
   * le condizioni che lo nominavano.
   *
   * Lasciarle lì vorrebbe dire una scena che prova a comandare un fantasma,
   * e non si capirebbe perché non parte. Le righe stanno dentro a un
   * documento, quindi il taglio si fa qui: si guardano le scene di chi ha
   * perso quei dispositivi — non quelle di tutti — e si riscrivono solo
   * quelle che li nominavano davvero. Torna quante scene ne hanno risentito.
   */
  async pruneDevices(ownerId: string, gone: Set<string>): Promise<number> {
    if (!gone.size) return 0;

    const rows = await this.tx.db.select().from(scenes).where(eq(scenes.ownerId, ownerId));

    let touched = 0;
    for (const row of rows) {
      // le righe che mandano un avviso non nominano nessun dispositivo; l'attesa di una tolta passa alla dopo
      const steps = senzaRighe(row.steps, (step) => !!step.deviceId && gone.has(step.deviceId));
      const triggers = (row.triggers ?? []).filter((trigger) => !gone.has(trigger.deviceId));
      /*
       * Anche le condizioni, con la stessa potatura che usa il sito
       * (`shared/regole.js`): un gruppo rimasto vuoto se ne va con loro,
       * tranne quello più esterno.
       */
      const only = senza(row.only, (one) => one.kind === 'device' && gone.has(one.deviceId));
      if (JSON.stringify([steps, triggers, only]) === JSON.stringify([row.steps, row.triggers, row.only])) continue;
      await this.tx.db.update(scenes).set({ steps, triggers, only }).where(eq(scenes.id, row.id));
      touched += 1;
    }
    return touched;
  }

  /**
   * Dispositivi che adesso stanno dentro ad altri: le scene che li
   * nominavano — righe, partenze, condizioni — nominano l'altro, con il
   * codice della capacità che dice da quale entità viene. Un codice che ha
   * già la sua entità davanti resta com'è, se no diventerebbe `a#b#power`.
   * Le scene si leggono una volta per tutti gli spostamenti.
   */
  async moveDevices(ownerId: string, moves: { from: string; to: string; prefisso: string }[]): Promise<number> {
    if (!moves.length) return 0;
    const perDa = new Map(moves.map((one) => [one.from, one]));
    const rows = await this.tx.db.select().from(scenes).where(eq(scenes.ownerId, ownerId));

    const sposta = <T extends { deviceId?: string; code?: string }>(one: T): T => {
      const move = one.deviceId ? perDa.get(one.deviceId) : undefined;
      if (!move) return one;
      const code = one.code ? conEntita(one.code, move.prefisso) : one.code;
      return { ...one, deviceId: move.to, ...(code ? { code } : {}) };
    };
    const nelGruppo = (condizione: SceneCondition): SceneCondition => {
      if (condizione.kind === 'group') return { ...condizione, items: condizione.items.map(nelGruppo) };
      return condizione.kind === 'device' ? sposta(condizione) : condizione;
    };

    let touched = 0;
    for (const row of rows) {
      const steps = row.steps.map(sposta);
      const triggers = (row.triggers ?? []).map(sposta);
      const only = nelGruppo(row.only) as SceneConditionGroup;
      const prima = JSON.stringify([row.steps, row.triggers, row.only]);
      if (JSON.stringify([steps, triggers, only]) === prima) continue;
      await this.tx.db.update(scenes).set({ steps, triggers, only }).where(eq(scenes.id, row.id));
      touched += 1;
    }
    return touched;
  }
}

/**
 * Le partenze che stanno aspettando fra un momento e l'altro
 * (`schema.sceneRuns`): quello che resta per dire, dopo un riavvio, che una
 * scena non è finita.
 */
export class SceneRunRepository {
  constructor(private readonly tx: Transaction) {}

  /**
   * Le ore le scrive il server e non il database: si confrontano con
   * l'orologio del server, e due orologi un po' diversi scambierebbero per
   * ferma una partenza appena cominciata.
   */
  async start(run: { id: string; sceneId: string; ownerId: string; agentIds: string[] }): Promise<void> {
    const adesso = new Date();
    await this.tx.db.insert(sceneRuns).values({ ...run, startedAt: adesso, aliveAt: adesso });
  }

  /** Il battito delle partenze che questo server sta ancora eseguendo. */
  async beat(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.tx.db.update(sceneRuns).set({ aliveAt: new Date() }).where(inArray(sceneRuns.id, ids));
  }

  async end(id: string): Promise<void> {
    await this.tx.db.delete(sceneRuns).where(eq(sceneRuns.id, id));
  }

  /**
   * Quelle che non battono più da prima di `before`, con il nome della scena.
   * Se le porta via chi le legge, così due server che guardano insieme non
   * le raccontano due volte.
   */
  async takeInterrupted(before: Date): Promise<{ ownerId: string; name: string; agentIds: string[] }[]> {
    const taken = await this.tx.db.delete(sceneRuns).where(lt(sceneRuns.aliveAt, before)).returning();
    if (!taken.length) return [];
    const nomi = await this.tx.db
      .select({ id: scenes.id, name: scenes.name })
      .from(scenes)
      .where(inArray(scenes.id, [...new Set(taken.map((one) => one.sceneId))]));
    const nome = new Map(nomi.map((one) => [one.id, one.name]));
    return taken.map((one) => ({
      ownerId: one.ownerId,
      name: nome.get(one.sceneId) ?? 'una scena',
      agentIds: one.agentIds,
    }));
  }
}
