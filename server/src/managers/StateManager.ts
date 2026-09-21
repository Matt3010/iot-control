import { store } from '../persistence/JsonStore.js';
import type { Database } from '../types.js';

/** One read for the whole client state: categories, groups and places together. */
export class StateManager {
  snapshot(): Promise<Database> {
    return store.transaction((tx) => tx.data);
  }
}

export const stateManager = new StateManager();
