import type { StateView } from '../dto/views.js';
import { toStateView } from '../dto/views.js';
import { stateManager } from '../managers/StateManager.js';

/** What the client boots from: one call instead of three. */
export class StateService {
  async snapshot(ownerId: string): Promise<StateView> {
    return toStateView(await stateManager.snapshot(ownerId));
  }
}

export const stateService = new StateService();
