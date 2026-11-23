# TODO PinjamKu

## Selesai
- [x] Dashboard, data barang (tambah/ubah/hapus), peminjaman, laporan CSV, audit log
- [x] Siklus: ajukan → setujui/tolak → pengembalian, stok otomatis, status Terlambat otomatis
- [x] Semua aksi terhubung ke prosedur tRPC dan tabel MySQL
- [x] Login umum (username+password, daftar, tamu) tanpa OAuth pihak ketiga
- [x] Hak akses di server: pengguna hanya melihat transaksinya sendiri
- [x] Validasi status (tidak bisa setuju/tolak/kembalikan dua kali), stok atomik
- [x] Notifikasi error di UI, migrasi & data awal otomatis saat server start

## Ide pengembangan (opsional)
- [ ] QR Code barang
- [ ] Notifikasi email saat pengajuan diproses / jatuh tempo
- [ ] Integrasi kalender
- [ ] Manajemen akun oleh admin (reset password, jadikan admin)
