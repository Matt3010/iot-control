import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Capability } from '../../../shared/protocol.js';
import { NESSUNA_CONDIZIONE, type LogEntry, type MapEditor, type Notice, type Op, type SceneConditionGroup, type SceneStep, type SceneTrigger, type Timing } from '../types.js';

/**
 * Le tabelle, e perché sono fatte così.
 *
 * Quello che ha una forma sua — le righe di una scena, quello che un
 * dispositivo sa fare, chi può modificare una mappa — sta in `jsonb`: sono
 * documenti, si leggono sempre interi, e spezzarli in tabelle vorrebbe dire
 * cinque join per disegnare una scheda. Quello che invece è un legame fra due
 * cose — un luogo e i suoi gruppi, un luogo e i suoi agenti — ha la sua
 * tabella: lì la domanda «quali luoghi stanno in questo gruppo» si fa da
 * quella parte, e cancellare un gruppo porta via i suoi legami da solo.
 *
 * Le date sono `timestamptz`. Nel resto del programma viaggiano come stringhe
 * ISO, e la conversione sta tutta nei repository: un'ora senza fuso scritta in
 * un database è un'ora che vuol dire cose diverse a ottobre e a marzo.
 */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  /** Minuscola e ripulita: è la chiave con cui si entra. */
  email: text('email').notNull().unique(),
  /** Il nome con cui ti vedi scritto nell'app: @tu. */
  handle: text('handle').notNull().unique(),
  salt: text('salt').notNull(),
  hash: text('hash').notNull(),
  /**
   * Il suo fuso orario: «le sette» delle sue scene sono le sette qui.
   *
   * Uno solo per persona e non uno per scena. Prima ogni orario si portava
   * il fuso del browser in cui era stato scritto, e un orario scritto in
   * viaggio restava in un altro fuso per sempre. Vuoto finché il primo
   * browser non lo dice.
   */
  tz: text('tz'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const maps = pgTable(
  'maps',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Chi può modificarla oltre a chi ce l'ha, e fin dove. */
    editors: jsonb('editors').$type<MapEditor[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('maps_owner').on(table.ownerId)],
);

export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    emoji: text('emoji').notNull(),
    color: text('color').notNull(),
  },
  (table) => [index('categories_owner').on(table.ownerId)],
);

export const groups = pgTable(
  'groups',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (table) => [index('groups_owner').on(table.ownerId)],
);

export const agents = pgTable(
  'agents',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Del token si tiene una derivata col suo sale, come per le password. */
    salt: text('salt').notNull(),
    hash: text('hash').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Da quando tace, se l'avviso che tace è già partito. È il turno di chi
     * lo dice: lo prende chi riesce a scriverlo, e chi arriva secondo trova
     * il posto già preso e non ripete l'avviso. Si toglie quando ritorna,
     * con la stessa gara.
     */
    quietSince: timestamp('quiet_since', { withTimezone: true }),
  },
  (table) => [index('agents_owner').on(table.ownerId)],
);

export const places = pgTable(
  'places',
  {
    id: text('id').primaryKey(),
    mapId: text('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    categoryId: text('category_id').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('places_map').on(table.mapId)],
);

/**
 * Un luogo può stare in più gruppi, e un gruppo tiene più luoghi.
 *
 * Era un elenco di identificativi dentro al luogo. Da questa parte la domanda
 * «cosa c'è in questo gruppo» si fa senza rileggere tutti i luoghi, e un
 * gruppo eliminato si porta via i suoi legami invece di lasciare in giro dei
 * nomi che non indicano più niente.
 */
export const placeGroups = pgTable(
  'place_groups',
  {
    placeId: text('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.placeId, table.groupId] }),
    index('place_groups_group').on(table.groupId),
  ],
);

/** E gli agenti appesi a un luogo: più d'uno quando le reti sono separate. */
export const placeAgents = pgTable(
  'place_agents',
  {
    placeId: text('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.placeId, table.agentId] }),
    index('place_agents_agent').on(table.agentId),
  ],
);

export const devices = pgTable(
  'devices',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    /** L'id che gli dà il suo agente: unico lì dentro, non nel mondo. */
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    capabilities: jsonb('capabilities').$type<Capability[]>().notNull().default([]),
    /** Se vuoi essere avvisato quando questo smette di rispondere. */
    watch: boolean('watch').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Da quando l'agente non lo racconta più. Non si cancella: se lo
     * ricolleghi torna lo stesso, con le sue scene e i suoi avvisi. Se ne va
     * davvero solo quando qualcuno preme «Rimuovi».
     */
    goneAt: timestamp('gone_at', { withTimezone: true }),
    /** Da quando tace, se l'avviso è già partito: lo stesso turno degli agenti. */
    quietSince: timestamp('quiet_since', { withTimezone: true }),
  },
  (table) => [
    // lo stesso agente non racconta due volte la stessa cosa: prima era una
    // ricerca nell'elenco, adesso è una regola che non si può violare
    uniqueIndex('devices_agent_external').on(table.agentId, table.externalId),
    index('devices_owner').on(table.ownerId),
    // chi si accorge dei silenzi chiede ogni minuto i pochi sorvegliati fra tutti
    index('devices_watched').on(table.id).where(sql`watch`),
  ],
);

export const scenes = pgTable(
  'scenes',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    steps: jsonb('steps').$type<SceneStep[]>().notNull().default([]),
    /** Se parte da sola, e quando. La colonna non si chiama «when»: è parola di SQL. */
    timing: jsonb('timing').$type<Timing>(),
    /**
     * L'ultimo minuto in cui è partita da sola.
     *
     * Resta testo e non una data: non è un istante da confrontare, è il
     * gettone di un turno. Chi riesce a scriverlo per primo fa partire la
     * scena, e chi arriva dopo trova quel minuto già preso.
     */
    lastRunAt: text('last_run_at'),
    /**
     * L'ultima volta che è partita davvero, comunque: a mano, da sola o
     * chiamata da un'altra scena.
     *
     * Non è `lastRunAt`, che è il turno dell'orologio e vale solo per le
     * partenze automatiche. Questa è un istante, e serve a chi guarda: a
     * sapere quali scene si usano e quali no.
     */
    ranAt: timestamp('ran_at', { withTimezone: true }),
    /** Le cose di casa che la fanno partire: ne basta una. */
    triggers: jsonb('triggers').$type<SceneTrigger[]>().notNull().default([]),
    /**
     * Quello che deve essere vero perché parta da sola, come un gruppo solo
     * che può contenerne altri. La colonna non si chiama «only», perché è
     * una parola di SQL come «when».
     */
    only: jsonb('conditions').$type<SceneConditionGroup>().notNull().default(NESSUNA_CONDIZIONE),
    /**
     * Da quando il fusibile l'ha fermata: ripartiva da sola di continuo.
     *
     * Sta scritto e non in memoria perché una scena in un giro, se il
     * fusibile si riarmasse da solo dopo un minuto, ripartirebbe e
     * rimanderebbe l'avviso ogni minuto per sempre, anche dopo un riavvio.
     * Resta ferma finché qualcuno non la tocca: la cambia, o la fa partire
     * a mano.
     */
    blownAt: timestamp('blown_at', { withTimezone: true }),
  },
  (table) => [
    index('scenes_owner').on(table.ownerId),
    // le partenze si cercano con «contiene» a ogni cambiamento di ogni
    // dispositivo, e senza indice vorrebbe dire leggerle tutte ogni volta
    index('scenes_triggers').using('gin', table.triggers),
    // l'orologio chiede ogni minuto le poche scene con un orario fra tutte
    index('scenes_timed').on(table.id).where(sql`timing is not null`),
  ],
);

/**
 * Le scene che stanno aspettando fra un momento e l'altro.
 *
 * Un'attesa vive nella memoria del server: se il server riparte a metà, i
 * momenti che mancavano non partono più. Questa riga è quello che resta per
 * poterlo dire nel registro delle case che la scena toccava, invece di
 * lasciare una tenda aperta senza un perché. Nasce quando comincia la prima
 * attesa e se ne va quando la scena finisce.
 *
 * Chi la sta eseguendo batte ogni minuto su `aliveAt`. Una riga che non batte
 * più è di un server che si è fermato, questo o un altro: la si guarda dal
 * battito e non dall'ora di avvio, così un server che riparte non scambia
 * per interrotte le scene che un altro sta ancora eseguendo.
 */
export const sceneRuns = pgTable(
  'scene_runs',
  {
    id: text('id').primaryKey(),
    sceneId: text('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Le case dove scrivere che non è finita: il registro è di un agente. */
    agentIds: jsonb('agent_ids').$type<string[]>().notNull().default([]),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    aliveAt: timestamp('alive_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('scene_runs_scene').on(table.sceneId)],
);

export const logEntries = pgTable(
  'log_entries',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    kind: text('kind').$type<LogEntry['kind']>().notNull(),
    subject: text('subject'),
    detail: text('detail'),
    ok: boolean('ok'),
    who: text('who'),
  },
  (table) => [index('log_agent_at').on(table.agentId, table.at)],
);

export const pushes = pgTable(
  'pushes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Dove consegnare: lo dà il servizio del telefono, ed è anche la sua chiave. */
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    agent: text('agent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastOkAt: timestamp('last_ok_at', { withTimezone: true }),
  },
  (table) => [index('pushes_user').on(table.userId)],
);

export const alerts = pgTable(
  'alerts',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    /** Preciso, sopra o sotto. Le regole di prima erano tutte precise. */
    op: text('op').$type<Op>().notNull().default('is'),
    becomes: text('becomes').notNull(),
    says: text('says').notNull(),
    also: jsonb('also').$type<string[]>().notNull().default([]),
    off: boolean('off').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Quando è scattata l'ultima volta, per non ripeterla finché non rientra. */
    firedAt: timestamp('fired_at', { withTimezone: true }),
  },
  (table) => [
    index('alerts_owner').on(table.ownerId),
    // la stessa regola due volte manderebbe due avvisi per la stessa porta:
    // lo impedisce il database, anche a due schede che la aggiungono insieme
    uniqueIndex('alerts_same_rule').on(table.deviceId, table.code, table.op, table.becomes),
  ],
);

export const notices = pgTable(
  'notices',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<Notice['kind']>().notNull(),
    /**
     * Di chi si parla. Non è un riferimento con il vincolo: un avviso racconta
     * com'erano le cose quando è successo, e deve restare leggibile anche
     * quando quell'agente non c'è più. Per la stessa ragione il nome e il
     * luogo stanno scritti qui dentro invece di essere ritrovati dopo.
     */
    agentId: text('agent_id'),
    deviceId: text('device_id'),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    who: text('who'),
    /** Su quale luogo stava. La colonna non si chiama «where»: è parola di SQL. */
    placeName: text('place_name'),
    short: text('short'),
    since: timestamp('since', { withTimezone: true }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    sent: integer('sent').notNull().default(0),
    failed: integer('failed').notNull().default(0),
  },
  (table) => [
    index('notices_owner_at').on(table.ownerId, table.at),
    index('notices_agent_at').on(table.agentId, table.at),
    index('notices_device_at').on(table.deviceId, table.at),
  ],
);
