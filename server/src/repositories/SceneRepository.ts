import { randomUUID } from 'node:crypto';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { iso, type Transaction } from '../persistence/db.js';
import { scenes } from '../persistence/schema.js';
import { NESSUNA_CONDIZIONE, type Scene, type SceneStep } from '../types.js';

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
});

export class SceneRepository {
  constructor(private readonly tx: Transaction) {}

  /** È partita adesso. Torna la scena com'è dopo, per dirlo a chi guarda. */
  async markRan(id: string): Promise<Scene | undefined> {
    const [row] = await this.tx.db.update(scenes).set({ ranAt: new Date() }).where(eq(scenes.id, id)).returning();
    return row ? toScene(row) : undefined;
  }

  /** Le scene sono di chi le ha fatte, come gli agenti. */
  async findAllOf(ownerId: string): Promise<Scene[]> {
    const rows = await this.tx.db.select().from(scenes).where(eq(scenes.ownerId, ownerId));
    return rows.map(toScene);
  }

  /**
   * Quelle che partono quando quella cosa di quel dispositivo cambia.
   *
   * Lo chiede il database, dentro all'elenco dei trigger: a ogni grado di
   * una sonda leggere tutte le scene di tutti per guardarle una a una
   * sarebbe il modo più lento di non trovarne nessuna.
   */
  async findTriggeredBy(deviceId: string, code: string): Promise<Scene[]> {
    const rows = await this.tx.db
      .select()
      .from(scenes)
      .where(sql`${scenes.triggers} @> ${JSON.stringify([{ deviceId, code }])}::jsonb`);
    return rows.map(toScene);
  }

  /** Tutte, di tutti: le guarda l'orologio, che non lavora per nessuno in particolare. */
  async findAll(): Promise<Scene[]> {
    const rows = await this.tx.db.select().from(scenes);
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

  async update(
    id: string,
    patch: Partial<Pick<Scene, 'name' | 'steps' | 'when' | 'triggers' | 'only'>>,
  ): Promise<Scene | undefined> {
    const set = {
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.steps === undefined ? {} : { steps: patch.steps }),
      ...(patch.triggers === undefined ? {} : { triggers: patch.triggers }),
      ...(patch.only === undefined ? {} : { only: patch.only }),
      ...('when' in patch ? { timing: patch.when ?? null } : {}),
    };
    if (!Object.keys(set).length) return this.findById(id);

    const [row] = await this.tx.db.update(scenes).set(set).where(eq(scenes.id, id)).returning();
    return row ? toScene(row) : undefined;
  }

  /**
   * Si prende il turno di questo minuto, se nessuno l'ha già preso.
   *
   * L'orologio non esegue mai di sua iniziativa: prima scrive che quella
   * scena è partita in quel minuto, e solo se la scrittura ha vinto la fa
   * partire davvero. Adesso la gara è vera. La condizione sta dentro alla
   * scrittura, non in una lettura fatta prima: è il database a dire chi è
   * arrivato primo, e due server che battono lo stesso minuto ne vedono uno
   * solo tornare con una riga in mano.
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

  /** Toglie l'orario a una scena: un appuntamento passato non è un appuntamento. */
  async forgetWhen(id: string): Promise<void> {
    await this.tx.db.update(scenes).set({ timing: null }).where(eq(scenes.id, id));
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.tx.db.delete(scenes).where(eq(scenes.id, id)).returning({ id: scenes.id });
    return rows.length > 0;
  }

  /**
   * Un dispositivo che non esiste più si porta via le righe che lo nominavano.
   *
   * Succede quando un agente smette di raccontarlo — l'hai staccato, l'hai
   * tolto da Home Assistant. Lasciarle lì vorrebbe dire una scena che prova a
   * comandare un fantasma, e non si capirebbe perché non parte.
   *
   * Le righe stanno dentro a un documento, quindi il taglio si fa qui: si
   * guardano le scene di chi ha perso quei dispositivi — non quelle di
   * tutti — e si riscrivono solo quelle che li nominavano davvero. Torna
   * quante scene ne hanno risentito.
   */
  async pruneDevices(ownerId: string, gone: Set<string>): Promise<number> {
    if (!gone.size) return 0;

    const rows = await this.tx.db.select().from(scenes).where(eq(scenes.ownerId, ownerId));

    let touched = 0;
    for (const row of rows) {
      // le righe che mandano un avviso non nominano nessun dispositivo
      const kept = row.steps.filter((step) => !step.deviceId || !gone.has(step.deviceId));
      if (kept.length === row.steps.length) continue;
      await this.tx.db.update(scenes).set({ steps: kept }).where(eq(scenes.id, row.id));
      touched += 1;
    }
    return touched;
  }
}
