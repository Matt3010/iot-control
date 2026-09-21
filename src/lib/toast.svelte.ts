export interface ToastAction {
  label: string;
  run: () => void;
}

const PLAIN_MS = 2600;
export const UNDO_MS = 6000;
/** The button leaves before the delete goes out, so a late click cannot undo a done deed. */
const ACTION_MS = UNDO_MS - 400;

class Toast {
  message = $state('');
  action = $state<ToastAction | null>(null);
  /** Bumped on every show so the entrance animation restarts on a repeat. */
  nonce = $state(0);
  open = $state(false);

  #timer: ReturnType<typeof setTimeout> | undefined;

  show(message: string, action: ToastAction | null = null): void {
    this.message = message;
    this.action = action;
    this.nonce += 1;
    this.open = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.hide(), action ? ACTION_MS : PLAIN_MS);
  }

  hide(): void {
    clearTimeout(this.#timer);
    this.open = false;
  }
}

export const toast = new Toast();
