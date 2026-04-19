# WargaBantuWarga

Platform marketplace jasa berbasis komunitas — menghubungkan pelanggan dengan penyedia jasa lokal di sekitar mereka.

Live: https://friendly-marigold-5e0269.netlify.app

---

## Tim — GASPOL BERTIGA

| Nama | NIM | Peran |
|------|-----|-------|
| Rio Sadewa (Ketua) | 41825010059 | Backend, Database, Deployment |
| Joel Larry Junior Rondonuwu | 41825010011 | Frontend, Chat, Multi Akun |
| Raya Gibran Bachtiar | 41825010081 | Full Stack, Order, Rating |

---

Stack Teknologi

| Layer | Teknologi |
|-------|-----------|
| Frontend | HTML5, Tailwind CSS, Vanilla JavaScript |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Libraries | bcryptjs, Cropper.js, PptxGenJS |
| Deployment | Netlify (frontend), Supabase Cloud (database) |
| Version Control | GitHub |

---

Cara Menjalankan

Opsi 1 — Akses Langsung (Direkomendasikan)
Buka browser dan kunjungi:
```
https://friendly-marigold-5e0269.netlify.app
```

Opsi 2 — Jalankan Lokal
1. Clone repository:
   ```bash
   git clone https://github.com/GASPOL-BERTIGA/wargabantuwarga.git
   cd wargabantuwarga
   ```
2. Buka file `index.html` langsung di browser (double-click), atau gunakan Live Server:
   ```bash
   npx live-server .
   ```
3. Tidak perlu `npm install` — semua library dimuat via CDN.

> Catatan: Database Supabase sudah dikonfigurasi dan aktif. Tidak perlu setup database lokal.

---

AI Tools Used

Proyek ini menggunakan AI sebagai alat bantu pengembangan:

- Claude (Anthropic) — digunakan untuk membantu debugging, penulisan fungsi JavaScript, dan optimasi kode
- Seluruh arsitektur, desain UI, dan logika bisnis dirancang oleh tim GASPOL BERTIGA
- Kode yang dihasilkan AI selalu direview dan dimodifikasi oleh anggota tim sebelum digunakan

---

Fitur Utama

- Login / Register (Email + Google OAuth) dengan bcrypt hash
- Marketplace jasa dengan filter kategori, harga, dan GPS terdekat
- Sistem booking & manajemen pesanan
- Obrolan real-time (chat, reply, hapus pesan)
- Rating & komentar dengan sistem balas
- Wishlist jasa favorit
- Dashboard mitra: Pesanan, Katalog, Keuangan, Reviewer
- Level/badge pelanggan (5 level)
- Multi akun & switch akun
- Halaman Hubungi Kami
