// Semua konfigurasi dibaca dari environment variable (lihat .env.example).
const isProduction = process.env.NODE_ENV === "production";

export const ENV = {
  isProduction,
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  // Kunci penanda sesi login. Di production WAJIB diisi.
  get jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (secret && secret.length >= 16) return secret;
    if (isProduction) {
      throw new Error(
        "JWT_SECRET wajib diisi (minimal 16 karakter) di production"
      );
    }
    return "kunci-rahasia-khusus-development-jangan-dipakai-di-production";
  },
  // Akun administrator awal, dibuat otomatis jika belum ada admin.
  get adminUsername() {
    return (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
  },
  get adminPassword() {
    return process.env.ADMIN_PASSWORD ?? "admin123";
  },
  get adminName() {
    return process.env.ADMIN_NAME ?? "Admin PinjamKu";
  },
  // "true" / "false" untuk memaksa flag Secure pada cookie; kosong = otomatis.
  get cookieSecure(): boolean | undefined {
    const v = process.env.COOKIE_SECURE;
    return v === "true" ? true : v === "false" ? false : undefined;
  },
};
