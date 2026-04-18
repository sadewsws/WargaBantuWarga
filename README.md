Nama Anggota Kelompok
Rio Sadewa (418250100590) Ketua
Joel Rondonuwu (41825010011)
Raya Gibran Bachtiar (41825010081)

Cara Instalasi & Menjalankan

1. Persiapan Berkas
Pastikan file `index.html` dan `script.js` berada dalam satu folder yang sama.

2. Konfigurasi Backend (Supabase)
Buka file `script.js` dan pastikan konfigurasi API sudah sesuai dengan project kamu:
- `SUPABASE_URL`: URL project Supabase.
- `SUPABASE_KEY`: Public Anon Key.

3. Menjalankan Server Lokal
Karena aplikasi ini menggunakan ES Modules dan Google Auth, aplikasi tidak bisa dijalankan hanya dengan klik kanan > open file. wajib menggunakan server:
- VS Code: Gunakan ekstensi Live Server**. Klik kanan pada `index.html` lalu pilih *Open with Live Server*.
- Akses: Aplikasi akan berjalan di `http://127.0.0.1:5500`.

Fitur Aplikasi
- Multi-Role: Login sebagai Pelanggan atau Mitra Jasa.
- Smart Search: Cari jasa berdasarkan kategori dan filter.
- Geolocation: Hitung jarak antara lokasi pengguna dengan penyedia jasa.
- Order Tracking: Riwayat pesanan untuk memantau status jasa yang dipesan.
- Auth: Mendukung Login Email/Password dan Google Sign-In.

Stack teknologi yang digunakan
- Frontend: HTML5, Tailwind CSS, JavaScript (Vanilla).
- Backend: Supabase (Auth, Database, Storage).
- Icons: Lucide Icons & Google Material Symbols.
