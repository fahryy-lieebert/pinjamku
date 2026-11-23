# PinjamKu

Sistem informasi peminjaman dan pengembalian barang untuk institusi (sekolah, kampus, kantor, instansi pemerintah).
Alur **Input → Proses → Output** tersambung ke database MySQL.

**Stack:** React + Vite · tRPC · Express · Drizzle ORM · MySQL/MariaDB

## Menjalankan

Butuh Node.js 22+, pnpm, dan satu database MySQL/MariaDB kosong.

```bash
pnpm install
cp .env.example .env     # isi DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD
pnpm dev                 # http://localhost:3000
```

Saat server pertama kali jalan, tabel dibuat otomatis (migrasi di folder `drizzle/`),
akun administrator dibuat dari `ADMIN_USERNAME` / `ADMIN_PASSWORD`, dan 4 data barang contoh diisi.
Tidak perlu layanan login pihak ketiga.

Production: `pnpm build && pnpm start` (atau `docker build`). `JWT_SECRET` wajib diisi
(buat dengan `openssl rand -hex 32`).

## Login

Satu halaman login dengan tiga cara masuk:

| Cara | Untuk | Keterangan |
|---|---|---|
| **Masuk** | Administrator & pengguna terdaftar | username + password |
| **Daftar** | Pengguna baru | buat akun sendiri, otomatis berperan `user` |
| **Tamu** | Pengguna sesaat | cukup tulis nama, tanpa akun (sesi 1 hari) |

Hak akses:

- **Pengguna / tamu:** lihat barang, ajukan peminjaman, lihat transaksi miliknya sendiri.
- **Administrator:** semua yang di atas + kelola barang, setujui/tolak pengajuan, catat pengembalian, laporan CSV, audit log.

Akun admin awal: username `admin`, password dari `ADMIN_PASSWORD` (bawaan `admin123`, segera ganti lewat menu *Ganti password*).
Role admin tidak bisa didapat lewat pendaftaran.

Keamanan: password di-hash (scrypt), sesi berupa JWT di cookie `httpOnly`, percobaan login gagal dibatasi (5x / 15 menit).

## Struktur

```
client/src/pages/Home.tsx    dashboard, data barang, peminjaman, laporan
client/src/pages/Login.tsx   halaman login (masuk / daftar / tamu)
server/routers.ts            semua prosedur API tRPC (auth, catalog, borrowing, audit)
server/_core/auth.ts         hash password + sesi JWT
server/db.ts, server/seed.ts koneksi database, data awal
drizzle/schema.ts            definisi tabel; drizzle/*.sql = migrasi
scripts/                     uji end-to-end (API & browser)
```

Tabel: `users`, `categories`, `items`, `borrowings`, `audit_logs`.
Status transaksi: `Menunggu → Dipinjam → Dikembalikan`, atau `Ditolak`; `Terlambat` otomatis jika lewat tanggal kembali.
Stok berkurang saat disetujui dan bertambah saat dikembalikan, dihitung atomik di database sehingga tidak bisa dobel.

## Pengujian

```bash
pnpm test                                   # unit test (tanpa database)
python3 scripts/e2e.py http://localhost:3000   # alur lengkap via API (server harus jalan)
python3 scripts/ui_smoke.py http://localhost:3000  # alur via browser (butuh: pip install playwright)
```

`pinjamku-demo.html` adalah demo offline satu file (localStorage), bukan bukti koneksi database.
