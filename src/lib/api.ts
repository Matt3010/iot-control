/** Chi vuole sapere che il server ci ha chiuso la porta in faccia. */
let unauthorized: (() => void) | null = null;

export const onUnauthorized = (handler: () => void): void => {
  unauthorized = handler;
};

/** Every call the client makes, in one place, with the server's error text kept. */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status === 401) unauthorized?.();
    throw new Error(detail.error ?? `errore ${response.status}`);
  }
  return (response.status === 204 ? null : await response.json()) as T;
}

const body = (payload: unknown) => JSON.stringify(payload);

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, payload: unknown) => request<T>(path, { method: 'POST', body: body(payload) }),
  put: <T>(path: string, payload: unknown) => request<T>(path, { method: 'PUT', body: body(payload) }),
  patch: <T>(path: string, payload: unknown) => request<T>(path, { method: 'PATCH', body: body(payload) }),
  delete: (path: string, options: RequestInit = {}) =>
    request<null>(path, { method: 'DELETE', ...options }),
};
