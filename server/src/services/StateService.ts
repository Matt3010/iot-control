import type { StateView } from '../dto/views.js';
import { toStateView } from '../dto/views.js';
import { stateManager } from '../managers/StateManager.js';
import type { Scope } from '../types.js';

/** What the client boots from: one call instead of three. */
export class StateService {
  async snapshot(scope: Scope): Promise<StateView> {
    return toStateView(await stateManager.snapshot(scope));
  }
}

export const stateService = new StateService();
