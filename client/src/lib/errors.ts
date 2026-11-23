// Pesan error validasi zod dari server berbentuk JSON; ubah jadi kalimat biasa.
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(message);
    if (Array.isArray(parsed) && parsed.length && parsed[0]?.message) {
      return parsed
        .map((issue: { message: string }) => issue.message)
        .join(". ");
    }
  } catch {
    // bukan JSON, pakai apa adanya
  }
  return message;
}
