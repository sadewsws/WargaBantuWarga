const SUPABASE_URL = 'https://hwolvggrgdtduuxdyzdt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3b2x2Z2dyZ2R0ZHV1eGR5emR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTQwMTAsImV4cCI6MjA5MTY3MDAxMH0.W8TFYsLr1WoediCkL9ahK6w24tOmvgayDV59uI1x-mY'; // Gunakan key Anda

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,      // Menyimpan sesi di localStorage secara otomatis
    autoRefreshToken: true,    // Memperbarui token secara otomatis sebelum kadaluwarsa
    detectSessionInUrl: true   // Penting jika Anda menggunakan fitur login via email/Google
  }
});


let activeUser = JSON.parse(localStorage.getItem("activeUser")) || null;
let allJasa = [];
let base64Image = "";

// VARIABEL GLOBAL TAMBAHAN (TERMASUK FITUR EDIT)
let currentJasaId = null;
let isEditing = false;
let editId = null;
let selectedCategory = "semua";

// Data Dummy dengan Reviewer
const dummyData = [
    { 
        id: 101, nama: "Service AC Bergaransi", kategori: "Kebersihan", harga: 75000, lokasi: "Jakarta Selatan", 
        wa: "628123456789", deskripsi: "Cuci AC bersih sampai ke filter. Bergaransi 1 bulan.", 
        img: "https://images.unsplash.com/photo-1581094288338-2314ddbd7c2c?w=500",
        reviewer: "Andi Saputra", testimoni: "Sangat rapi kerjanya, AC langsung dingin!" 
    },
    { 
        id: 102, nama: "Katering Harian Sehat", kategori: "Kuliner", harga: 35000, lokasi: "Surabaya", 
        wa: "628123456789", deskripsi: "Masakan rumahan tanpa MSG. Menu berganti setiap hari.", 
        img: "https://images.unsplash.com/photo-1547573854-74d2a71d0826?w=500",
        reviewer: "Siti Aminah", testimoni: "Makanannya enak dan porsinya mengenyangkan." 
    },
    { 
        id: 103, nama: "Servis Laptop & PC", kategori: "Elektronik", harga: 150000, lokasi: "Bandung", 
        wa: "6285712345678", deskripsi: "Instal ulang, ganti thermal paste, dan pembersihan hardware.", 
        img: "https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=500",
        reviewer: "Budi Santoso", testimoni: "Laptop lama jadi ngebut lagi, prosesnya cepat!" 
    },
    { 
        id: 104, nama: "Privat Matematika SMA", kategori: "Edukasi", harga: 100000, lokasi: "Yogyakarta", 
        wa: "6289987654321", deskripsi: "Bimbingan belajar intensif untuk persiapan UTBK/Ujian Sekolah.", 
        img: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=500",
        reviewer: "Rina Putri", testimoni: "Cara mengajarnya enak, materi sulit jadi mudah dipahami." 
    },
    { 
        id: 105, nama: "Tukang Ledeng Bocor", kategori: "Pertukangan", harga: 50000, lokasi: "Semarang", 
        wa: "6281311223344", deskripsi: "Perbaikan pipa bocor, pasang kran, dan instalasi toren air.", 
        img: "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=500",
        reviewer: "Dedi Kurniawan", testimoni: "Sangat responsif, kran wastafel langsung beres." 
    },
    { 
        id: 106, nama: "Fogging Nyamuk DBD", kategori: "Kebersihan", harga: 200000, lokasi: "Jakarta Barat", 
        wa: "6282122334455", deskripsi: "Pembasmian nyamuk dan serangga dengan cairan standar Kemenkes.", 
        img: "https://images.unsplash.com/photo-1585832770484-2ba055c16139?w=500",
        reviewer: "Lina Marlina", testimoni: "Area rumah jadi lebih tenang dari nyamuk." 
    },
    { 
        id: 107, nama: "Gudeg Jogja Kaleng", kategori: "Kuliner", harga: 45000, lokasi: "Solo", 
        wa: "6287733445566", deskripsi: "Gudeg asli Jogja yang dikemas praktis tanpa bahan pengawet.", 
        img: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500",
        reviewer: "Eko Prasetyo", testimoni: "Rasanya otentik, pas banget buat oleh-oleh." 
    },
    { 
        id: 108, nama: "Servis Mesin Cuci", kategori: "Elektronik", harga: 120000, lokasi: "Medan", 
        wa: "6285244556677", deskripsi: "Perbaikan mesin cuci 1 tabung atau 2 tabung segala merk.", 
        img: "https://images.unsplash.com/photo-1626806819282-2c1dfbd1a5e6?w=500",
        reviewer: "Herman Wijaya", testimoni: "Teknisinya ahli, mesin cuci saya nggak berisik lagi." 
    },
    { 
        id: 109, nama: "Jasa Cat Rumah", kategori: "Pertukangan", harga: 500000, lokasi: "Tangerang", 
        wa: "6281855667788", deskripsi: "Jasa pengecatan dinding dalam dan luar ruangan per meter/borongan.", 
        img: "https://images.unsplash.com/photo-1589939705384-5185138a04b9?w=500",
        reviewer: "Siska Dewi", testimoni: "Hasil catnya rata dan pengerjaannya bersih." 
    },
    { 
        id: 110, nama: "Deep Cleaning Kasur", kategori: "Kebersihan", harga: 180000, lokasi: "Bekasi", 
        wa: "6289666778899", deskripsi: "Vakum tungau dan bakteri pada kasur, sofa, dan karpet.", 
        img: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=500",
        reviewer: "Arif Rahman", testimoni: "Anak saya nggak bersin-bersin lagi pas tidur." 
    },
    { 
        id: 111, nama: "Kursus Bahasa Inggris", kategori: "Edukasi", harga: 250000, lokasi: "Malang", 
        wa: "6281277889900", deskripsi: "Fokus pada percakapan (speaking) untuk karir dan studi.", 
        img: "https://images.unsplash.com/photo-1543269865-cbf427effbad?w=500",
        reviewer: "Maya Sari", testimoni: "Materi sangat aplikatif, sekarang saya lebih berani bicara." 
    },
    { 
        id: 112, nama: "Nasi Kebuli Kambing", kategori: "Kuliner", harga: 55000, lokasi: "Jakarta Timur", 
        wa: "6281388990011", deskripsi: "Nasi kebuli rempah melimpah dengan daging kambing empuk.", 
        img: "https://images.unsplash.com/photo-1633945274405-b6c80a9275af?w=500",
        reviewer: "Fajar Shidiq", testimoni: "Dagingnya nggak prengus, rempahnya juara!" 
    },
    { 
        id: 113, nama: "Servis TV LED/LCD", kategori: "Elektronik", harga: 200000, lokasi: "Denpasar", 
        wa: "6285799001122", deskripsi: "Ganti backlight, perbaikan panel, dan mati total.", 
        img: "https://images.unsplash.com/photo-1593359674241-55cd0bed44b5?w=500",
        reviewer: "Ketut Agus", testimoni: "TV hidup lagi dengan harga yang sangat masuk akal." 
    },
    { 
        id: 114, nama: "Pasang Kanopi Baja Ringan", kategori: "Pertukangan", harga: 1200000, lokasi: "Depok", 
        wa: "6281900112233", deskripsi: "Pemasangan kanopi rumah dengan atap spandek atau polycarbonate.", 
        img: "https://images.unsplash.com/photo-1622325725946-95333f2c9f0c?w=500",
        reviewer: "Tono Widodo", testimoni: "Kanopi kokoh, pengerjaan cuma 2 hari." 
    },
    { 
        id: 115, nama: "Cuci Sepatu Premium", kategori: "Kebersihan", harga: 40000, lokasi: "Bandung", 
        wa: "6285611223344", deskripsi: "Deep clean sepatu sneakers, leather, hingga heels.", 
        img: "https://images.unsplash.com/photo-1520639889410-1dfa465ed6f9?w=500",
        reviewer: "Gita Amalia", testimoni: "Sepatu lama kelihatan kayak baru lagi, wangi juga." 
    },
    { 
        id: 116, nama: "Belajar Coding Dasar", kategori: "Edukasi", harga: 300000, lokasi: "Online", 
        wa: "6281222334455", deskripsi: "Belajar HTML, CSS, dan JavaScript untuk pemula.", 
        img: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500",
        reviewer: "Kevin Adrian", testimoni: "Sangat membantu buat saya yang baru mau pindah karir." 
    },
    { 
        id: 117, nama: "Salad Buah Segar", kategori: "Kuliner", harga: 20000, lokasi: "Palembang", 
        wa: "6282133445566", deskripsi: "Buah potong segar dengan saus mayo homemade dan keju.", 
        img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500",
        reviewer: "Yanti Rahayu", testimoni: "Buahnya segar-segar, saus mayonya nggak bikin eneg." 
    },
    { 
        id: 118, nama: "Instalasi CCTV", kategori: "Elektronik", harga: 450000, lokasi: "Makassar", 
        wa: "6285244556677", deskripsi: "Pasang paket CCTV 4 kamera bisa dipantau lewat HP.", 
        img: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=500",
        reviewer: "Andi Bau", testimoni: "Hasil gambar jernih, konfigurasi ke HP dibantu sampai bisa." 
    },
    { 
        id: 119, nama: "Sedot WC Tanpa Bongkar", kategori: "Kebersihan", harga: 350000, lokasi: "Jakarta Utara", 
        wa: "6287855667788", deskripsi: "Pelancaran saluran mampet dan kuras septic tank.", 
        img: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=500",
        reviewer: "Indra Jaya", testimoni: "Petugas sopan dan kerjanya tuntas tanpa kotor." 
    },
    { 
        id: 120, nama: "Perbaikan Atap Bocor", kategori: "Pertukangan", harga: 150000, lokasi: "Surabaya", 
        wa: "6281366778899", deskripsi: "Tambal atap bocor dan ganti genteng pecah.", 
        img: "https://images.unsplash.com/photo-1632759162352-78b9f09d846e?w=500",
        reviewer: "Rudi Hartono", testimoni: "Pas banget musim hujan begini, atap langsung aman." 
    },
    { 
        id: 121, nama: "Pelatihan Public Speaking", kategori: "Edukasi", harga: 150000, lokasi: "Semarang", 
        wa: "6281277889900", deskripsi: "Atasi grogi dan tingkatkan kepercayaan diri saat presentasi.", 
        img: "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=500",
        reviewer: "Mega Utami", testimoni: "Tips-tipsnya praktis dan langsung bisa dipraktekkan." 
    },
    { 
        id: 122, nama: "Dimsum Ayam Udang", kategori: "Kuliner", harga: 15000, lokasi: "Balikpapan", 
        wa: "6281188990011", deskripsi: "Isi 4 pcs per porsi dengan chilli oil pedas mantap.", 
        img: "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=500",
        reviewer: "Beni Saputra", testimoni: "Daging ayamnya berasa banget, chilli oilnya juara!" 
    },
    { 
        id: 123, nama: "Servis Mesin Kopi", kategori: "Elektronik", harga: 250000, lokasi: "Jakarta Pusat", 
        wa: "6281233445566", deskripsi: "Perbaikan grinder, espresso machine, dan kalibrasi suhu.", 
        img: "https://images.unsplash.com/photo-1510525009512-ad7fc13eefab?w=500",
        reviewer: "Fandi Ahmad", testimoni: "Kopi kantor jadi enak lagi, teknisinya paham banget." 
    },
    { 
        id: 124, nama: "Martabak Manis Premium", kategori: "Kuliner", harga: 60000, lokasi: "Bandung", 
        wa: "6285677889900", deskripsi: "Martabak dengan mentega wisman dan topping cokelat kacang melimpah.", 
        img: "https://images.unsplash.com/photo-1621348335014-9960787e7428?w=500",
        reviewer: "Dewi Lestari", testimoni: "Adonannya lembut banget meski sudah dingin." 
    },
    { 
        id: 125, nama: "Les Lukis Anak", kategori: "Edukasi", harga: 120000, lokasi: "Yogyakarta", 
        wa: "6289911223344", deskripsi: "Pelatihan menggambar dan mewarnai dengan media cat air untuk usia 5-12 tahun.", 
        img: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=500",
        reviewer: "Ibu Ratna", testimoni: "Anak saya jadi makin kreatif dan senang melukis." 
    },
    { 
        id: 126, nama: "Basmi Rayap Bergaransi", kategori: "Kebersihan", harga: 750000, lokasi: "Depok", 
        wa: "6282133445566", deskripsi: "Injeksi cairan anti rayap untuk kusen dan perabot kayu rumah.", 
        img: "https://images.unsplash.com/photo-1585832770484-2ba055c16139?w=500",
        reviewer: "Bambang Joyo", testimoni: "Rayap di lemari hilang total, garansinya beneran aman." 
    },
    { 
        id: 127, nama: "Pasang Pagar Besi", kategori: "Pertukangan", harga: 1500000, lokasi: "Tangerang", 
        wa: "6281355667788", deskripsi: "Pembuatan dan pemasangan pagar besi minimalis atau tempa.", 
        img: "https://images.unsplash.com/photo-1505230811212-495e92b1b47d?w=500",
        reviewer: "Hendra Wijaya", testimoni: "Las-lasannya rapi dan catnya sangat halus." 
    },
    { 
        id: 128, nama: "Servis Speaker Aktif", kategori: "Elektronik", harga: 85000, lokasi: "Solo", 
        wa: "6285711223344", deskripsi: "Perbaikan suara pecah, mati sebelah, atau ganti komponen kapasitor.", 
        img: "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=500",
        reviewer: "Doni Setiawan", testimoni: "Speaker lama hidup lagi, suara ngebass mantap." 
    },
    { 
        id: 129, nama: "Soto Ayam Ambengan", kategori: "Kuliner", harga: 22000, lokasi: "Surabaya", 
        wa: "6281299001122", deskripsi: "Soto ayam khas Surabaya dengan koya gurih yang melimpah.", 
        img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500",
        reviewer: "Anton Medan", testimoni: "Koyanya mantap, porsi daging ayamnya nggak pelit." 
    },
    { 
        id: 130, nama: "Belajar TOEFL Online", kategori: "Edukasi", harga: 400000, lokasi: "Nasional", 
        wa: "6287711223344", deskripsi: "Kelas intensif 2 minggu untuk kejar skor TOEFL 500+.", 
        img: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=500",
        reviewer: "Lulu Jubaidah", testimoni: "Skor saya naik dari 420 jadi 515, worth it banget!" 
    },
    { 
        id: 131, nama: "Cuci Gorden & Vitrase", kategori: "Kebersihan", harga: 15000, lokasi: "Bekasi", 
        wa: "6281344556677", deskripsi: "Pencucian gorden per meter lari dengan jemput antar gratis.", 
        img: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500",
        reviewer: "Mila Karmila", testimoni: "Gorden jadi wangi dan warnanya cerah lagi." 
    },
    { 
        id: 132, nama: "Tukang Kayu Custom", kategori: "Pertukangan", harga: 2000000, lokasi: "Bali", 
        wa: "6285211223344", deskripsi: "Pembuatan kitchen set, lemari pakaian, dan meja kayu jati.", 
        img: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=500",
        reviewer: "Wayandi", testimoni: "Desainnya presisi sesuai permintaan saya." 
    },
    { 
        id: 133, nama: "Instalasi Jaringan WiFi", kategori: "Elektronik", harga: 300000, lokasi: "Palembang", 
        wa: "6281977889900", deskripsi: "Setting mikrotik, perluasan jangkauan WiFi, dan manajemen bandwidth.", 
        img: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=500",
        reviewer: "Roni Saputra", testimoni: "Sinyal WiFi sekarang full sampai ke lantai atas." 
    },
    { 
        id: 134, nama: "Sambal Bakar Pedas", kategori: "Kuliner", harga: 30000, lokasi: "Makassar", 
        wa: "6281144556677", deskripsi: "Lauk ayam atau bebek dibakar di atas cobek dengan sambal super pedas.", 
        img: "https://images.unsplash.com/photo-1544025162-d76694265947?w=500",
        reviewer: "Andi Fatimah", testimoni: "Pedasnya nampol, bikin nambah nasi terus!" 
    },
    { 
        id: 135, nama: "Kursus Piano Klasik", kategori: "Edukasi", harga: 180000, lokasi: "Semarang", 
        wa: "6285811223344", deskripsi: "Metode belajar piano dari dasar untuk anak dan dewasa.", 
        img: "https://images.unsplash.com/photo-1520529986991-34c7136f15ae?w=500",
        reviewer: "Rian Hidayat", testimoni: "Gurunya sabar banget ngajar jari yang masih kaku." 
    },
    { 
        id: 136, nama: "Pembersihan Kolam Renang", kategori: "Kebersihan", harga: 450000, lokasi: "Manado", 
        wa: "6281255667788", deskripsi: "Vakum dasar kolam, cek kadar pH kaporit, dan kuras filter.", 
        img: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=500",
        reviewer: "Vicky Luman", testimoni: "Air kolam jadi jernih banget kayak di hotel bintang 5." 
    },
    { 
        id: 137, nama: "Pasang Plafon Gypsum", kategori: "Pertukangan", harga: 95000, lokasi: "Padang", 
        wa: "6285311223344", deskripsi: "Pemasangan plafon gypsum model minimalis atau drop ceiling.", 
        img: "https://images.unsplash.com/photo-1505798577917-a65157d3320a?w=500",
        reviewer: "Zul Arifin", testimoni: "Pengerjaannya cepat dan sambungannya nggak kelihatan." 
    },
    { 
        id: 138, nama: "Servis Drone", kategori: "Elektronik", harga: 500000, lokasi: "Bandung", 
        wa: "6281211223344", deskripsi: "Ganti motor, perbaikan gimbal, dan kalibrasi sensor GPS.", 
        img: "https://images.unsplash.com/photo-1473963406462-51dff422b49c?w=500",
        reviewer: "Irfan Hakim", testimoni: "Drone saya yang habis jatuh bisa terbang stabil lagi." 
    },
    { 
        id: 139, nama: "Bebek Goreng Madura", kategori: "Kuliner", harga: 38000, lokasi: "Malang", 
        wa: "6281311223344", deskripsi: "Bebek goreng bumbu hitam rempah asli Madura.", 
        img: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=500",
        reviewer: "Santi Nur", testimoni: "Bumbu hitamnya meresap sampai ke tulang." 
    },
    { 
        id: 140, nama: "Pelatihan SEO & Marketing", kategori: "Edukasi", harga: 550000, lokasi: "Online", 
        wa: "6285611223344", deskripsi: "Cara optimasi website agar masuk halaman 1 Google.", 
        img: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500",
        reviewer: "Taufik H", testimoni: "Dapat insight baru tentang keyword research dan backlink." 
    },
    { 
        id: 141, nama: "Jasa Poles Lantai Marmer", kategori: "Kebersihan", harga: 35000, lokasi: "Lombok", 
        wa: "6287811223344", deskripsi: "Kristalisasi marmer dan granit agar mengkilap seperti baru.", 
        img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=500",
        reviewer: "Putu Gede", testimoni: "Lantai kusam di rumah jadi kinclong lagi." 
    },
    { 
        id: 142, nama: "Tukang Las Stainless", kategori: "Pertukangan", harga: 1200000, lokasi: "Pekanbaru", 
        wa: "6285277889900", deskripsi: "Pembuatan railing tangga, balkon, dan jemuran bahan stainless steel.", 
        img: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=500",
        reviewer: "Eka Putra", testimoni: "Bahannya tebal dan nggak gampang karatan." 
    }
    
];

document.addEventListener("DOMContentLoaded", () => {
    updateAuthUI();
    initDragAndDrop();
    fetchJasa();
    renderOrders();
});

// --- NAVIGATION ---
function showPage(id) {
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(id === 'dashboard') fetchMyJasa();
    window.scrollTo(0,0);
}

function toggleMobileMenu() {
    const menu = document.getElementById("mobileMenu");
    menu.classList.toggle("hidden");
    
    const extra = document.getElementById("mobileMenuExtra");
    if(activeUser) {
        extra.innerHTML = `
            <p class="text-sm font-bold text-slate-400">Akun: ${activeUser.email}</p>
            <button onclick="logout()" class="w-full bg-red-50 text-red-600 py-4 rounded-xl font-bold text-left px-6">Keluar Akun</button>
        `;
    } else {
        extra.innerHTML = `<button onclick="showPage('loginPage'); toggleMobileMenu()" class="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">Masuk / Daftar</button>`;
    }
}

// --- AUTH LOGIC ---
async function handleLogin() {
    const email = document.getElementById("logEmail").value;
    const pass = document.getElementById("logPass").value;
    const { data, error } = await _supabase.from('users').select('*').eq('email', email).eq('password', pass).single();
    if (error || !data) return alert("Email atau password salah!");
    activeUser = data;
    localStorage.setItem("activeUser", JSON.stringify(activeUser));
    location.reload();
}

async function handleRegister() {
    const email = document.getElementById("regEmail").value;
    const pass = document.getElementById("regPass").value;
    const role = document.getElementById("regRole").value;
    const { error } = await _supabase.from('users').insert([{ email, password: pass, role }]);
    if (error) return alert("Daftar Gagal!");
    alert("Berhasil! Silakan Login.");
    showPage('loginPage');
}

function logout() {
    localStorage.removeItem("activeUser");
    location.reload();
}

function updateAuthUI() {
    const status = document.getElementById("authStatus");
    const navPenjasa = document.getElementById("navPenjasa");
    if (activeUser) {
        status.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-800">${activeUser.email.split('@')[0]}</span>
                <button onclick="logout()" class="text-red-500 text-xs font-bold uppercase underline">Logout</button>
            </div>`;
        if(activeUser.role === 'penjasa') {
            navPenjasa.innerHTML = `<button onclick="showPage('dashboard')" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md">Dashboard Mitra</button>`;
        }
    } else {
        status.innerHTML = `<button onclick="showPage('loginPage')" class="bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg">Login</button>`;
    }
}

// --- FITUR PENCARIAN & FILTER ---
function applyFilters() {
    const query = document.getElementById("searchInput").value.toLowerCase();
    const sortValue = document.getElementById("sortFilter").value;

    let filtered = allJasa.filter(j => {
        // Cek Nama/Lokasi
        const matchQuery = j.nama.toLowerCase().includes(query) || j.lokasi.toLowerCase().includes(query);
        // Cek Kategori (Baru)
        const matchCategory = (selectedCategory === "semua") || (j.kategori === selectedCategory);
        
        return matchQuery && matchCategory;
    });

    // Logic sorting (biar harga termurah/termahal tetap jalan)
    if (sortValue === "termurah") {
        filtered.sort((a, b) => a.harga - b.harga);
    } else if (sortValue === "termahal") {
        filtered.sort((a, b) => b.harga - a.harga);
    } else {
        filtered.sort((a, b) => b.id - a.id);
    }

    renderJasa(filtered);
}

// --- FITUR TAMBAH & EDIT JASA ---
async function tambahJasa() {
    if (!activeUser) return alert("Silakan Login terlebih dahulu.");
    
    const nama = document.getElementById("pName").value;
    const kategori = document.getElementById("pCategory").value; 
    const harga = document.getElementById("pPrice").value;
    const wa = document.getElementById("pWA").value;
    const lokasi = document.getElementById("pLoc").value;
    const deskripsi = document.getElementById("pDesc").value;

    if (!nama || !kategori || !harga || !wa) return alert("Mohon lengkapi data utama!");

    const payload = {
        nama,
        kategori,
        harga: parseInt(harga),
        wa,
        lokasi,
        deskripsi,
        img: base64Image || "https://via.placeholder.com/300",
        owner_email: activeUser.id 
    };

    let result;
    if (isEditing) {
        // Saat edit, pastikan user hanya bisa edit jasanya sendiri
        result = await _supabase.from('jasa')
            .update(payload)
            .eq('id', editId)
            .eq('user_id', activeUser.id);
    } else {
        result = await _supabase.from('jasa').insert([payload]);
    }

    if (result.error) {
        alert("Gagal: " + result.error.message);
    } else {
        alert(isEditing ? "Jasa diperbarui!" : "Jasa diterbitkan!");
        // Jangan reload seluruh halaman agar UX lebih mulus
        showPage('dashboard'); 
        fetchMyJasa(); // Panggil fungsi ini untuk refresh angka di dashboard
    }
}

function persiapanEdit(jasa) {
    isEditing = true;
    editId = jasa.id;
    showPage('dashboard');
    
    // Isi semua input dengan data lama
    document.getElementById("pName").value = jasa.nama;
    
    // INI BARIS BARU: Supaya dropdown otomatis kepilih kategori yang lama
    document.getElementById("pCategory").value = jasa.kategori || ""; 
    
    document.getElementById("pPrice").value = jasa.harga;
    document.getElementById("pWA").value = jasa.wa;
    document.getElementById("pLoc").value = jasa.lokasi;
    document.getElementById("pDesc").value = jasa.deskripsi;
    
    // ... kode di bawahnya (preview image & ganti warna tombol) biarkan saja
    if(jasa.img) {
        const preview = document.getElementById("preview-img");
        const text = document.getElementById("drop-text");
        if(preview) {
            preview.src = jasa.img;
            preview.classList.remove("hidden");
        }
        if(text) text.classList.add("hidden");
        base64Image = jasa.img;
    }

    const btn = document.querySelector("#dashboard button[onclick='tambahJasa()']");
    if(btn) {
        btn.innerText = "Simpan Perubahan";
        btn.classList.replace("bg-blue-600", "bg-orange-500");
    }
}

// --- MARKETPLACE & JASA LOGIC ---
async function fetchJasa() {
    const { data, error } = await _supabase.from('jasa').select('*');
    allJasa = (error || !data) ? dummyData : [...data, ...dummyData];
    renderJasa(allJasa);
}

function renderJasa(list) {
    const mainContainer = document.getElementById("jasaContainer"); // Container halaman depan
    const dashboardContainer = document.getElementById("myJasaList"); // Container dashboard mitra

    // Tampilan untuk Halaman Utama (Kartu Besar)
    if (mainContainer) {
        mainContainer.innerHTML = list.map(j => `
            <div class="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                <img src="${j.img || 'https://via.placeholder.com/150'}" class="w-full h-40 object-cover rounded-2xl mb-3">
                <h3 class="font-bold text-slate-800">${j.nama}</h3>
                <p class="text-blue-600 font-black">Rp ${Number(j.harga).toLocaleString()}</p>
                <button onclick='openDetail(${JSON.stringify(j).replace(/"/g, '&quot;')})' 
                        class="w-full mt-3 bg-slate-50 py-2 rounded-xl font-bold text-slate-600 hover:bg-blue-600 hover:text-white transition">
                    Lihat Detail
                </button>
            </div>
        `).join("");
    }

    // Tampilan untuk Dashboard (Baris dengan tombol Edit/Hapus)
    if (dashboardContainer && activeUser) {
        // Filter hanya milik user aktif jika di dashboard
        const myOwn = list.filter(j => j.owner_email === activeUser.email);
        
        dashboardContainer.innerHTML = myOwn.map(j => `
            <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl mb-2 border border-slate-100">
                <div class="flex items-center gap-3">
                    <img src="${j.img}" class="w-10 h-10 rounded-lg object-cover">
                    <div>
                        <p class="font-bold text-sm text-slate-800">${j.nama}</p>
                        <p class="text-xs text-blue-600 font-bold">Rp ${Number(j.harga).toLocaleString()}</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick='persiapanEdit(${JSON.stringify(j).replace(/"/g, '&quot;')})' class="text-orange-500">✏️</button>
                    <button onclick="hapusJasa(${j.id})" class="text-red-500">🗑️</button>
                </div>
            </div>
        `).join("");
    }
}

function openDetail(jasa) {
    currentJasaId = jasa.id;
    document.getElementById("modalNama").innerText = jasa.nama;
    document.getElementById("modalHarga").innerText = "Rp " + Number(jasa.harga).toLocaleString();
    document.getElementById("modalDesc").innerText = jasa.deskripsi || "Tidak ada deskripsi.";
    document.getElementById("modalImg").src = jasa.img || 'https://via.placeholder.com/300';
    
    const inputArea = document.getElementById("commentInputArea");
    const warning = document.getElementById("commentLoginWarning");
    
    if (activeUser) {
        if(inputArea) inputArea.classList.remove("hidden");
        if(warning) warning.classList.add("hidden");
    } else {
        if(inputArea) inputArea.classList.add("hidden");
        if(warning) warning.classList.remove("hidden");
    }

    renderComments();
    document.getElementById("detailModal").classList.remove("hidden");
    document.getElementById("btnOrderNow").onclick = () => simpanDanPesan(jasa);
}

// --- FITUR KOMENTAR CLOUD (SUPABASE) ---
async function tambahKomentar() {
    const input = document.getElementById("commentText");
    const btnKirim = document.querySelector("button[onclick='tambahKomentar()']");
    
    try {
        // 1. Ambil User & Cek Sesi
        const { data: { user }, error: authError } = await _supabase.auth.getUser();
        if (authError || !user) throw new Error("Sesi habis. Silakan Login kembali!");
        
        if (!input || !input.value.trim()) return;

        // 2. Loading State
        if (btnKirim) { btnKirim.disabled = true; btnKirim.innerText = "..."; }

        // 3. VALIDASI: Cek apakah user sudah punya username di tabel profiles
        // Ini untuk mencegah error sinkronisasi saat render nanti
        const { data: profile, error: profileError } = await _supabase
            .from('profiles')
            .select('username')
            .eq('id', user.id)
            .single();

        if (profileError || !profile?.username) {
            alert("Silakan isi username di 'Edit Profil' terlebih dahulu sebelum berkomentar!");
            return; // Berhenti di sini jika profil belum siap
        }

        // 4. INSERT DATA
        const { error: insertError } = await _supabase.from('komentar').insert([{
            jasa_id: currentJasaId, 
            user_id: user.id,
            isi_komentar: input.value.trim()
        }]);

        if (insertError) throw insertError;

        // 5. CLEAR & REFRESH
        input.value = "";
        await renderComments(); // Pastikan renderComments sudah pakai profiles!user_id
        
    } catch (err) {
        console.error("Komentar Error:", err);
        alert(err.message);
    } finally {
        if (btnKirim) { 
            btnKirim.disabled = false; 
            btnKirim.innerText = "Kirim"; 
        }
    }
}

async function renderComments() {
    const container = document.getElementById("commentList");
    // Pastikan currentJasaId tersedia agar tidak melakukan query tanpa filter yang jelas
    if (!container || !currentJasaId) return;

    try {
        // 1. Feedback Visual Loading
        container.innerHTML = `
            <div class="flex flex-col items-center py-4">
                <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mb-2"></div>
                <p class="text-[10px] text-slate-400 italic">Memuat komentar...</p>
            </div>`;

        // 2. Query Data dengan Relasi Eksplisit
        // Menggunakan 'username' sesuai perubahan terbaru pada skema tabel profiles
        const { data: listKomentar, error } = await _supabase
            .from('komentar')
            .select(`
                isi_komentar,
                created_at,
                profiles!user_id ( 
                    username 
                )
            `) 
            .eq('jasa_id', currentJasaId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // 3. Penanganan Jika Belum Ada Komentar
        if (!listKomentar || listKomentar.length === 0) {
            container.innerHTML = `
                <div class="text-center py-6">
                    <p class="text-xs text-slate-400 italic">Belum ada komentar di sini.</p>
                </div>`;
            return;
        }

        // 4. Render Data ke HTML
        container.innerHTML = listKomentar.map(c => {
            // Sinkronisasi: Pastikan mengambil 'username' dari objek profiles
            const displayName = c.profiles?.username || "Anonymous";
            
            // Format waktu yang lebih informatif (menunjukkan tanggal jika bukan hari ini)
            const commentDate = new Date(c.created_at);
            const isToday = new Date().toDateString() === commentDate.toDateString();
            
            const timeDisplay = commentDate.toLocaleTimeString('id-ID', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            const dateDisplay = isToday ? "Hari ini" : commentDate.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short'
            });

            return `
                <div class="bg-white p-3 rounded-xl border border-slate-100 mb-3 shadow-sm hover:border-blue-200 transition-all group">
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex items-center gap-1.5">
                            <div class="w-5 h-5 bg-blue-50 rounded-full flex items-center justify-center">
                                <span class="text-[8px] font-bold text-blue-500">${displayName.charAt(0).toUpperCase()}</span>
                            </div>
                            <p class="text-[10px] font-bold text-blue-600">@${displayName}</p>
                        </div>
                        <p class="text-[8px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">${dateDisplay}, ${timeDisplay}</p>
                    </div>
                    <p class="text-sm text-slate-700 leading-relaxed pl-6">${c.isi_komentar}</p>
                </div>`;
        }).join("");

    } catch (err) {
        console.error("Render Error:", err);
        container.innerHTML = `
            <div class="p-4 bg-red-50 rounded-xl border border-red-100 text-center">
                <p class="text-red-500 text-[10px] font-bold mb-1">Gagal memuat komentar</p>
                <p class="text-[9px] text-red-400 leading-tight">${err.message || "Masalah koneksi database"}</p>
                <button onclick="renderComments()" class="mt-2 text-[9px] text-red-600 underline font-semibold">Coba lagi</button>
            </div>`;
    }
}

// --- INTEGRASI PESANAN & WHATSAPP ---
// --- INTEGRASI PESANAN & WHATSAPP (DENGAN DETAIL WAKTU) ---
async function simpanDanPesan(jasa) {
    if (!activeUser) return alert("Silakan Login terlebih dahulu.");

    const orderPayload = {
        jasa_id: jasa.id,
        jasa_nama: jasa.nama,
        harga: jasa.harga,
        buyer_email: activeUser.email, 
        owner_email: jasa.owner_email,
        status: "Pesanan berhasil dibuat"
    };

    const { data, error } = await _supabase
        .from('orders')
        .insert([orderPayload])
        .select()
        .single();

    if (error) return alert("Gagal memproses pesanan.");

    // Update LocalStorage untuk Riwayat Pembeli
    let history = JSON.parse(localStorage.getItem("riwayat_pesanan")) || [];
    history.push({
        ...orderPayload,
        id: data.id,
        tglFull: new Date().toISOString() // Simpan ISO string agar bisa di-parse Date()
    });
    localStorage.setItem("riwayat_pesanan", JSON.stringify(history));

    // Refresh UI riwayat secara otomatis
    renderOrders();

    const pesan = `Halo, saya tertarik dengan jasa "${jasa.nama}". (Order ID: ${data.id})`;
    window.open(`https://wa.me/${jasa.wa}?text=${encodeURIComponent(pesan)}`, '_blank');
}

// --- RENDER RIWAYAT PESANAN (DENGAN TOMBOL INVOICE) ---
// Cari fungsi yang merender riwayat pesanan
// Cari fungsi yang merender riwayat pesanan
// --- RENDER RIWAYAT PESANAN ---
// Simpan data order secara global sementara agar mudah diakses fungsi cetak
// Variabel global untuk menyimpan data pesanan agar bisa diakses prosesCetak(index)
let currentOrders = [];

async function renderOrders() {
    const container = document.getElementById("orderList");
    if (!container) return;

    // 1. PROTEKSI UTAMA: Cek apakah user sudah login
    // activeUser (atau currentUser) harus sudah terdefinisi sebelum memanggil .email
    if (!activeUser || !activeUser.email) {
        console.warn("renderOrders ditunda: User belum login.");
        container.innerHTML = `<p class="text-slate-400 italic text-center">Silakan login untuk melihat pesanan.</p>`;
        return;
    }

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p class="text-slate-400 italic text-sm">Memuat riwayat...</p>
        </div>
    `;

    try {
        // 2. Gunakan client yang konsisten (_supabase atau supabase sesuai init kamu)
        const { data, error } = await _supabase
            .from('orders')
            .select('*')
            .eq('buyer_email', activeUser.email)
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        currentOrders = data || [];

        if (currentOrders.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10">
                    <p class="text-slate-400 italic">Belum ada riwayat pesanan.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = currentOrders.map((order, index) => {
            const harga = Number(order.harga) || 0;
            const namaJasa = order.jasa_nama || order.nama || "Jasa Layanan";
            const tanggal = new Date(order.created_at).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
            
            return `
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center mb-4 hover:border-blue-200 transition-colors">
                    <div>
                        <h4 class="font-bold text-slate-800 text-base mb-1">${namaJasa}</h4>
                        <p class="text-[11px] text-slate-400 mb-2">${tanggal}</p>
                        <div class="text-blue-600 font-extrabold text-sm">Rp ${harga.toLocaleString('id-ID')}</div>
                    </div>
                    
                    <div class="flex items-center gap-3">
                        <span class="px-3 py-1 rounded-full text-[9px] font-bold uppercase ${
                            order.status === 'SELESAI' 
                            ? 'bg-green-50 text-green-600 border border-green-100' 
                            : 'bg-blue-50 text-blue-600 border border-blue-100'
                        }">
                            ${order.status || 'DIPROSES'}
                        </span>
                        
                        <button onclick="prosesCetak(${index})" 
                                title="Cetak Invoice"
                                class="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-blue-600 transition-all shadow-sm active:scale-95">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                <rect x="6" y="14" width="12" height="8"></rect>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Gagal render orders:", error);
        container.innerHTML = `
            <div class="bg-red-50 p-4 rounded-xl text-red-600 text-center text-sm">
                Gagal memuat data: ${error.message}
            </div>
        `;
    }
}

// Fungsi jembatan untuk memastikan data terkirim sebagai objek utuh
function prosesCetak(index) {
    const selectedOrder = currentOrders[index];
    if (selectedOrder) {
        cetakInvoice(selectedOrder);
    } else {
        alert("Data pesanan tidak ditemukan.");
    }
}

// --- FUNGSI CETAK INVOICE ---
async function cetakInvoice(order) {
    // 1. SINKRONISASI DATA (Penting!)
    // Gunakan fallback '||' agar jika data kosong, invoice tidak tertulis 'undefined'
    const namaJasa = order.jasa_nama || order.nama || "Jasa Tidak Diketahui";
    const hargaJasa = order.harga || 0;
    const emailPemesan = order.buyer_email || (typeof activeUser !== 'undefined' ? activeUser.email : "Guest");
    
    // 2. HANDLING TANGGAL
    // Pakai created_at (standar Supabase) jika tglFull tidak ada
    const tanggalMentah = order.tglFull || order.created_at || new Date();
    const dateObj = new Date(tanggalMentah);
    const formatFull = dateObj.toLocaleString('id-ID', { 
        dateStyle: 'full', 
        timeStyle: 'short' 
    });

    // 3. GENERATE ID (Ambil 6 digit terakhir dari UUID Supabase)
    const invoiceID = order.id ? order.id.toString().slice(-6).toUpperCase() : "000000";

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Invoice #${invoiceID}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Plus Jakarta Sans', sans-serif; }
                    @media print {
                        .no-print { display: none; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body class="bg-slate-50 p-0 sm:p-10">
                <div class="max-w-xl mx-auto bg-white border-2 border-slate-100 p-10 rounded-[2rem] shadow-2xl shadow-slate-200">
                    <div class="flex justify-between items-start mb-10">
                        <div>
                            <h1 class="text-2xl font-black text-blue-600 uppercase italic leading-none">WargaBantuWarga</h1>
                            <p class="text-[10px] text-slate-400 mt-1 uppercase tracking-tighter">Platform Jasa Komunitas Tetangga</p>
                        </div>
                        <div class="text-right">
                            <h2 class="text-xl font-extrabold text-slate-800 leading-none">INVOICE</h2>
                            <p class="text-sm font-bold text-blue-600 mt-1">#WBW-${invoiceID}</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-10 text-sm">
                        <div>
                            <p class="text-slate-400 uppercase text-[9px] font-bold tracking-widest mb-1">Dipesan Oleh:</p>
                            <p class="font-bold text-slate-700">${emailPemesan}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-slate-400 uppercase text-[9px] font-bold tracking-widest mb-1">Waktu Transaksi:</p>
                            <p class="font-bold text-slate-700">${formatFull} WIB</p>
                        </div>
                    </div>

                    <div class="border-t-2 border-b-2 border-dashed border-slate-100 py-6 mb-6">
                        <div class="flex justify-between items-center">
                            <div class="flex flex-col">
                                <span class="text-[10px] text-blue-600 font-bold uppercase tracking-widest mb-1">Layanan Jasa</span>
                                <span class="font-bold text-slate-800 text-lg">${namaJasa}</span>
                            </div>
                            <span class="font-black text-slate-900 text-lg">Rp ${Number(hargaJasa).toLocaleString('id-ID')}</span>
                        </div>
                    </div>

                    <div class="flex justify-between items-center bg-blue-600 text-white p-5 rounded-2xl shadow-xl shadow-blue-200">
                        <span class="font-bold uppercase text-[10px] tracking-widest text-blue-100">Total Pembayaran</span>
                        <span class="font-black text-2xl text-white">Rp ${Number(hargaJasa).toLocaleString('id-ID')}</span>
                    </div>

                    <div class="mt-10 text-center text-[9px] text-slate-400 uppercase tracking-[0.3em] font-bold">
                        * Simpan sebagai bukti pemesanan sah *
                    </div>
                </div>

                <script>
                    window.onload = function() { 
                        setTimeout(() => {
                            window.print();
                            // window.close(); // Aktifkan jika ingin tab otomatis menutup setelah print
                        }, 1000);
                    };
                </script>
            </body>
        </html>
    `);
    printWindow.document.close();
}

async function fetchJasa() {
    // Ambil SEMUA data tanpa filter email agar tampil di marketplace
    const { data, error } = await _supabase.from('jasa').select('*');
    
    // Gabungkan dengan dummyData agar tidak kosong saat database baru dibuat
    allJasa = (error || !data) ? dummyData : [...data, ...dummyData];
    
    console.log("Memuat semua jasa untuk marketplace...");
    renderJasa(allJasa);
}

// --- MANAJEMEN JASA PENJASA ---
async function fetchMyJasa() {
    if (!activeUser) return;

    // 1. Ambil Jasa milik user
    const { data: myJasa, count: countJasa, error: errorJasa } = await _supabase
        .from('jasa')
        .select('*', { count: 'exact' })
        .eq('owner_email', activeUser.email);

    // 2. Ambil Total Pesanan
    const { count: countOrders, error: errorOrders } = await _supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('owner_email', activeUser.email);

    if (errorJasa) console.error("Error Jasa:", errorJasa.message);
    if (errorOrders) console.error("Error Orders:", errorOrders.message);

    // UPDATE UI STATISTIK (Targeting ID yang baru kita buat)
    const elActive = document.getElementById("statActiveJasa");
    const elTotal = document.getElementById("statTotalOrder");
    const elRating = document.getElementById("statRating");

    if (elActive) elActive.innerText = countJasa || 0;
    if (elTotal) elTotal.innerText = countOrders || 0;
    
    // Update Rating (Statik 5.0 atau sesuai logika kamu nanti)
    if (elRating) {
        elRating.innerHTML = `5.0<span class="text-sm text-slate-300">/5</span>`;
    }

    // Tampilkan daftar jasanya ke container dashboard
    renderJasa(myJasa);
}

async function hapusJasa(id) {
    if(!confirm("Yakin hapus jasa ini?")) return;
    await _supabase.from('jasa').delete().eq('id', id);
    fetchMyJasa();
    fetchJasa();
}

// --- UTILS ---
function initDragAndDrop() {
    const zone = document.getElementById("drop-zone");
    const input = document.getElementById("file-input");
    if(!zone) return;
    zone.onclick = () => input.click();
    input.onchange = (e) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            base64Image = ev.target.result;
            const preview = document.getElementById("preview-img");
            const text = document.getElementById("drop-text");
            if(preview) {
                preview.src = base64Image;
                preview.classList.remove("hidden");
            }
            if(text) text.classList.add("hidden");
        };
        reader.readAsDataURL(e.target.files[0]);
    };
}

function closeModal() { document.getElementById("detailModal").classList.add("hidden"); }
function checkPenjasaAccess() { if(!activeUser) showPage('loginPage'); else if(activeUser.role === 'penjasa') showPage('dashboard'); else alert('Hanya akun Penjasa yang bisa!'); }

function toggleCategoryModal() {
    document.getElementById("categoryModal").classList.toggle("hidden");
}

function selectCategory(cat) {
    selectedCategory = cat;
    
    // Ganti teks di tombol supaya user tau kategori apa yang aktif
    document.getElementById("currentCatText").innerText = cat === 'semua' ? 'Semua Kategori' : cat;

    // Ganti warna tombol kategori di dalam modal (biar tau mana yang dipilih)
    document.querySelectorAll('.cat-pill').forEach(btn => {
        if(btn.innerText.toLowerCase() === cat.toLowerCase() || (cat === 'semua' && btn.innerText === 'Semua')) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    applyFilters(); // Jalankan filter secara otomatis
}

// Tambahkan ini di dalam document.addEventListener("DOMContentLoaded", ...)
// fetchMitraOrders(); 

// --- FITUR DASHBOARD MITRA (PRO) ---

async function fetchMitraOrders() {
    if (!activeUser || activeUser.role !== 'penjasa') return;

    // Ambil pesanan di mana "owner_email" jasa tersebut adalah email mitra yang login
    // Note: Pastikan di tabel 'orders' kamu menyimpan 'owner_email' atau relasi ke jasa
    const { data, error } = await _supabase
        .from('orders')
        .select('*')
        .eq('owner_email', activeUser.email)
        .order('id', { ascending: false });

    if (error) return console.error(error);

    renderMitraOrders(data);
    updateMitraStats(data);
}

function renderMitraOrders(orders) {
    const container = document.getElementById("mitraOrderList");
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `<div class="p-8 border-2 border-dashed rounded-3xl text-center text-slate-400 italic">Menunggu pesanan pertama Anda...</div>`;
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="bg-white border p-5 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 hover:border-blue-200 transition">
            <div class="flex items-center gap-4 w-full">
                <div class="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-xl">👤</div>
                <div>
                    <p class="font-bold text-slate-800">${order.buyer_email.split('@')[0]}</p>
                    <p class="text-xs text-slate-500">Memesan: <span class="text-blue-600 font-semibold">${order.jasa_nama}</span></p>
                </div>
            </div>
            
            <div class="flex items-center gap-3 w-full md:w-auto">
                <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ${order.status === 'Selesai' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}">
                    ${order.status || 'Baru'}
                </span>
                ${order.status !== 'Selesai' ? `
                    <button onclick="updateOrderStatus(${order.id}, 'Selesai')" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 whitespace-nowrap">
                        Selesaikan
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

async function updateOrderStatus(orderId, newStatus) {
    const { error } = await _supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

    if (error) return alert("Gagal update status");
    
    // Toast Notif Sederhana
    alert("Pesanan telah diselesaikan! Terima kasih, Mitra.");
    fetchMitraOrders();
}

function updateMitraStats(orders) {
    document.getElementById("statTotalOrder").innerText = orders.length;
    // Hitung jasa aktif dari allJasa yang owner_email-nya adalah user aktif
    const myJasaCount = allJasa.filter(j => j.owner_email === activeUser.email).length;
    document.getElementById("statActiveJasa").innerText = myJasaCount;
}

// Fungsi untuk buka/tutup modal
function toggleProfileModal() {
    const modal = document.getElementById('modalProfile');
    modal.classList.toggle('hidden');
}

// Fungsi Simpan Username ke Supabase
async function saveUsername() {
    const newUsernameInput = document.getElementById('newUsername');
    const statusEl = document.getElementById('profileStatus');
    const btn = document.querySelector('#modalProfile button');

    const newUsername = newUsernameInput?.value.trim();
    if (!newUsername) return alert("Isi username dulu!");

    try {
        if (statusEl) statusEl.innerText = "Sedang menyimpan...";
        if (btn) btn.disabled = true;

        // Cek sesi lokal dulu sebelum hit server
        const { data: { session } } = await _supabase.auth.getSession();
        
        if (!session?.user) {
            // Jika sesi lokal tidak ada, baru coba getUser() sebagai cadangan
            const { data: { user }, error: userError } = await _supabase.auth.getUser();
            if (userError || !user) throw new Error("Sesi berakhir, silakan login ulang.");
            var userId = user.id;
        } else {
            var userId = session.user.id;
        }

        const { error: upsertError } = await _supabase
            .from('profiles')
            .upsert({ 
                id: userId, 
                username: newUsername,
                updated_at: new Date().toISOString()
            });

        if (upsertError) throw upsertError;

        alert("Berhasil!");
        location.reload(); 

    } catch (err) {
        console.error("Error Detail:", err);
        alert(err.message || "Gagal menyimpan");
    } finally {
        if (statusEl) statusEl.innerText = "";
        if (btn) btn.disabled = false;
    }
}