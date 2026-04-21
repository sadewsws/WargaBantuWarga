# INSTRUCTION.md — WargaBantuWarga

Panduan langkah-langkah **instalasi & menjalankan** aplikasi yang sudah diuji.

---

## Prasyarat

Pastikan perangkat Anda memiliki:
- Browser modern (Google Chrome, Firefox, Edge — versi terbaru)
- Koneksi internet aktif
- *(Opsional)* Ekstensi **Live Server** di VS Code untuk menjalankan secara lokal

---

## Cara Menjalankan — Opsi 1: Via Hosting (Paling Mudah)

Buka browser dan akses langsung:

```
(https://friendly-marigold-5e0269.netlify.app/)
```

> Tidak perlu instalasi apapun. Website langsung bisa digunakan.

---

## Cara Menjalankan — Opsi 2: Localhost (Lokal)

### Langkah 1 — Clone / Download Repository

**Via Git:**
```bash
git clone https://github.com/sadewsws/wargabantuwarga.git
cd wargabantuwarga
```

**Via ZIP:**
1. Download file ZIP dari GitHub
2. Ekstrak folder
3. Buka folder hasil ekstrak

### Langkah 2 — Struktur File

Pastikan struktur file seperti berikut:
```
wargabantuwarga/
├── index.html       ← File utama aplikasi
├── script.js        ← Semua logika JavaScript
├── README.md        ← Informasi tim & proyek
└── INSTRUCTION.md   ← File ini
```

### Langkah 3 — Jalankan Aplikasi

**Cara A — Klik Langsung (paling mudah):**
1. Buka folder project
2. Double-click file `index.html`
3. Browser akan membuka aplikasi

**Cara B — Via VS Code + Live Server (direkomendasikan):**
1. Buka VS Code
2. Buka folder project: `File → Open Folder`
3. Klik kanan pada `index.html`
4. Pilih **"Open with Live Server"**
5. Browser otomatis terbuka di `http://127.0.0.1:5500`

**Cara C — Via Terminal (Python HTTP Server):**
```bash
# Python 3
python -m http.server 8080

# Buka browser ke:
# http://localhost:8080
```

---

## Fitur yang Memerlukan Internet

> Aplikasi ini menggunakan **Supabase** sebagai backend. Fitur berikut **memerlukan koneksi internet aktif**:

| Fitur | Keterangan |
|-------|------------|
| Login Google | Memerlukan akses ke Google OAuth |
| Daftar / Login Manual | Terhubung ke Supabase Auth |
| Melihat / Menambah Jasa | Data dari database Supabase |
| Chat Real-time | Menggunakan Supabase Realtime (WebSocket) |
| Upload Gambar | Menggunakan Supabase Storage |
| Rating & Ulasan | Tersimpan di database Supabase |

---

## Cara Menggunakan Aplikasi

> **Catatan penting:** Satu akun bisa berganti antara mode **Pencari Jasa** dan **Penyedia Jasa** kapan saja langsung dari Dashboard — tidak perlu membuat akun terpisah.

### Sebagai Pencari Jasa:
1. Buka website → Klik **"Masuk"**
2. Pilih **Login dengan Google** atau daftar manual
3. Di Dashboard, pilih mode **"Butuh Jasa"**
4. Buka halaman **"Telusuri"** untuk mencari jasa
5. Klik jasa → lihat detail & profil penyedia
6. Klik **"Chat"** untuk menghubungi penyedia
7. Setelah selesai, beri **Ulasan & Rating**

### Sebagai Penyedia Jasa:
1. Login → buka **Dashboard**
2. Pilih mode **"Penyedia Jasa"**
3. Tambahkan listing jasa di tab **"Katalog Jasa"**
4. Tunggu & balas pesan dari pencari jasa di menu **"Obrolan"**
5. Lamar kebutuhan yang diposting warga di tab **"Lamaran"**
6. Pantau pendapatan di tab **"Keuangan"**

---

## Konfigurasi (Sudah Terpasang)

File `script.js` sudah dikonfigurasi dengan Supabase project kami:

```javascript
// Konfigurasi ini sudah aktif — tidak perlu diubah untuk demo
const SUPABASE_URL = 'https://hwolvggrgdtduuxdyzdt.supabase.co';
const SUPABASE_KEY = '...'; // Key sudah tertanam di script.js
```

> **Catatan untuk Juri:** Supabase project kami berstatus aktif dan dapat diakses. Data demo sudah tersedia di database.

---

## Struktur Database (Supabase)

Tabel-tabel yang **aktif digunakan**:

| Tabel | Fungsi |
|-------|--------|
| `profiles` | Data profil pengguna |
| `jasa` | Listing jasa yang ditawarkan |
| `kebutuhan` | Postingan kebutuhan dari warga |
| `orders` | Riwayat transaksi & status pesanan |
| `messages` | Pesan chat antar pengguna (real-time) |
| `ratings` / `ulasan` | Rating & ulasan setelah transaksi |
| `komentar` | Komentar pada posting kebutuhan |
| `wishlist` | Jasa favorit pengguna |
| `aplikasi_kebutuhan` | Lamaran dari penyedia ke kebutuhan |
| `users` | Data user Supabase Auth |

> **Catatan:** Tabel `mitra`, `services`, dan `pesanan` merupakan sisa pengembangan awal dan tidak digunakan secara aktif.

> **Catatan RLS:** Row Level Security (RLS) pada beberapa tabel masih belum sepenuhnya diaktifkan. Ini adalah perbaikan yang sedang dalam proses.

---

## AI Tools yang Digunakan

Sesuai ketentuan lomba, berikut adalah AI tools yang digunakan sebagai **alat bantu** pengembangan:

| AI Tool | Kegunaan |
|---------|----------|
| **ChatGPT** | Debugging, menyusun logika fungsi JavaScript, memperbaiki error kode |
| **Claude AI** | Struktur komponen UI, penulisan dokumentasi teknis, optimasi kode |
| **GitHub Copilot** | Autocomplete kode berulang, boilerplate HTML/CSS, refactoring cepat |

> **Penting:** Semua kode telah dipelajari, dimodifikasi, dan dikembangkan secara mandiri oleh tim. AI hanya digunakan sebagai alat bantu — bukan generator kode utama.

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Halaman kosong / error | Pastikan membuka via server (Live Server / Python), bukan double-click langsung |
| Login Google gagal | Pastikan koneksi internet aktif dan tidak menggunakan VPN |
| Data tidak muncul | Refresh halaman (Ctrl+R), pastikan internet aktif |
| Chat tidak real-time | Supabase Realtime butuh koneksi stabil, coba reload |
| Gambar tidak muncul | Koneksi ke Supabase Storage terputus, cek internet |

---

## Informasi Teknis

- **Tidak memerlukan** Node.js, npm, atau build process apapun
- **Tidak ada** file `.env` yang perlu dikonfigurasi
- **Kompatibel** dengan semua OS (Windows, macOS, Linux)
- **Ukuran project** (tanpa node_modules): < 1 MB

