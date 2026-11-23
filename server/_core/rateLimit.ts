// Pembatas percobaan login sederhana (di memori) untuk mencegah tebak password.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

const fails = new Map<string, { count: number; resetAt: number }>();

export function assertLoginAllowed(key: string) {
  const entry = fails.get(key);
  if (!entry) return;
  if (Date.now() > entry.resetAt) {
    fails.delete(key);
    return;
  }
  if (entry.count >= MAX_FAILS) {
    const minutes = Math.ceil((entry.resetAt - Date.now()) / 60000);
    throw new Error(
      `Terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit.`
    );
  }
}

export function recordLoginFailure(key: string) {
  const now = Date.now();
  const entry = fails.get(key);
  if (!entry || now > entry.resetAt) {
    fails.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(key: string) {
  fails.delete(key);
}
