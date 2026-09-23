import fs from 'node:fs/promises';
import { dataFile } from '../config.js';
import { closeDb, db, migrateUp, when } from './db.js';
import {
  agents,
  alerts,
  categories,
  devices,
  groups,
  logEntries,
  maps,
  notices,
  placeAgents,
  placeGroups,
  places,
  pushes,
  scenes,
  users,
} from './schema.js';
import type { Database } from '../types.js';

/**
 * Il trasloco dal file all'archivio.
 *
 * Si lancia una volta sola, quando si passa a Postgres una casa che gira già:
 * legge il `places.json` che c'era e lo riscrive dentro alle tabelle. Non
 * tocca il file — se qualcosa va storto quello resta lì, ed è l'unica copia
 * che si ha finché il trasloco non è finito.
 *
 * Si può rilanciare: ogni riga che c'è già si riconosce dal suo
 * identificativo e viene lasciata stare, invece di fermare tutto a metà.
 */

/** L'ordine conta: un luogo non può nascere prima della sua mappa. */
async function main(): Promise<void> {
  const raw = await fs.readFile(dataFile, 'utf8').catch(() => null);
  if (raw === null) {
    console.log(`niente da traslocare, ${dataFile} non c'è`);
    return;
  }

  const data = JSON.parse(raw) as Partial<Database>;
  const lista = <T>(what: T[] | undefined): T[] => (Array.isArray(what) ? what : []);

  await migrateUp();

  await db.transaction(async (tx) => {
    const quanti: Record<string, number> = {};
    const conta = (cosa: string, righe: unknown[]) => {
      quanti[cosa] = righe.length;
    };

    const utenti = lista(data.users);
    conta('persone', utenti);
    if (utenti.length) {
      await tx
        .insert(users)
        .values(
          utenti.map((one) => ({
            id: one.id,
            email: one.email,
            handle: one.handle,
            salt: one.salt,
            hash: one.hash,
            profileViews: one.profileViews ?? 0,
            profileViewers: one.profileViewers ?? 0,
            profileFollowed: one.profileFollowed ?? 0,
            createdAt: when(one.createdAt) ?? new Date(),
          })),
        )
        .onConflictDoNothing();
    }

    const mappe = lista(data.maps);
    conta('mappe', mappe);
    if (mappe.length) {
      await tx
        .insert(maps)
        .values(
          mappe.map((one) => ({
            id: one.id,
            ownerId: one.ownerId,
            name: one.name,
            slug: one.slug,
            published: one.published ?? false,
            views: one.views ?? 0,
            viewers: one.viewers ?? 0,
            viewsFromProfile: one.viewsFromProfile ?? 0,
            editors: one.editors ?? [],
            createdAt: when(one.createdAt) ?? new Date(),
          })),
        )
        .onConflictDoNothing();
    }

    const cate = lista(data.categories);
    conta('categorie', cate);
    if (cate.length) await tx.insert(categories).values(cate).onConflictDoNothing();

    const gruppi = lista(data.groups);
    conta('gruppi', gruppi);
    if (gruppi.length) await tx.insert(groups).values(gruppi).onConflictDoNothing();

    const agenti = lista(data.agents);
    conta('agenti', agenti);
    if (agenti.length) {
      await tx
        .insert(agents)
        .values(
          agenti.map((one) => ({
            id: one.id,
            ownerId: one.ownerId,
            name: one.name,
            salt: one.salt,
            hash: one.hash,
            lastSeenAt: when(one.lastSeenAt),
            createdAt: when(one.createdAt) ?? new Date(),
          })),
        )
        .onConflictDoNothing();
    }

    const luoghi = lista(data.places);
    conta('luoghi', luoghi);
    if (luoghi.length) {
      await tx
        .insert(places)
        .values(
          luoghi.map((one) => ({
            id: one.id,
            mapId: one.mapId,
            name: one.name,
            categoryId: one.categoryId,
            lat: one.lat,
            lng: one.lng,
            note: one.note ?? '',
            private: one.private ?? false,
            createdAt: when(one.createdAt) ?? new Date(),
          })),
        )
        .onConflictDoNothing();

      // i legami che erano elenchi dentro al luogo diventano righe loro
      const daiGruppi = luoghi.flatMap((one) =>
        [...new Set(one.groupIds ?? [])]
          .filter((groupId) => gruppi.some((group) => group.id === groupId))
          .map((groupId) => ({ placeId: one.id, groupId })),
      );
      if (daiGruppi.length) await tx.insert(placeGroups).values(daiGruppi).onConflictDoNothing();

      const dagliAgenti = luoghi.flatMap((one) =>
        [...new Set(one.agentIds ?? [])]
          .filter((agentId) => agenti.some((agent) => agent.id === agentId))
          .map((agentId) => ({ placeId: one.id, agentId })),
      );
      if (dagliAgenti.length) await tx.insert(placeAgents).values(dagliAgenti).onConflictDoNothing();
    }

    const cose = lista(data.devices);
    conta('dispositivi', cose);
    if (cose.length) {
      await tx
        .insert(devices)
        .values(
          cose.map((one) => ({
            id: one.id,
            ownerId: one.ownerId,
            agentId: one.agentId,
            externalId: one.externalId,
            name: one.name,
            capabilities: one.capabilities ?? [],
            watch: one.watch ?? false,
            lastSeenAt: when(one.lastSeenAt) ?? new Date(),
          })),
        )
        .onConflictDoNothing();
    }

    const sceneggiate = lista(data.scenes);
    conta('scene', sceneggiate);
    if (sceneggiate.length) {
      await tx
        .insert(scenes)
        .values(
          sceneggiate.map((one) => ({
            id: one.id,
            ownerId: one.ownerId,
            name: one.name,
            steps: one.steps ?? [],
            timing: one.when ?? null,
            lastRunAt: one.lastRunAt ?? null,
          })),
        )
        .onConflictDoNothing();
    }

    const registro = lista(data.log).filter((one) => agenti.some((agent) => agent.id === one.agentId));
    conta('righe di registro', registro);
    if (registro.length) {
      await tx
        .insert(logEntries)
        .values(
          registro.map((one) => ({
            id: one.id,
            ownerId: one.ownerId,
            agentId: one.agentId,
            at: when(one.at) ?? new Date(),
            kind: one.kind,
            subject: one.subject ?? null,
            detail: one.detail ?? null,
            ok: one.ok ?? null,
            who: one.who ?? null,
          })),
        )
        .onConflictDoNothing();
    }

    const telefoni = lista(data.pushes);
    conta('telefoni', telefoni);
    if (telefoni.length) {
      await tx
        .insert(pushes)
        .values(
          telefoni.map((one) => ({
            id: one.id,
            userId: one.userId,
            endpoint: one.endpoint,
            p256dh: one.p256dh,
            auth: one.auth,
            agent: one.agent,
            createdAt: when(one.createdAt) ?? new Date(),
            lastOkAt: when(one.lastOkAt),
          })),
        )
        .onConflictDoNothing();
    }

    // una regola su un dispositivo che non c'è più non vale niente
    const regole = lista(data.alerts).filter((one) => cose.some((device) => device.id === one.deviceId));
    conta('regole', regole);
    if (regole.length) {
      await tx
        .insert(alerts)
        .values(
          regole.map((one) => ({
            id: one.id,
            ownerId: one.ownerId,
            deviceId: one.deviceId,
            code: one.code,
            becomes: one.becomes,
            says: one.says,
            also: one.also ?? [],
            off: one.off ?? false,
            createdAt: when(one.createdAt) ?? new Date(),
            firedAt: when(one.firedAt),
          })),
        )
        .onConflictDoNothing();
    }

    const avvenuti = lista(data.notices);
    conta('avvisi avvenuti', avvenuti);
    if (avvenuti.length) {
      await tx
        .insert(notices)
        .values(
          avvenuti.map((one) => ({
            id: one.id,
            ownerId: one.ownerId,
            kind: one.kind,
            agentId: one.agentId ?? null,
            deviceId: one.deviceId ?? null,
            title: one.title,
            body: one.body ?? '',
            who: one.who ?? null,
            placeName: one.where ?? null,
            short: one.short ?? null,
            since: when(one.since),
            at: when(one.at) ?? new Date(),
            sent: one.sent ?? 0,
            failed: one.failed ?? 0,
          })),
        )
        .onConflictDoNothing();
    }

    for (const [cosa, numero] of Object.entries(quanti)) console.log(`${numero} ${cosa}`);
  });

  console.log('trasloco finito. Il file di prima è rimasto dov’era.');
}

await main()
  .catch((error: Error) => {
    console.error(`trasloco non riuscito: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
