

# PEMBARUAN IMPLEMENTASI FINAL — VERSI DATABASE

## Arsitektur Final

Versi pengumpulan utama menggunakan frontend React, backend Express/tRPC, ORM Drizzle, dan database MySQL. Berbeda dari file `pinjamku-demo.html` yang hanya digunakan sebagai demo offline, sistem utama menyimpan perubahan barang dan transaksi secara permanen di database.

## Login dan Hak Akses

Login bersifat umum dan tidak bergantung pada layanan pihak ketiga. Halaman login menyediakan tiga cara masuk: **Masuk** dengan username dan password, **Daftar** untuk membuat akun pengguna baru, dan **Tamu** yang cukup menulis nama. Password disimpan dalam bentuk hash (scrypt) dan sesi disimpan sebagai JWT pada cookie `httpOnly`.

Administrator awal dibuat otomatis saat server pertama kali berjalan (dari `ADMIN_USERNAME` dan `ADMIN_PASSWORD`). Peran `admin` tidak dapat diperoleh melalui pendaftaran. Pengguna dan tamu hanya melihat transaksi miliknya sendiri; administrator dapat mengelola master barang, memproses transaksi, membuka laporan, dan melihat audit log.

## Tabel Database

- `users`: akun (username, hash password, nama, peran admin/user).
- `categories`: kategori barang.
- `items`: kode, nama, lokasi, kondisi, stok total, dan stok tersedia.
- `borrowings`: nomor transaksi, nama peminjam, barang, jumlah, keperluan, tanggal, status, dan catatan pengembalian.
- `audit_logs`: riwayat aktivitas sistem.

## Alur Database

1. Pengguna mengambil daftar barang dari prosedur backend `catalog.list`.
2. Pengguna mengirim pengajuan melalui `borrowing.create`.
3. Backend memvalidasi stok dan menyimpan transaksi berstatus `Menunggu`.
4. Admin menyetujui atau menolak transaksi melalui prosedur terlindungi.
5. Saat disetujui, stok tersedia berkurang melalui database.
6. Saat dikembalikan, kondisi barang dicatat dan stok tersedia bertambah.
7. Semua aktivitas penting ditulis ke `audit_logs`.

## Kesesuaian dengan Perintah Awal

Sistem final memenuhi input, proses, dan output yang terhubung ke basis data. Input berupa data barang dan pengajuan peminjaman. Proses berupa validasi stok, persetujuan admin, penolakan, dan pengembalian. Output berupa dashboard statistik, status transaksi, laporan, riwayat aktivitas, dan export CSV.

Sistem bermanfaat untuk sekolah, kampus, kantor, organisasi, maupun institusi pemerintahan yang membutuhkan pencatatan aset pinjaman. Frontend dapat dipresentasikan melalui dashboard dan form. Backend dapat dipresentasikan melalui router tRPC, prosedur admin, validasi, serta perubahan stok. Database dapat dipresentasikan melalui lima tabel dan relasinya.

## Pembedaan Dua File

- `pinjamku-demo.html`: demo offline satu file untuk mencoba UI tanpa server. Penyimpanan menggunakan localStorage.
- Proyek utama `client/`, `server/`, dan `drizzle/`: versi pengumpulan utama dengan backend dan MySQL.
