# INSTRUCTION.md — WargaBantuWarga

Panduan instalasi dan menjalankan aplikasi WargaBantuWarga.

---

## Informasi Tim

**Nama Tim:** GASPOL BERTIGA

| Nama | NIM | Kelas |
|------|-----|-------|
| Rio Sadewa *(Ketua Tim)* | 41825010059 | Rekayasa Perangkat Lunak |
| Joel Larry Junior Rondonuwu | 41825010011 | Rekayasa Perangkat Lunak |
| Raya Gibran Bachtiar | 41825010081 | Rekayasa Perangkat Lunak |

---

## Cara Menjalankan Aplikasi

### Akses Langsung (Paling Mudah)
```
https://friendly-marigold-5e0269.netlify.app
```
Tidak perlu setup apapun — buka URL di browser dan langsung bisa digunakan.

---

### Menjalankan Secara Lokal

#### Prasyarat
- Browser modern (Chrome, Firefox, Edge, Safari)
- Koneksi internet (untuk Supabase database)
- Opsional: [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) di VS Code

#### Langkah-Langkah

**1. Clone repository**
```bash
git clone https://github.com/GASPOL-BERTIGA/wargabantuwarga.git
cd wargabantuwarga
```

**2. Buka aplikasi**

**Cara A — Langsung buka file:**
```
Klik dua kali pada file index.html
```

**Cara B — Dengan Live Server (VS Code):**
```
1. Buka folder project di VS Code
2. Klik kanan pada index.html
3. Pilih "Open with Live Server"
4. Browser otomatis terbuka di localhost:5500
```

**Cara C — Dengan Python (tanpa ekstensi):**
```bash
# Python 3
python -m http.server 8080

# Lalu buka browser: http://localhost:8080
```

> ⚠️ **Penting:** Tidak perlu `npm install` atau setup backend. Semua library (Tailwind, bcryptjs, Cropper.js) dimuat otomatis via CDN. Database Supabase sudah aktif di cloud.

---

## Struktur File

```
wargabantuwarga/
├── index.html          # Halaman utama aplikasi (SPA)
├── script.js           # Seluruh logika JavaScript
├── README.md           # Dokumentasi proyek
├── INSTRUCTION.md      # File ini — panduan instalasi & running
└── assets/             # (opsional) gambar statis jika ada
```

---

## Ketentuan Teknis

### Jenis Website
- Full Front-End + Back-End sederhana
- Framework: Vanilla HTML + JavaScript + Tailwind CSS
- Database: Supabase (PostgreSQL cloud)

### Spesifikasi
- Responsif: desktop, tablet, dan mobile
- Hosting: Netlify (dapat diakses publik)
- Interaktivitas: Login, API Supabase, database cloud

### Keamanan
- Password di-hash menggunakan **bcrypt** (bcryptjs, cost factor 10)
- Auto-upgrade plain text password lama ke bcrypt saat login
- Tidak ada password yang disimpan dalam bentuk plain text
- Supabase Row Level Security aktif pada tabel sensitif

### AI Tools
Penggunaan AI (Claude oleh Anthropic) sebagai alat bantu pengembangan telah dicantumkan di `README.md` pada bagian **"AI Tools Used"**.

---

## Akun Demo (Opsional)

Untuk mencoba fitur tanpa mendaftar:

| Role | Email | Password |
|------|-------|----------|
| Pelanggan | demo_pelanggan@warga.com | demo123 |
| Mitra Jasa | demo_mitra@warga.com | demo123 |

> Akun demo dibuat saat submission. Jika tidak tersedia, silakan daftar akun baru.

---

## Kontak Tim

| Nama | Email | WhatsApp |
|------|-------|----------|
| Rio Sadewa (Ketua) | sadwwario@gmail.com | 6285894901373 |
| Joel Rondonuwu | joeljuniorjoel@gmail.com | 6281110139102 |
| Raya Gibran | rayagibranbachtiar@gmail.com | 6281381979923 |

---

*Dibuat untuk keperluan akademis — Kelas Rekayasa Perangkat Lunak 2026*
