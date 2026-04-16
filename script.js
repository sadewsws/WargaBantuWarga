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


document.addEventListener("DOMContentLoaded", () => {
    updateAuthUI();
    initDragAndDrop();
    fetchJasa();
    renderOrders();
});

// --- NAVIGATION ---
function showPage(id) {
    // 🔥 SYNC USER SETIAP PINDAH HALAMAN
    activeUser = JSON.parse(localStorage.getItem("activeUser"));

    const isGuest = !activeUser;
    
    if ((id === 'dashboard' || id === 'orders') && isGuest) {
        alert("Waduh, login dulu yuk biar bisa akses fitur ini!");
        return showPage('loginPage'); // Lempar balik ke login
    }

    // 2. Ganti Halaman (Logika Utama Lo)
    const sections = document.querySelectorAll('.page-section');
    const targetSection = document.getElementById(id);

    if (targetSection) {
        sections.forEach(s => s.classList.remove('active'));
        targetSection.classList.add('active');
    } else {
        console.error("Halaman dengan ID " + id + " nggak ketemu!");
        return;
    }

    // 3. Trigger Fungsi Spesifik per Halaman (Sinkronisasi Data)
    if (id === 'dashboard') {
        // Pastikan fungsi fetch data mitra dipanggil
        if (typeof fetchMyJasa === 'function') fetchMyJasa();
        if (typeof renderMitraOrders === 'function') renderMitraOrders();
    }
    
    if (id === 'marketplace') {
    if (typeof renderJasa === 'function') renderJasa(allJasa);
        }   

    if (id === 'orders') {
        if (typeof renderOrders === 'function') renderOrders();
    }

    // 4. Reset Posisi Scroll & Tutup Mobile Menu (Jika sedang terbuka)
    window.scrollTo(0, 0);
    const mobileMenu = document.getElementById("mobileMenu");
    if (mobileMenu) mobileMenu.classList.add("hidden");
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
    const email = document.getElementById("logEmail").value.trim();
    const pass = document.getElementById("logPass").value.trim();

    if (!email || !pass) {
        return alert("Isi email & password dulu!");
    }

    try {
        const { data, error } = await _supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('password', pass)
            .maybeSingle();

        if (error || !data) {
            return alert("Email atau password salah!");
        }

        // 💾 simpan session
        localStorage.setItem("activeUser", JSON.stringify(data));

// 🔥 update state langsung TANPA refresh
            activeUser = data;
            updateAuthUI();

            alert("Login berhasil!");
            showPage('marketplace');
    } catch (err) {
        console.error(err);
        alert("Gagal login: " + err.message);
    }
}
// --- 2. FUNGSI REGISTER (Di Bawah Login) ---
async function handleRegister() {
    const emailEl = document.getElementById("regEmail");
    const passEl = document.getElementById("regPass");
    const roleEl = document.getElementById("regRole");

    const email = emailEl.value.trim().replace(/"/g, '').replace(/\s/g, '');
    const pass = passEl.value.trim();
    const role = roleEl.value;

    if (!email || !pass) {
        return alert("Email & password wajib diisi!");
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return alert("Format email tidak valid!");
    }

    if (pass.length < 6) {
        return alert("Password minimal 6 karakter!");
    }

    try {
        // 🔍 cek email sudah ada
        const { data: existing } = await _supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existing) {
            return alert("Email sudah terdaftar!");
        }

        // 💾 insert user + ambil data user baru
        const { data: newUser, error: userError } = await _supabase
            .from('users')
            .insert([{
                email: email,
                password: pass,
                role: role
            }])
            .select()
            .single();

        if (userError) throw userError;

        // 🔥 WAJIB: insert ke profiles
        const { error: profileError } = await _supabase
            .from('profiles')
            .insert([{
                id: newUser.id, // HARUS sama dengan user.id
                username: email.split('@')[0]
            }]);

        if (profileError) throw profileError;

        alert("Daftar berhasil!");
        showPage('loginPage');

    } catch (err) {
        console.error(err);
        alert("Gagal Daftar: " + err.message);
    }
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

    if (!nama || !kategori || !harga || !wa) {
        return alert("Mohon lengkapi data utama!");
    }

    try {
        // 🔥 VALIDASI USER ADA DI DATABASE
        const { data: userCheck, error: userError } = await _supabase
            .from('users')
            .select('id')
            .eq('id', activeUser.id)
            .maybeSingle();

        if (userError) throw userError;

        if (!userCheck) {
            return alert("User tidak valid! Silakan login ulang.");
        }

        const payload = {
            nama,
            kategori,
            harga: parseInt(harga),
            wa,
            lokasi,
            deskripsi,
            img: base64Image || "https://via.placeholder.com/300",
            user_id: activeUser.id,
            owner_email: activeUser.email // 🔥 TAMBAHAN PENTING
        };

        let result;

        if (isEditing) {
            result = await _supabase
                .from('jasa')
                .update(payload)
                .eq('id', editId)
                .eq('user_id', activeUser.id);
        } else {
            result = await _supabase
                .from('jasa')
                .insert([payload]);
        }

        if (result.error) {
            throw result.error;
        }

        alert(isEditing ? "Jasa diperbarui!" : "Jasa diterbitkan!");

        // reset state
        isEditing = false;
        editId = null;

        showPage('dashboard');
        fetchMyJasa();
        fetchJasa();

    } catch (err) {
        console.error("ERROR TAMBAH JASA:", err);
        alert("Gagal: " + err.message);
    }
}
// --- MARKETPLACE & JASA LOGIC ---
async function fetchJasa() {
    try {
        const { data, error } = await _supabase
            .from('jasa')
            .select('*');

        if (error) throw error;

        // hanya pakai data database
        allJasa = Array.isArray(data) ? data : [];

        console.log("Memuat semua jasa:", allJasa);
        renderJasa(allJasa);

    } catch (err) {
        console.error("Gagal fetch jasa:", err);
        allJasa = [];
        renderJasa([]);
    }
}

function renderJasa(list = []) {
    const mainContainer = document.getElementById("jasaContainer");
    const dashboardContainer = document.getElementById("myJasaList");

    if (!Array.isArray(list)) list = [];

    // === MARKETPLACE ===
    if (mainContainer) {
        mainContainer.innerHTML = list.length > 0
            ? list.map(j => `
                <div class="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                    <img src="${j.img || 'https://via.placeholder.com/150'}" class="w-full h-40 object-cover rounded-2xl mb-3">
                    <h3 class="font-bold text-slate-800">${j.nama}</h3>
                    <p class="text-blue-600 font-black">Rp ${Number(j.harga).toLocaleString()}</p>
                    <button onclick='openDetail(${JSON.stringify(j).replace(/"/g, '&quot;')})' 
                        class="w-full mt-3 bg-slate-50 py-2 rounded-xl font-bold text-slate-600 hover:bg-blue-600 hover:text-white transition">
                        Lihat Detail
                    </button>
                </div>
            `).join("")
            : `<p class="text-center text-slate-400 italic">Belum ada jasa tersedia</p>`;
    }

    // === DASHBOARD ===
    if (dashboardContainer && activeUser) {
        const myOwn = list.filter(j => j.user_id === activeUser.id);

        dashboardContainer.innerHTML = myOwn.length > 0
            ? myOwn.map(j => `
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
            `).join("")
            : `<p class="text-slate-400 italic text-center">Belum ada jasa kamu</p>`;
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

    if (!activeUser) {
        return alert("Login dulu sebelum komentar!");
    }

    if (!input || !input.value.trim()) {
        return alert("Komentar tidak boleh kosong!");
    }

    try {
        // loading state
        if (btnKirim) {
            btnKirim.disabled = true;
            btnKirim.innerText = "...";
        }

        // 🔥 1. PASTIKAN PROFILE ADA
        const { data: profile } = await _supabase
            .from('profiles')
            .select('id')
            .eq('id', activeUser.id)
            .maybeSingle();

        if (!profile) {
            const { error: insertProfileError } = await _supabase
                .from('profiles')
                .insert([{
                    id: activeUser.id,
                    username: activeUser.email.split('@')[0]
                }]);

            if (insertProfileError) throw insertProfileError;
        }

        // 🔥 2. BARU INSERT KOMENTAR
        const { error } = await _supabase.from('komentar').insert([{
            jasa_id: currentJasaId,
            user_id: activeUser.id,
            isi_komentar: input.value.trim()
        }]);

        if (error) throw error;

        // reset input
        input.value = "";

        // refresh komentar
        await renderComments();

    } catch (err) {
        console.error("Komentar Error:", err);
        alert("Gagal kirim komentar: " + err.message);
    } finally {
        if (btnKirim) {
            btnKirim.disabled = false;
            btnKirim.innerText = "Kirim";
        }
    }
}
async function renderComments() {
    const container = document.getElementById("commentList");
    if (!container || !currentJasaId) return;

    try {
        // Loading UI
        container.innerHTML = `
            <div class="flex flex-col items-center py-4">
                <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mb-2"></div>
                <p class="text-[10px] text-slate-400 italic">Memuat komentar...</p>
            </div>`;

        // ✅ FIX: ambil data + error + relasi yang benar
        const { data: listKomentar, error } = await _supabase
            .from('komentar')
            .select(`
                *,
                profiles!fk_komentar_profiles_final (
                    username
                )
            `)
            .eq('jasa_id', currentJasaId)
            .order('created_at', { ascending: false });

        // ✅ FIX: error handling
        if (error) throw error;

        // Jika kosong
        if (!listKomentar || listKomentar.length === 0) {
            container.innerHTML = `
                <div class="text-center py-6">
                    <p class="text-xs text-slate-400 italic">Belum ada komentar di sini.</p>
                </div>`;
            return;
        }

        // Render
        container.innerHTML = listKomentar.map(c => {
            // ✅ ambil dari profiles (bukan dari komentar)
            const displayName =
                 c.profiles?.username || "Anonymous";

            const commentDate = new Date(c.created_at);
            const isToday = new Date().toDateString() === commentDate.toDateString();

            const timeDisplay = commentDate.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const dateDisplay = isToday
                ? "Hari ini"
                : commentDate.toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short'
                  });

            return `
                <div class="bg-white p-3 rounded-xl border border-slate-100 mb-3 shadow-sm hover:border-blue-200 transition-all group">
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex items-center gap-1.5">
                            <div class="w-5 h-5 bg-blue-50 rounded-full flex items-center justify-center">
                                <span class="text-[8px] font-bold text-blue-500">
                                    ${displayName.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <p class="text-[10px] font-bold text-blue-600">@${displayName}</p>
                        </div>
                        <p class="text-[8px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                            ${dateDisplay}, ${timeDisplay}
                        </p>
                    </div>
                    <p class="text-sm text-slate-700 leading-relaxed pl-6">
                        ${c.isi_komentar}
                    </p>
                </div>`;
        }).join("");

    } catch (err) {
        console.error("Render Error:", err);

        container.innerHTML = `
            <div class="p-4 bg-red-50 rounded-xl border border-red-100 text-center">
                <p class="text-red-500 text-[10px] font-bold mb-1">Gagal memuat komentar</p>
                <p class="text-[9px] text-red-400 leading-tight">
                    ${err.message || "Masalah koneksi database"}
                </p>
                <button onclick="renderComments()" class="mt-2 text-[9px] text-red-600 underline font-semibold">
                    Coba lagi
                </button>
            </div>`;
    }
}

async function ensureProfile() {
    if (!activeUser) return;

    // cek apakah sudah ada
    const { data } = await _supabase
        .from('profiles')
        .select('id')
        .eq('id', activeUser.id)
        .maybeSingle();

    if (!data) {
        console.log("Profile belum ada, membuat...");

        const { error } = await _supabase
            .from('profiles')
            .insert([{
                id: activeUser.id,
                username: activeUser.email.split('@')[0]
            }]);

        if (error) {
            console.error("Gagal buat profile:", error);
        }
    }
}
// --- INTEGRASI PESANAN & WHATSAPP ---
// --- INTEGRASI PESANAN & WHATSAPP (DENGAN DETAIL WAKTU) ---
async function simpanDanPesan() {
    if (!activeUser) return alert("Silakan Login terlebih dahulu.");

    const jasa = await getJasaById(currentJasaId);

    console.log("DATA JASA:", jasa);

    // ✅ VALIDASI PENTING
    if (!jasa) {
        return alert("Data jasa tidak ditemukan!");
    }

    if (!jasa.user_id) {
    console.error("User ID tidak ada:", jasa);
    return alert("Data pemilik jasa tidak ditemukan!");
}

    const orderPayload = {
    jasa_id: jasa.id,
    jasa_nama: jasa.nama,
    harga: jasa.harga,
    buyer_id: activeUser.id,
    owner_id: jasa.user_id, // 🔥 GANTI INI
    status: "Pesanan berhasil dibuat"
};;

    console.log("ORDER PAYLOAD:", orderPayload);

    const { data, error } = await _supabase
        .from('orders')
        .insert([orderPayload])
        .select()
        .single();

    if (error) {
        console.error("INSERT ERROR:", error);
        return alert("Gagal memproses pesanan: " + error.message);
    }

    let history = JSON.parse(localStorage.getItem("riwayat_pesanan")) || [];
    history.push({
        ...orderPayload,
        id: data.id,
        tglFull: new Date().toISOString()
    });
    localStorage.setItem("riwayat_pesanan", JSON.stringify(history));

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
async function getJasaById(id) {
    try {
        // 🔥 1. Coba cari di local (allJasa dulu)
        const localData = allJasa.find(j => j.id == id);
        if (localData) return localData;

        // 🔥 2. Kalau tidak ada, baru ke Supabase
        const { data, error } = await _supabase
            .from('jasa')
            .select('*')
            .eq('id', id)
            .maybeSingle(); // ✅ GANTI INI

        if (error) {
            console.error("Error ambil jasa:", error);
            return null;
        }

        return data;

    } catch (err) {
        console.error("Fatal getJasaById:", err);
        return null;
    }
}
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
            .eq('buyer_id', activeUser.id)
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
    const emailPemesan = order.buyer_id || (typeof activeUser !== 'undefined' ? activeUser.email : "Guest");
    
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
    try {
        const { data, error } = await _supabase
            .from('jasa')
            .select('*');

        if (error) throw error;

        // 🔥 FULL DATABASE ONLY (NO DUMMY)
        allJasa = Array.isArray(data) ? data : [];

        console.log("Memuat semua jasa:", allJasa);
        renderJasa(allJasa);

    } catch (err) {
        console.error("Fatal fetchJasa:", err);

        // ❌ jangan pakai dummyData
        allJasa = [];
        renderJasa([]);
    }
}

// --- MANAJEMEN JASA PENJASA ---
// --- MANAJEMEN JASA PENJASA ---
async function fetchMyJasa() {
    if (!activeUser) return;

    try {
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

        // 🛡️ pastikan array
        const safeJasa = Array.isArray(myJasa) ? myJasa : [];

        // UPDATE UI
        const elActive = document.getElementById("statActiveJasa");
        const elTotal = document.getElementById("statTotalOrder");
        const elRating = document.getElementById("statRating");

        if (elActive) elActive.innerText = countJasa || 0;
        if (elTotal) elTotal.innerText = countOrders || 0;

        if (elRating) {
            elRating.innerHTML = `5.0<span class="text-sm text-slate-300">/5</span>`;
        }

        // 🔥 aman dari error
        renderJasa(safeJasa);

    } catch (err) {
        console.error("Fatal fetchMyJasa:", err);
        renderJasa([]); // fallback kosong
    }
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

    // 🔥 FIX: pastikan array
    if (!Array.isArray(orders)) orders = [];

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="p-8 border-2 border-dashed rounded-3xl text-center text-slate-400 italic">
                Menunggu pesanan pertama Anda...
            </div>`;
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="bg-white border p-5 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <p class="font-bold text-slate-800">${order.jasa_nama}</p>
                <p class="text-xs text-slate-500">Buyer: ${order.buyer_id}</p>
            </div>

            <span class="text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1 rounded-full">
                ${order.status || 'Baru'}
            </span>
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

// Fungsi ini harus jalan setiap kali halaman di-load
// script.js
function checkSession() {
    const user = JSON.parse(localStorage.getItem("activeUser"));
    const authStatus = document.getElementById("authStatus");

    if (!authStatus) return;

    if (user) {
        // Jika sudah login
        authStatus.innerHTML = `
            <button onclick="handleLogout()" class="text-sm font-bold text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl transition">
                Keluar
            </button>`;
    } else {
        // Jika belum login (Gunakan kode ini agar tampilan konsisten)
        authStatus.innerHTML = `
            <button onclick="showPage('loginPage')" class="px-4 py-2 text-sm font-bold text-slate-600 hover:text-blue-600 transition rounded-xl">
                Masuk
            </button>
            <button onclick="showPage('registerPage')" class="px-5 py-2 text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition rounded-xl shadow-md">
                Daftar
            </button>`;
    }
}

// Panggil fungsi ini setiap kali halaman dimuat
document.addEventListener('DOMContentLoaded', checkSession);

// WAJIB: Panggil di paling bawah file script.js
checkSession();

// Panggil fungsi ini di paling bawah script.js supaya jalan pas refresh
checkSession();

// Tambahkan juga fungsi Logout
async function handleLogout() {
    await _supabase.auth.signOut();
    localStorage.removeItem("activeUser");
    alert("Berhasil Logout!");
    window.location.reload(); // Refresh biar navbar balik ke awal
}

// JALANKAN FUNGSI INI SAAT WINDOW DIBUKA
window.onload = checkSession;