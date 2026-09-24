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
import type { Capability } from '../../../shared/protocol.js';
import type { LogEntry, MapEditor, Notice, Op, SceneCondition, SceneStep, SceneTrigger, Timing } from '../types.js';

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
  },
  (table) => [
    // lo stesso agente non racconta due volte la stessa cosa: prima era una
    // ricerca nell'elenco, adesso è una regola che non si può violare
    uniqueIndex('devices_agent_external').on(table.agentId, table.externalId),
    index('devices_owner').on(table.ownerId),
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
     * Quello che deve essere vero perché parta da sola: tutto.
     * La colonna non si chiama «only»: è parola di SQL, come «when».
     */
    only: jsonb('conditions').$type<SceneCondition[]>().notNull().default([]),
  },
  (table) => [index('scenes_owner').on(table.ownerId)],
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
    index('alerts_device_code').on(table.deviceId, table.code),
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
