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
let userLatitude  = null;   // koordinat GPS pelanggan
let userLongitude = null;
let isEditing = false;
let editId = null;
let selectedCategory = "semua";
let lastPageBeforeProfile = 'marketplace';

// Data Dummy dengan Reviewer



// ══════════════════════════════════════════════════════
// FITUR CHAT
// ══════════════════════════════════════════════════════
var chatPartnerId   = null;
var chatPartnerName = '';
var chatInterval    = null;

// Buka chat dengan user tertentu (dari profil publik)
async function bukaChat(partnerId, partnerName) {
    if (!activeUser) return alert("Silakan login dulu untuk chat.");
    chatPartnerId   = partnerId;
    chatPartnerName = partnerName;

    showPage('chatPage');

    // Mobile: sembunyikan list, tampilkan chat area
    var listPanel = document.getElementById('chatListPanel');
    var area      = document.getElementById('chatArea');
    var input     = document.getElementById('chatInputArea');

    if (window.innerWidth < 768) {
        // Mobile: fullscreen chat area
        if (listPanel) listPanel.style.display = 'none';
        if (area)      { area.style.display = 'flex'; }
    } else {
        // Desktop: tampilkan keduanya side by side
        if (listPanel) { listPanel.style.cssText = 'display:flex;flex-direction:column;width:300px;height:100%;border-right:1px solid #e2e8f0;'; }
        if (area)      { area.style.display = 'flex'; area.style.flex = '1'; }
    }
    if (input) input.style.display = 'block';

    // Fetch foto & info partner dari DB
    var rp = await _supabase.from('profiles').select('username, avatar_url').eq('id', partnerId).maybeSingle();
    var profile = rp.data || {};
    var displayName = profile.username || partnerName;
    var avatarUrl   = profile.avatar_url || '';

    // Update header chat
    var nameEl   = document.getElementById('chatPartnerName');
    var avatarEl = document.getElementById('chatPartnerAvatar');
    var roleEl   = document.getElementById('chatPartnerRole');

    if (nameEl) nameEl.textContent = '@' + displayName;
    if (roleEl) roleEl.textContent = '';

    // Update avatar — pakai innerHTML wrapper agar tidak masalah outerHTML
    var avatarWrapper = document.getElementById('chatPartnerAvatar');
    if (avatarWrapper) {
        avatarWrapper.onclick = function() { bukaProfilPublik(partnerId); };
        avatarWrapper.style.cursor = 'pointer';
        if (avatarUrl) {
            avatarWrapper.innerHTML = '';
            avatarWrapper.style.background = 'transparent';
            avatarWrapper.style.padding = '0';
            var img = document.createElement('img');
            img.src = avatarUrl;
            img.style.cssText = 'width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #dbeafe;';
            avatarWrapper.appendChild(img);
        } else {
            avatarWrapper.innerHTML = displayName.charAt(0).toUpperCase();
            avatarWrapper.style.background = '#dbeafe';
        }
    }

    // Buat nama di header juga bisa diklik ke profil
    if (nameEl) {
        nameEl.className = 'font-bold text-slate-800 text-sm cursor-pointer hover:text-blue-600 transition';
        nameEl.onclick   = function() { bukaProfilPublik(partnerId); };
    }

    await loadChatMessages();
    await loadChatList();

    if (chatInterval) clearInterval(chatInterval);
    chatInterval = setInterval(loadChatMessages, 5000);
}

// Load daftar percakapan (semua user yang pernah chat)
async function loadChatList() {
    if (!activeUser) return;
    var listEl = document.getElementById('chatList');
    if (!listEl) return;

    try {
        // Ambil semua pesan yang melibatkan user ini
        var r = await _supabase
            .from('messages')
            .select('sender_id, receiver_id, isi, created_at, dibaca')
            .or('sender_id.eq.' + activeUser.id + ',receiver_id.eq.' + activeUser.id)
            .order('created_at', { ascending: false });

        if (r.error) throw r.error;
        var msgs = r.data || [];

        if (msgs.length === 0) {
            listEl.innerHTML = '<p class="text-slate-400 text-xs italic text-center p-6">Belum ada percakapan</p>';
            return;
        }

        // Kumpulkan partner unik
        var partners = {};
        msgs.forEach(function(m) {
            var pid = m.sender_id === activeUser.id ? m.receiver_id : m.sender_id;
            if (!partners[pid]) {
                partners[pid] = { lastMsg: m.isi, unread: 0 };
            }
            if (m.receiver_id === activeUser.id && !m.dibaca) {
                partners[pid].unread++;
            }
        });

        // Ambil profil semua partner
        var pids = Object.keys(partners);
        var rp = await _supabase.from('profiles').select('id, username, avatar_url').in('id', pids);
        var profileMap = {};
        (rp.data || []).forEach(function(p) { profileMap[p.id] = p; });

        // Hitung total unread
        var totalUnread = Object.values(partners).reduce(function(s, p) { return s + p.unread; }, 0);
        var badge = document.getElementById('chatUnreadBadge');
        if (badge) badge.classList.toggle('hidden', totalUnread === 0);

        // Render list
        listEl.innerHTML = pids.map(function(pid) {
            var p       = profileMap[pid] || {};
            var name    = p.username || 'User';
            var avatar  = p.avatar_url || '';
            var info    = partners[pid];
            var isActive = pid === chatPartnerId;
            var unreadHtml = info.unread > 0
                ? '<span style="background:#ef4444;color:white;font-size:10px;padding:1px 6px;border-radius:999px;font-weight:700;">' + info.unread + '</span>'
                : '';
            var avatarHtml = avatar
                ? '<img src="' + avatar + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;flex-shrink:0;">'
                : '<div style="width:44px;height:44px;background:#dbeafe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#2563eb;font-size:15px;flex-shrink:0;">' + name.charAt(0).toUpperCase() + '</div>';
            return '<button onclick="bukaChat(\'' + pid + '\', \'' + name + '\')" ' +
                'style="width:100%;display:flex;align-items:center;gap:12px;padding:12px 16px;background:' + (isActive ? '#eff6ff' : 'white') + ';border:none;border-bottom:1px solid #f1f5f9;cursor:pointer;text-align:left;">' +
                avatarHtml +
                '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">' +
                '<p style="font-weight:700;font-size:14px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">@' + name + '</p>' + unreadHtml +
                '</div>' +
                '<p style="font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (info.lastMsg || '') + '</p>' +
                '</div></button>';
        }).join('');

    } catch(err) {
        console.error("loadChatList error:", err);
    }
}

// Load pesan dalam percakapan aktif
async function loadChatMessages() {
    if (!activeUser || !chatPartnerId) return;
    var msgEl = document.getElementById('chatMessages');
    if (!msgEl) return;

    try {
        var r = await _supabase
            .from('messages')
            .select('id, sender_id, receiver_id, isi, created_at, dibaca')
            .or(
                'and(sender_id.eq.' + activeUser.id + ',receiver_id.eq.' + chatPartnerId + '),' +
                'and(sender_id.eq.' + chatPartnerId + ',receiver_id.eq.' + activeUser.id + ')'
            )
            .order('created_at', { ascending: true });

        if (r.error) throw r.error;
        var msgs = r.data || [];

        if (msgs.length === 0) {
            msgEl.innerHTML = '<p class="text-center text-slate-400 text-xs italic py-8">Belum ada pesan. Mulai percakapan!</p>';
            return;
        }

        msgEl.innerHTML = msgs.map(function(m) {
            var isMine = m.sender_id === activeUser.id;
            var tgl = new Date(m.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
            var bubbleStyle = isMine
                ? 'background:#2563eb;color:white;border-radius:18px 18px 4px 18px;'
                : 'background:white;color:#0f172a;border-radius:18px 18px 18px 4px;box-shadow:0 1px 2px rgba(0,0,0,0.06);';
            return '<div style="display:flex;justify-content:' + (isMine ? 'flex-end' : 'flex-start') + ';">' +
                '<div style="max-width:75%;' + bubbleStyle + 'padding:10px 14px;">' +
                '<p style="font-size:14px;line-height:1.5;margin:0;">' + escapeHtml(m.isi) + '</p>' +
                '<p style="font-size:10px;margin:4px 0 0;text-align:right;color:' + (isMine ? 'rgba(255,255,255,0.7)' : '#94a3b8') + ';">' + tgl + '</p>' +
                '</div></div>';
        }).join('');

        // Scroll ke bawah
        msgEl.scrollTop = msgEl.scrollHeight;

        // Tandai pesan masuk sebagai dibaca
        var unreadIds = msgs.filter(function(m) {
            return m.receiver_id === activeUser.id && !m.dibaca;
        }).map(function(m) { return m.id; });

        if (unreadIds.length > 0) {
            await _supabase.from('messages').update({ dibaca: true }).in('id', unreadIds);
            loadChatList(); // refresh badge
        }

    } catch(err) {
        console.error("loadChatMessages error:", err);
    }
}

// Kirim pesan
async function kirimPesan() {
    if (!activeUser)      return alert("Silakan login dulu.");
    if (!chatPartnerId)   return alert("Pilih penerima dulu.");

    var input = document.getElementById('chatInput');
    var isi   = (input ? input.value : '').trim();
    if (!isi) return;

    input.value = '';
    input.disabled = true;

    try {
        var r = await _supabase.from('messages').insert([{
            sender_id:   activeUser.id,
            receiver_id: chatPartnerId,
            isi:         isi,
            dibaca:      false
        }]);
        if (r.error) throw r.error;
        await loadChatMessages();
    } catch(err) {
        console.error("kirimPesan error:", err);
        alert("Gagal kirim pesan: " + err.message);
        if (input) input.value = isi;
    } finally {
        if (input) input.disabled = false;
        if (input) input.focus();
    }
}

// Filter list chat
function filterChatList() {
    var q = document.getElementById('chatSearchInput').value.toLowerCase();
    var btns = document.querySelectorAll('#chatList button');
    btns.forEach(function(btn) {
        btn.style.display = btn.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

// Helper escape HTML
function escapeHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}


// Kembali ke daftar chat (tombol back di mobile)
function tutupChatArea() {
    var listPanel = document.getElementById('chatListPanel');
    var area      = document.getElementById('chatArea');
    if (listPanel) listPanel.style.display = 'flex';
    if (area)      area.style.display = 'none';
    if (chatInterval) clearInterval(chatInterval);
}

// Stop auto-refresh saat keluar dari halaman chat
var _origShowPage = showPage;

document.addEventListener("DOMContentLoaded", () => {
    updateAuthUI();
    initDragAndDrop();
    fetchJasa();
    renderOrders();
    loadHeroStats();
    requestUserLocation(); // deteksi GPS saat load
});

// --- NAVIGATION ---

// ─── HITUNG JARAK GPS (Haversine formula) ───
function hitungJarak(lat1, lon1, lat2, lon2) {
    var R = 6371; // radius bumi km
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2)
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function formatJarak(km) {
    if (km < 1) return Math.round(km * 1000) + ' m';
    return km.toFixed(1) + ' km';
}

// Minta izin GPS browser
function requestUserLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            userLatitude  = pos.coords.latitude;
            userLongitude = pos.coords.longitude;
            // Refresh tampilan jasa dengan info jarak
            if (allJasa.length > 0) applyFilters();
        },
        function(err) {
            console.log("GPS tidak tersedia:", err.message);
        },
        { timeout: 8000, maximumAge: 60000 }
    );
}

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
        if (typeof fetchMyJasa === 'function') fetchMyJasa();
        if (typeof renderMitraOrders === 'function') renderMitraOrders();
        loadStatusToko();
    }
    
    if (id === 'marketplace') {
        if (typeof renderJasa === 'function') renderJasa(allJasa);
        requestUserLocation();
    }

    if (id === 'chatPage') {
        if (chatInterval) clearInterval(chatInterval);
        loadChatList();
        if (chatPartnerId) {
            chatInterval = setInterval(loadChatMessages, 5000);
        }
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

// ─────────────────────────────────────────
// GOOGLE LOGIN
// ─────────────────────────────────────────
// Simpan sementara data Google saat login
var _googlePendingData = null;

async function handleGoogleLogin(response) {
    try {
        var parts   = response.credential.split('.');
        var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        var email   = payload.email;
        var name    = payload.name || email.split('@')[0];
        var picture = payload.picture || '';

        // Cek apakah email sudah terdaftar
        var r1 = await _supabase.from('users').select('*').eq('email', email).maybeSingle();
        if (r1.error) throw r1.error;

        if (r1.data) {
            // User sudah ada → langsung login
            var user = r1.data;
            localStorage.setItem('activeUser', JSON.stringify(user));
            activeUser = user;
            updateAuthUI();
            showPage('marketplace');
            alert('Selamat datang kembali, ' + name + '!');
        } else {
            // User baru → simpan data sementara lalu tanya role
            _googlePendingData = { email, name, picture };
            showGoogleRoleModal();
        }

    } catch(err) {
        console.error('Google login error:', err);
        alert('Gagal login dengan Google: ' + err.message);
    }
}

function showGoogleRoleModal() {
    var modal = document.getElementById('googleRoleModal');
    if (modal) modal.classList.remove('hidden');
}

function hideGoogleRoleModal() {
    var modal = document.getElementById('googleRoleModal');
    if (modal) modal.classList.add('hidden');
    _googlePendingData = null;
}

async function confirmGoogleRole(role) {
    if (!_googlePendingData) return;
    var email   = _googlePendingData.email;
    var name    = _googlePendingData.name;
    var picture = _googlePendingData.picture;

    hideGoogleRoleModal();

    try {
        // Daftarkan user baru
        var r2 = await _supabase.from('users').insert([{
            email:    email,
            password: 'google-oauth',
            role:     role
        }]).select().single();
        if (r2.error) throw r2.error;
        var user = r2.data;

        // Buat profil
        var username = name.replace(/\s+/g, '').toLowerCase();
        await _supabase.from('profiles').insert([{
            id:         user.id,
            username:   username,
            avatar_url: picture
        }]);

        localStorage.setItem('activeUser', JSON.stringify(user));
        activeUser = user;
        updateAuthUI();

        var dest = role === 'penjasa' ? 'dashboard' : 'marketplace';
        showPage(dest);
        alert('Akun berhasil dibuat sebagai ' + (role === 'penjasa' ? 'Mitra Jasa' : 'Pelanggan') + '. Selamat datang, ' + name + '!');

    } catch(err) {
        console.error('Gagal daftar Google:', err);
        alert('Gagal membuat akun: ' + err.message);
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
    const btnProfil = document.getElementById("btnProfilNav");

    if (activeUser) {
        // Tampilkan tombol profil
        if (btnProfil) {
            btnProfil.classList.remove('hidden');
            btnProfil.classList.add('flex');
        }

        // Tombol logout di authStatus
        status.innerHTML = `
            <button onclick="logout()" class="text-red-500 text-xs font-bold uppercase underline hover:text-red-700 transition">Logout</button>`;

        if (activeUser.role === 'penjasa') {
            navPenjasa.innerHTML = `<button onclick="showPage('dashboard')" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition">Dashboard Mitra</button>`;
        }

        // Load username & avatar ke navbar dari profil
        _supabase.from('profiles').select('username, avatar_url').eq('id', activeUser.id).maybeSingle()
            .then(({ data }) => {
                if (data) {
                    const navText    = document.getElementById('navUsernameText');
                    const navAvatar  = document.getElementById('navAvatarImg');
                    const dashAvatar = document.getElementById('dashAvatarImg');
                    const dashText   = document.getElementById('dashUsernameText');
                    const name       = data.username || activeUser.email.split('@')[0];
                    const src        = data.avatar_url
                        || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=dbeafe&color=2563eb&bold=true&size=64`;

                    if (navText)    navText.textContent  = name;
                    if (navAvatar)  navAvatar.src         = src;
                    if (dashAvatar) dashAvatar.src        = src;
                    if (dashText)   dashText.textContent  = name;
                }
            });

    } else {
        if (btnProfil) {
            btnProfil.classList.add('hidden');
            btnProfil.classList.remove('flex');
        }
        status.innerHTML = `<button onclick="showPage('loginPage')" class="bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg">Login</button>`;
        if (navPenjasa) navPenjasa.innerHTML = '';
    }
}

// --- FITUR PENCARIAN & FILTER ---
function applyFilters() {
    const query     = document.getElementById("searchInput").value.toLowerCase();
    const sortValue = document.getElementById("sortFilter").value;

    let filtered = allJasa.filter(j => {
        const nama   = (j.nama   || '').toLowerCase();
        const lokasi = (j.lokasi || '').toLowerCase();
        const matchQuery    = nama.includes(query) || lokasi.includes(query);
        const matchCategory = (selectedCategory === "semua") || (j.kategori === selectedCategory);
        return matchQuery && matchCategory;
    });

    if (sortValue === "termurah") {
        filtered.sort((a, b) => a.harga - b.harga);
    } else if (sortValue === "termahal") {
        filtered.sort((a, b) => b.harga - a.harga);
    } else if (sortValue === "terdekat") {
        if (userLatitude && userLongitude) {
            filtered.sort((a, b) => {
                var dA = (a.latitude && a.longitude)
                    ? hitungJarak(userLatitude, userLongitude, a.latitude, a.longitude)
                    : 99999;
                var dB = (b.latitude && b.longitude)
                    ? hitungJarak(userLatitude, userLongitude, b.latitude, b.longitude)
                    : 99999;
                return dA - dB;
            });
        } else {
            // GPS belum tersedia, minta lagi
            requestUserLocation();
        }
    } else {
        filtered.sort((a, b) => b.id - a.id);
    }

    renderJasa(filtered);
}

// --- FITUR TAMBAH & EDIT JASA ---

// ─── PERBARUI LOKASI SEMUA JASA MILIK MITRA ───
async function perbaruiLokasiSemuaJasa() {
    if (!activeUser) return alert("Silakan login dulu.");

    var btn = document.getElementById("btnUpdateLokasi");
    if (btn) { btn.disabled = true; btn.textContent = "Mengambil GPS..."; }

    try {
        // 1. Minta GPS
        var coords = await new Promise(function(resolve, reject) {
            if (!navigator.geolocation) return reject(new Error("GPS tidak didukung browser ini."));
            navigator.geolocation.getCurrentPosition(
                function(pos) { resolve(pos.coords); },
                function(err) { reject(new Error("Izin GPS ditolak atau tidak tersedia.")); },
                { timeout: 8000 }
            );
        });

        var lat = coords.latitude;
        var lon = coords.longitude;

        if (btn) btn.textContent = "Memperbarui jasa...";

        // 2. Ambil semua jasa milik mitra
        var r1 = await _supabase.from("jasa").select("id").eq("user_id", activeUser.id);
        if (r1.error) throw r1.error;

        var myJasa = r1.data || [];
        if (myJasa.length === 0) {
            alert("Kamu belum memiliki jasa yang terdaftar.");
            return;
        }

        // 3. Update koordinat semua jasa sekaligus
        var ids = myJasa.map(function(j){ return j.id; });
        var r2 = await _supabase
            .from("jasa")
            .update({ latitude: lat, longitude: lon })
            .in("id", ids);

        if (r2.error) throw r2.error;

        // 4. Update variabel global GPS pelanggan juga
        userLatitude  = lat;
        userLongitude = lon;

        // 5. Refresh data jasa
        await fetchJasa();

        alert("✅ Lokasi " + myJasa.length + " jasa berhasil diperbarui!\n\nKoordinat: " + lat.toFixed(5) + ", " + lon.toFixed(5));

    } catch(err) {
        console.error("Gagal perbarui lokasi:", err);
        alert("Gagal: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg> 📍 Perbarui Lokasi Semua Jasa';
        }
    }
}

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

        // Ambil koordinat GPS saat ini untuk lokasi jasa
        var jasaLat = null, jasaLon = null;
        try {
            await new Promise(function(resolve) {
                navigator.geolocation.getCurrentPosition(
                    function(pos) { jasaLat = pos.coords.latitude; jasaLon = pos.coords.longitude; resolve(); },
                    function()    { resolve(); },
                    { timeout: 5000 }
                );
            });
        } catch(e) {}

        const payload = {
            nama,
            kategori,
            harga: parseInt(harga),
            wa,
            lokasi,
            deskripsi,
            img: base64Image || "https://via.placeholder.com/300",
            user_id: activeUser.id,
            owner_email: activeUser.email,
            latitude:  jasaLat,
            longitude: jasaLon
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

        // reset form & state
        resetFormJasa();

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
        loadWishlistIds();

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
                    <div class="relative">
                        <img src="${j.img || 'https://via.placeholder.com/150'}" class="w-full h-40 object-cover rounded-2xl mb-3">
                        ${(userLatitude && userLongitude && j.latitude && j.longitude)
                            ? `<span class="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-blue-600 text-[10px] font-bold px-2 py-1 rounded-full shadow">
                                📍 ${formatJarak(hitungJarak(userLatitude, userLongitude, j.latitude, j.longitude))}
                               </span>`
                            : ''}
                        ${activeUser ? `<button onclick="toggleWishlist(${j.id}, event)"
                            id="wishBtn-${j.id}"
                            class="absolute top-2 left-2 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow hover:scale-110 transition text-lg">
                            ♡
                        </button>` : ''}
                    </div>
                    <div class="flex items-start justify-between gap-1 mb-1">
                        <h3 class="font-bold text-slate-800">${j.nama}</h3>
                        <span class="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${j.is_open === false ? 'bg-slate-100 text-slate-400' : 'bg-green-50 text-green-600'}">
                            <span class="w-1.5 h-1.5 rounded-full ${j.is_open === false ? 'bg-slate-300' : 'bg-green-500 animate-pulse'}"></span>
                            ${j.is_open === false ? 'Tutup' : 'Buka'}
                        </span>
                    </div>
                    <p class="text-blue-600 font-black">Rp ${Number(j.harga).toLocaleString()}</p>
                    ${j.lokasi ? `<p class="text-xs text-slate-400 mt-1">📍 ${j.lokasi}</p>` : ''}
                    <button onclick='openDetail(${JSON.stringify(j).replace(/"/g, "&quot;")})' 
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
async function openDetail(jasa) {
    currentJasaId  = jasa.id;
    currentJasaData = jasa;
    document.getElementById("modalNama").innerText  = jasa.nama;
    document.getElementById("modalHarga").innerText = "Rp " + Number(jasa.harga).toLocaleString();
    document.getElementById("modalDesc").innerText  = jasa.deskripsi || "Tidak ada deskripsi.";
    document.getElementById("modalImg").src         = jasa.img || "https://via.placeholder.com/300";

    const inputArea = document.getElementById("commentInputArea");
    const warning   = document.getElementById("commentLoginWarning");
    if (activeUser) {
        if (inputArea) inputArea.classList.remove("hidden");
        if (warning)   warning.classList.add("hidden");
    } else {
        if (inputArea) inputArea.classList.add("hidden");
        if (warning)   warning.classList.remove("hidden");
    }

    renderComments();
    loadRatingForModal(jasa.id);
    document.getElementById("detailModal").classList.remove("hidden");

    // Tombol WA — hanya konsultasi, tidak buat order
    var btnWA = document.getElementById("btnHubungiWA");
    if (btnWA) {
        btnWA.onclick = function() {
            if (!jasa.wa) return alert("Nomor WA penjasa tidak tersedia.");
            var teks = encodeURIComponent("Halo, saya tertarik dengan jasa \"" + jasa.nama + "\". Boleh tanya-tanya dulu?");
            window.open("https://wa.me/" + jasa.wa.replace(/\D/g,"") + "?text=" + teks, "_blank");
        };
    }

    // Tombol Booking — buat order resmi
    var btnBook = document.getElementById("btnOrderNow");
    if (btnBook) btnBook.onclick = function() { simpanDanPesan(jasa); };

    // ── Load profil penjasa ──
    loadProfilPenjasaModal(jasa.user_id);
}

async function loadProfilPenjasaModal(ownerId) {
    var card = document.getElementById("modalPenjasaCard");
    if (!card || !ownerId) return;

    try {
        // Fetch profil & data user sekaligus
        var rProfile = await _supabase
            .from("profiles")
            .select("username, avatar_url, bio, lokasi_usaha, wa_number")
            .eq("id", ownerId)
            .maybeSingle();

        var rRating = await _supabase
            .from("jasa")
            .select("id")
            .eq("user_id", ownerId);

        var profile = rProfile.data || {};
        var username = profile.username || "Penjasa";
        var avatar   = profile.avatar_url || ("https://ui-avatars.com/api/?name=" + username.charAt(0) + "&background=dbeafe&color=2563eb&bold=true&size=64");
        var bio      = profile.bio || "Mitra jasa di WargaBantuWarga.";
        var lokasi   = profile.lokasi_usaha || "";

        // Hitung total jasa & rating
        var jasaIds = (rRating.data || []).map(function(j){ return j.id; });
        var avgRating = null;
        if (jasaIds.length > 0) {
            var rr = await _supabase.from("ratings").select("nilai").in("jasa_id", jasaIds);
            var rd = rr.data || [];
            if (rd.length > 0) {
                avgRating = (rd.reduce(function(s,r){ return s+r.nilai; }, 0) / rd.length).toFixed(1);
            }
        }

        // Update elemen
        var avatarEl = document.getElementById("modalPenjasaAvatar");
        var nameEl   = document.getElementById("modalPenjasaName");
        var bioEl    = document.getElementById("modalPenjasaBio");
        var metaEl   = document.getElementById("modalPenjasaMeta");
        var btnProfil = document.getElementById("modalBtnPenjasaProfil");
        var btnChat  = document.getElementById("modalBtnPenjasaChat");

        if (avatarEl) {
            avatarEl.src = avatar;
            avatarEl.onclick = function() { closeModal(); bukaProfilPublik(ownerId); };
        }
        if (nameEl) {
            nameEl.textContent = "@" + username;
            nameEl.onclick = function() { closeModal(); bukaProfilPublik(ownerId); };
        }
        if (bioEl) bioEl.textContent = bio;

        // Meta: rating & lokasi
        var metaHTML = "";
        if (avgRating) metaHTML += '<span class="text-[10px] font-bold text-yellow-500">★ ' + avgRating + '</span>';
        if (lokasi)    metaHTML += '<span class="text-[10px] text-slate-400">📍 ' + lokasi + '</span>';
        if (metaEl) metaEl.innerHTML = metaHTML;

        // Tombol aksi
        if (btnProfil) btnProfil.onclick = function() { closeModal(); bukaProfilPublik(ownerId); };
        if (btnChat && activeUser && activeUser.id !== ownerId) {
            btnChat.onclick = function() { closeModal(); bukaChat(ownerId, username); };
            btnChat.style.display = "";
        } else if (btnChat) {
            btnChat.style.display = "none";
        }

        // Tampilkan card
        card.classList.remove("hidden");

    } catch(err) {
        console.error("loadProfilPenjasaModal error:", err);
    }
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
        container.innerHTML = '<div class="flex justify-center py-4"><div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div></div>';

        const { data: listKomentar, error } = await _supabase
            .from('komentar')
            .select('*, profiles!fk_komentar_profiles_final (username, avatar_url)')
            .eq('jasa_id', currentJasaId)
            .is('parent_id', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!listKomentar || listKomentar.length === 0) {
            container.innerHTML = '<div class="text-center py-6"><p class="text-xs text-slate-400 italic">Belum ada komentar di sini.</p></div>';
            return;
        }

        // Ambil balasan untuk semua komentar
        var parentIds = listKomentar.map(function(c){ return c.id; });
        var rReplies = await _supabase
            .from('komentar')
            .select('*, profiles!fk_komentar_profiles_final (username, avatar_url)')
            .in('parent_id', parentIds)
            .order('created_at', { ascending: true });
        var repliesMap = {};
        (rReplies.data || []).forEach(function(r) {
            if (!repliesMap[r.parent_id]) repliesMap[r.parent_id] = [];
            repliesMap[r.parent_id].push(r);
        });

        function renderAvatarHtml(avatarUrl, displayName) {
            return avatarUrl
                ? '<img src="' + avatarUrl + '" class="w-6 h-6 rounded-full object-cover border border-blue-100">'
                : '<div class="w-6 h-6 bg-blue-50 rounded-full flex items-center justify-center"><span class="text-[8px] font-bold text-blue-500">' + displayName.charAt(0).toUpperCase() + '</span></div>';
        }

        function renderOneComment(c, isReply) {
            var displayName = (c.profiles && c.profiles.username) ? c.profiles.username : 'Anonymous';
            var avatarUrl   = (c.profiles && c.profiles.avatar_url) ? c.profiles.avatar_url : null;
            var commentDate = new Date(c.created_at);
            var isToday     = new Date().toDateString() === commentDate.toDateString();
            var timeDisplay = commentDate.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
            var dateDisplay = isToday ? 'Hari ini' : commentDate.toLocaleDateString('id-ID', { day:'numeric', month:'short' });
            var avatarHtml  = renderAvatarHtml(avatarUrl, displayName);
            var isOwner     = activeUser && currentJasaData && activeUser.id === currentJasaData.user_id;
            var canReply    = activeUser && !isReply && isOwner;
            var uid = String(c.user_id);
            var cid = String(c.id);

            var html = '<div class="' + (isReply ? 'ml-8 mt-2 bg-blue-50 border-blue-100' : 'bg-white border-slate-100 mb-2') + ' p-3 rounded-xl border shadow-sm group">';
            html += '<div class="flex justify-between items-start mb-1">';
            html += '<button onclick="bukaProfilPublik(\'' + uid + '\')" class="flex items-center gap-1.5 hover:opacity-75 transition text-left">';
            html += avatarHtml;
            html += '<p class="text-[10px] font-bold text-blue-600 hover:underline">@' + displayName + '</p>';
            if (isOwner && !isReply) html += '<span class="text-[8px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold ml-1">Reviewer</span>';
            html += '</button><div class="flex items-center gap-1.5">';
            html += '<p class="text-[8px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">' + dateDisplay + ', ' + timeDisplay + '</p>';
            if (activeUser && activeUser.id === c.user_id) {
                html += '<button onclick="hapusKomentar(\'' + cid + '\')" class="opacity-0 group-hover:opacity-100 transition w-5 h-5 flex items-center justify-center rounded-full bg-red-50 hover:bg-red-100 text-red-400 text-[10px] font-bold">✕</button>';
            }
            html += '</div></div>';
            html += '<p class="text-sm text-slate-700 leading-relaxed pl-7">' + c.isi_komentar + '</p>';
            if (canReply) {
                html += '<button onclick="showReplyForm(\'' + cid + '\')" class="ml-7 mt-2 text-[10px] font-bold text-blue-500 hover:text-blue-700 transition">💬 Balas</button>';
                html += '<div id="replyForm-' + cid + '" class="hidden ml-7 mt-2"><div class="flex gap-2">';
                html += '<input id="replyInput-' + cid + '" placeholder="Tulis balasan..." class="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none">';
                html += '<button onclick="kirimBalasan(\'' + cid + '\')" class="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-bold">Kirim</button>';
                html += '</div></div>';
            }
            html += '</div>';
            return html;
        }

        container.innerHTML = listKomentar.map(function(c) {
            var replies = repliesMap[c.id] || [];
            var repliesHtml = replies.map(function(r) { return renderOneComment(r, true); }).join('');
            return renderOneComment(c, false) + repliesHtml;
        }).join('');

    } catch (err) {
        console.error("Render Error:", err);
        container.innerHTML = '<div class="p-4 bg-red-50 rounded-xl text-center"><p class="text-red-500 text-[10px] font-bold">Gagal memuat komentar: ' + (err.message || '') + '</p><button onclick="renderComments()" class="mt-2 text-[9px] text-red-600 underline">Coba lagi</button></div>';
    }
}

var currentJasaData = null; // simpan data jasa yang sedang dibuka

function showReplyForm(komentarId) {
    var form = document.getElementById('replyForm-' + komentarId);
    if (form) form.classList.toggle('hidden');
}

async function kirimBalasan(parentId) {
    if (!activeUser) return alert('Login dulu.');
    var input = document.getElementById('replyInput-' + parentId);
    var isi   = input ? input.value.trim() : '';
    if (!isi) return;

    try {
        var { error } = await _supabase.from('komentar').insert([{
            jasa_id:      currentJasaId,
            user_id:      activeUser.id,
            isi_komentar: isi,
            parent_id:    parentId,
            is_reply:     true
        }]);
        if (error) throw error;
        if (input) input.value = '';
        await renderComments();
    } catch(err) {
        alert('Gagal kirim balasan: ' + err.message);
    }
}

// =====================================================
// === HAPUS KOMENTAR ===
// =====================================================
async function hapusKomentar(komentarId) {
    if (!activeUser) return;
    if (!confirm("Hapus komentar ini?")) return;

    const { error } = await _supabase
        .from('komentar')
        .delete()
        .eq('id', komentarId)
        .eq('user_id', activeUser.id); // hanya bisa hapus milik sendiri

    if (error) return alert("Gagal hapus komentar: " + error.message);
    await renderComments();
}

// =====================================================
// === HALAMAN PROFIL PUBLIK ===
// =====================================================

async function bukaProfilPublik(userId) {
    if (!userId) return;

    // Tutup modal detail jika sedang terbuka
    const detailModal = document.getElementById('detailModal');
    if (detailModal) detailModal.classList.add('hidden');

    // Simpan halaman asal agar tombol kembali bisa balik
    const activePage = document.querySelector('.page-section.active');
    lastPageBeforeProfile = activePage?.id || 'marketplace';

    // Navigasi ke halaman profil publik
    showPage('publicProfile');

    // Reset dulu konten
    document.getElementById('pubUsername').textContent   = 'Memuat...';
    document.getElementById('pubBio').textContent        = '';
    document.getElementById('pubMeta').innerHTML         = '';
    document.getElementById('pubContactBtn').innerHTML   = '';
    document.getElementById('pubJasaSection').classList.add('hidden');
    document.getElementById('pubJasaList').innerHTML     = '';
    document.getElementById('pubAvatar').src =
        'https://ui-avatars.com/api/?name=U&background=dbeafe&color=2563eb&bold=true&size=128';

    try {
        // Ambil data profil + data user (untuk role & created_at)
        const [{ data: profile }, { data: userData }] = await Promise.all([
            _supabase.from('profiles').select('username, bio, avatar_url, lokasi_usaha, wa_number').eq('id', userId).maybeSingle(),
            _supabase.from('users').select('role, created_at, email').eq('id', userId).maybeSingle()
        ]);

        const username  = profile?.username || userData?.email?.split('@')[0] || 'Pengguna';
        const isPenjasa = userData?.role === 'penjasa';
        const avatar    = profile?.avatar_url
            || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=dbeafe&color=2563eb&bold=true&size=128`;

        // Avatar
        document.getElementById('pubAvatar').src = avatar;

        // Username & badge role
        document.getElementById('pubUsername').textContent = '@' + username;
        const badge = document.getElementById('pubRoleBadge');
        badge.textContent  = isPenjasa ? '🔧 Mitra Jasa' : '🛍️ Pelanggan';
        badge.className    = `text-xs font-bold px-3 py-1 rounded-full ${isPenjasa ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`;

        // Bio
        const bioEl = document.getElementById('pubBio');
        bioEl.textContent = profile?.bio || (isPenjasa ? 'Mitra jasa di WargaBantuWarga.' : 'Pengguna WargaBantuWarga.');

        // Meta info
        const metaEl = document.getElementById('pubMeta');
        const joinDate = userData?.created_at
            ? new Date(userData.created_at).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
            : null;
        metaEl.innerHTML = [
            profile?.lokasi_usaha ? `<span>📍 ${profile.lokasi_usaha}</span>` : '',
            joinDate            ? `<span>🗓️ Bergabung ${joinDate}</span>`   : '',
        ].filter(Boolean).join('');

        // Tombol di halaman profil publik
        var contactBtns = '';
        if (activeUser && activeUser.id !== userId) {
            var pName = (profile && profile.username) ? profile.username : 'User';
            contactBtns += "<button onclick=\"bukaChat('" + userId + "', '" + pName + "')\" " +
                "class=\"flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition\">" +
                "<svg class=\"h-4 w-4\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z\"/></svg>" +
                "Kirim Pesan</button>";
        }
        if (isPenjasa && profile?.wa_number) {
            contactBtns += '<a href="https://wa.me/' + profile.wa_number.replace(/\D/g,'') + '" target="_blank" ' +
                'class="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition">' +
                '<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.523 5.845L.057 23.492a.5.5 0 00.623.605l5.806-1.525A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.668-.523-5.186-1.433l-.372-.22-3.844 1.009 1.028-3.75-.242-.386A9.955 9.955 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>' +
                'Hubungi via WA</a>';
        }
        document.getElementById('pubContactBtn').innerHTML = '<div class="flex gap-2 flex-wrap">' + contactBtns + '</div>';

        // Jasa milik penjasa ini
        if (isPenjasa) {
            const { data: jasaList } = await _supabase
                .from('jasa')
                .select('*')
                .eq('user_id', userId)
                .order('id', { ascending: false });

            const jasaSection = document.getElementById('pubJasaSection');
            const jasaListEl  = document.getElementById('pubJasaList');

            if (jasaList && jasaList.length > 0) {
                jasaSection.classList.remove('hidden');
                jasaListEl.innerHTML = jasaList.map(j => `
                    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition cursor-pointer"
                         onclick='openDetail(${JSON.stringify(j).replace(/'/g, "&#39;")})'>
                        <img src="${j.img || 'https://via.placeholder.com/300'}"
                             class="w-full h-36 object-cover">
                        <div class="p-4">
                            <p class="font-bold text-slate-800 text-sm mb-1">${j.nama}</p>
                            <p class="text-blue-600 font-black text-sm">Rp ${Number(j.harga).toLocaleString()}</p>
                            <p class="text-xs text-slate-400 mt-1">📍 ${j.lokasi || '-'}</p>
                        </div>
                    </div>
                `).join('');
            } else {
                jasaSection.classList.remove('hidden');
                jasaListEl.innerHTML = '<p class="text-slate-400 italic text-sm col-span-2">Belum ada jasa yang dipasang.</p>';
            }
        }

    } catch (err) {
        console.error("Gagal load profil publik:", err);
        document.getElementById('pubUsername').textContent = 'Gagal memuat profil';
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
async function simpanDanPesan(jasa) {
    if (!activeUser) return alert("Silakan login terlebih dahulu.");
    if (!jasa) jasa = await getJasaById(currentJasaId);
    if (!jasa) return alert("Data jasa tidak ditemukan!");
    if (!jasa.user_id) return alert("Data pemilik jasa tidak ditemukan!");
    if (activeUser.id === jasa.user_id) return alert("Kamu tidak bisa memesan jasa milik sendiri.");

    var btnBook = document.getElementById("btnOrderNow");
    if (btnBook) { btnBook.disabled = true; btnBook.textContent = "Memproses..."; }

    try {
        var insertData = {
            jasa_id:   jasa.id,
            jasa_nama: jasa.nama,
            harga:     jasa.harga,
            buyer_id:  activeUser.id,
            owner_id:  jasa.user_id,
            status:    "pending"
        };

        var res = await _supabase.from("orders").insert([insertData]).select().single();
        if (res.error) throw res.error;

        var modal = document.getElementById("detailModal");
        if (modal) modal.classList.add("hidden");

        alert("Booking berhasil!\n\nJasa: " + jasa.nama + "\n\nMenunggu konfirmasi dari mitra.\nCek status di Riwayat Pesanan.");
        renderOrders();

    } catch (err) {
        console.error("Gagal booking:", err);
        alert("Gagal membuat booking: " + (err.message || JSON.stringify(err)));
    } finally {
        if (btnBook) { btnBook.disabled = false; btnBook.textContent = "Booking Sekarang"; }
    }
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
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-4 hover:border-blue-200 transition-colors">
                    <div class="flex justify-between items-start gap-3">
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-slate-800 text-base mb-1 truncate">${namaJasa}</h4>
                            <p class="text-[11px] text-slate-400 mb-2">${tanggal}</p>
                            <div class="text-blue-600 font-extrabold text-sm">Rp ${harga.toLocaleString('id-ID')}</div>
                        </div>
                        
                        <div class="flex flex-col items-end gap-2 shrink-0">
                            <span class="px-3 py-1 rounded-full text-[9px] font-bold uppercase ${
                                order.status === 'selesai'  ? 'bg-green-50 text-green-700 border border-green-200' :
                                order.status === 'diterima' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                order.status === 'ditolak'  ? 'bg-red-50 text-red-600 border border-red-200' :
                                                              'bg-yellow-50 text-yellow-700 border border-yellow-200'
                            }">
                                ${order.status === 'pending' ? '⏳ Menunggu' : order.status === 'diterima' ? '✅ Diterima' : order.status === 'selesai' ? '🎉 Selesai' : order.status === 'ditolak' ? '❌ Ditolak' : order.status || 'Pending'}
                            </span>
                            <button onclick="prosesCetak(${index})" 
                                    title="Cetak Invoice"
                                    class="p-2 bg-slate-900 text-white rounded-xl hover:bg-blue-600 transition-all shadow-sm active:scale-95">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                    <rect x="6" y="14" width="12" height="8"></rect>
                                </svg>
                            </button>
                        </div>
                    </div>

                    ${order.jasa_id ? `
                    <!-- Tombol Rating -->
                    <div id="ratingRow-${order.id}" class="mt-3 pt-3 border-t border-slate-100">
                        <p class="text-xs text-slate-400 mb-1.5 font-medium">Rating jasa ini:</p>
                        <div class="flex gap-1 items-center">
                            ${[1,2,3,4,5].map(n => `
                                <button onclick="setRatingFromOrder('${order.jasa_id}', ${n}, '${order.id}')"
                                        id="orderStar-${order.id}-${n}"
                                        class="text-xl text-slate-300 hover:text-yellow-400 transition order-star-btn"
                                        data-order="${order.id}" data-val="${n}">★</button>
                            `).join('')}
                            <span id="orderRatingLabel-${order.id}" class="text-xs text-slate-400 ml-2 italic"></span>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Load existing ratings untuk tiap order
        loadExistingOrderRatings(currentOrders);

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
 
 
// --- MANAJEMEN JASA PENJASA ---
// --- MANAJEMEN JASA PENJASA ---
async function fetchMyJasa() {
    if (!activeUser) return;
    try {
        var r1 = await _supabase.from("jasa").select("*").eq("user_id", activeUser.id);
        if (r1.error) throw r1.error;
        var safeJasa = Array.isArray(r1.data) ? r1.data : [];
        var jasaIds  = safeJasa.map(function(j){ return j.id; });
 
        var countOrders = 0;
        if (jasaIds.length > 0) {
            var r2 = await _supabase.from("orders").select("*", {count:"exact",head:true}).in("jasa_id", jasaIds);
            countOrders = r2.count || 0;
        }
 
        var avgRating = null;
        if (jasaIds.length > 0) {
            var r3 = await _supabase.from("ratings").select("nilai").in("jasa_id", jasaIds);
            var rd = r3.data;
            if (rd && rd.length > 0) {
                avgRating = (rd.reduce(function(s,r){ return s + r.nilai; }, 0) / rd.length).toFixed(1);
            }
        }
 
        var elActive = document.getElementById("statActiveJasa");
        var elTotal  = document.getElementById("statTotalOrder");
        var elRating = document.getElementById("statRating");
        if (elActive) elActive.innerText = safeJasa.length;
        if (elTotal)  elTotal.innerText  = countOrders;
        if (elRating) elRating.innerHTML = avgRating
            ? avgRating + '<span class="text-sm text-slate-300">/5</span>'
            : '—<span class="text-sm text-slate-300">/5</span>';
 
        renderJasa(safeJasa);
        renderMitraOrders();
 
    } catch(err) {
        console.error("fetchMyJasa error:", err);
        renderJasa([]);
    }
}
async function hapusJasa(id) {
    if(!confirm("Yakin hapus jasa ini?")) return;
    await _supabase.from('jasa').delete().eq('id', id);
    fetchMyJasa();
    fetchJasa();
}
 
// isi form dengan data jasa yang mau diedit
function persiapanEdit(jasa) {
    // Isi semua field form
    const pName     = document.getElementById('pName');
    const pCategory = document.getElementById('pCategory');
    const pPrice    = document.getElementById('pPrice');
    const pWA       = document.getElementById('pWA');
    const pLoc      = document.getElementById('pLoc');
    const pDesc     = document.getElementById('pDesc');
    const btnTambah = document.getElementById('btnTambahJasa');
    const previewImg = document.getElementById('preview-img');
    const dropText   = document.getElementById('drop-text');
 
    if (!pName) return;
 
    pName.value     = jasa.nama     || '';
    pCategory.value = jasa.kategori || '';
    pPrice.value    = jasa.harga    || '';
    pWA.value       = jasa.wa       || '';
    pLoc.value      = jasa.lokasi   || '';
    pDesc.value     = jasa.deskripsi || '';
 
    // Tampilkan foto lama di preview
    if (jasa.img && previewImg) {
        previewImg.src = jasa.img;
        previewImg.classList.remove('hidden');
        if (dropText) dropText.classList.add('hidden');
        base64Image = jasa.img; // pakai foto lama jika tidak diganti
    }
 
    // Set state edit
    isEditing = true;
    editId    = jasa.id;
 
    // Ganti label tombol & tambah tombol batal
    if (btnTambah) {
        btnTambah.textContent = '💾 Simpan Perubahan';
        btnTambah.classList.replace('bg-blue-600', 'bg-orange-500');
        btnTambah.classList.replace('hover:bg-blue-700', 'hover:bg-orange-600');
    }
 
    // Scroll ke form
    document.getElementById('pName')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
 
// Reset form ke mode tambah baru
function resetFormJasa() {
    const pName     = document.getElementById('pName');
    const pCategory = document.getElementById('pCategory');
    const pPrice    = document.getElementById('pPrice');
    const pWA       = document.getElementById('pWA');
    const pLoc      = document.getElementById('pLoc');
    const pDesc     = document.getElementById('pDesc');
    const btnTambah = document.getElementById('btnTambahJasa');
    const previewImg = document.getElementById('preview-img');
    const dropText   = document.getElementById('drop-text');
 
    if (pName)     pName.value     = '';
    if (pCategory) pCategory.value = '';
    if (pPrice)    pPrice.value    = '';
    if (pWA)       pWA.value       = '';
    if (pLoc)      pLoc.value      = '';
    if (pDesc)     pDesc.value     = '';
 
    base64Image = '';
    if (previewImg) { previewImg.src = ''; previewImg.classList.add('hidden'); }
    if (dropText)   dropText.classList.remove('hidden');
 
    isEditing = false;
    editId    = null;
 
    if (btnTambah) {
        btnTambah.textContent = 'Pasang Jasa Sekarang';
        btnTambah.classList.replace('bg-orange-500', 'bg-blue-600');
        btnTambah.classList.replace('hover:bg-orange-600', 'hover:bg-blue-700');
    }
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
 
// =====================================================
// === SISTEM RATING ===
// =====================================================
 
let selectedRating = 0;
 
// Render bintang display (read-only)
function renderStarsDisplay(rating, max = 5) {
    const full  = Math.floor(rating);
    const half  = rating - full >= 0.5;
    let html = '';
    for (let i = 1; i <= max; i++) {
        if (i <= full) {
            html += `<span class="text-yellow-400 text-sm">★</span>`;
        } else if (i === full + 1 && half) {
            html += `<span class="text-yellow-300 text-sm">★</span>`;
        } else {
            html += `<span class="text-slate-200 text-sm">★</span>`;
        }
    }
    return html;
}
 
// Load rating untuk jasa yang sedang dibuka di modal
async function loadRatingForModal(jasaId) {
    const starsEl   = document.getElementById('modalRatingStars');
    const textEl    = document.getElementById('modalRatingText');
    const countEl   = document.getElementById('modalRatingCount');
    const inputArea = document.getElementById('ratingInputArea');
    const loginWarn = document.getElementById('ratingLoginWarn');
    const msgEl     = document.getElementById('ratingMsg');
 
    selectedRating  = 0;
 
    try {
        // Ambil semua rating untuk jasa ini
        const { data: ratings } = await _supabase
            .from('ratings')
            .select('nilai')
            .eq('jasa_id', jasaId);
 
        const count   = ratings?.length || 0;
        const avg     = count > 0
            ? (ratings.reduce((s, r) => s + r.nilai, 0) / count).toFixed(1)
            : null;
 
        if (starsEl) starsEl.innerHTML = avg ? renderStarsDisplay(parseFloat(avg)) : renderStarsDisplay(0);
        if (textEl)  textEl.textContent = avg ? `${avg}/5` : 'Belum ada rating';
        if (countEl) countEl.textContent = count > 0 ? `(${count} ulasan)` : '';
 
        // Cek apakah user sudah pernah pesan jasa ini
        if (activeUser) {
            const { data: order } = await _supabase
                .from('orders')
                .select('id')
                .eq('buyer_id', activeUser.id)
                .eq('jasa_id', jasaId)
                .maybeSingle();
 
            if (order) {
                // Cek apakah sudah pernah rating
                const { data: myRating } = await _supabase
                    .from('ratings')
                    .select('nilai')
                    .eq('jasa_id', jasaId)
                    .eq('user_id', activeUser.id)
                    .maybeSingle();
 
                if (myRating) {
                    // Sudah rating — tampilkan nilai mereka
                    if (inputArea) inputArea.classList.remove('hidden');
                    if (msgEl) msgEl.textContent = `Rating kamu: ${myRating.nilai}/5 ⭐ (klik bintang untuk ubah)`;
                    selectedRating = myRating.nilai;
                    highlightStars(myRating.nilai);
                } else {
                    // Belum rating — tampilkan form
                    if (inputArea) inputArea.classList.remove('hidden');
                    if (msgEl) msgEl.textContent = 'Kamu sudah memesan jasa ini. Beri rating yuk!';
                }
                if (loginWarn) loginWarn.classList.add('hidden');
            } else {
                // Belum pernah pesan
                if (inputArea) inputArea.classList.add('hidden');
                if (loginWarn) { loginWarn.classList.remove('hidden'); loginWarn.textContent = 'Pesan jasa ini untuk memberi rating.'; }
            }
        } else {
            if (inputArea) inputArea.classList.add('hidden');
            if (loginWarn) { loginWarn.classList.remove('hidden'); loginWarn.textContent = 'Login dan pesan jasa ini untuk memberi rating.'; }
        }
    } catch (err) {
        console.error("Gagal load rating:", err);
    }
}
 
// Highlight bintang di input
function highlightStars(n) {
    document.querySelectorAll('#starInput .star-btn').forEach((btn, i) => {
        btn.style.color = i < n ? '#facc15' : '';
    });
}
 
// Set rating saat bintang diklik
async function setRating(nilai) {
    if (!activeUser) return alert("Login dulu!");
    selectedRating = nilai;
    highlightStars(nilai);
 
    const msgEl = document.getElementById('ratingMsg');
    if (msgEl) msgEl.textContent = 'Menyimpan...';
 
    try {
        // Upsert — update jika sudah ada, insert jika belum
        const { error } = await _supabase
            .from('ratings')
            .upsert({
                jasa_id: currentJasaId,
                user_id: activeUser.id,
                nilai: nilai
            }, { onConflict: 'jasa_id,user_id' });
 
        if (error) throw error;
 
        if (msgEl) msgEl.textContent = `Rating ${nilai}/5 tersimpan! ⭐`;
 
        // Refresh tampilan rating
        await loadRatingForModal(currentJasaId);
 
        // Refresh hero stats
        loadHeroStats();
 
    } catch (err) {
        console.error("Gagal simpan rating:", err);
        if (msgEl) msgEl.textContent = "Gagal menyimpan rating.";
    }
}
 
// =====================================================
// === HERO STATS (Rating Rata-rata, Total Jasa, Pesanan) ===
// =====================================================
async function loadHeroStats() {
    try {
        const [
            { data: jasaData },
            { data: ratingsData },
            { count: orderCount },
        ] = await Promise.all([
            _supabase.from('jasa').select('id'),
            _supabase.from('ratings').select('nilai'),
            _supabase.from('orders').select('*', { count: 'exact', head: true }),
        ]);
 
        // Rating rata-rata
        const ratingEl = document.getElementById('heroRatingText');
        if (ratingEl) {
            if (ratingsData && ratingsData.length > 0) {
                const avg = (ratingsData.reduce((s, r) => s + r.nilai, 0) / ratingsData.length).toFixed(1);
                ratingEl.textContent = `${avg}/5`;
            } else {
                ratingEl.textContent = '—/5';
            }
        }
 
        // Total jasa
        const jasaEl = document.getElementById('heroTotalJasaText');
        if (jasaEl) jasaEl.textContent = (jasaData?.length || 0) + '+';
 
        // Total pesanan selesai
        const orderEl = document.getElementById('heroTotalOrderText');
        if (orderEl) orderEl.textContent = (orderCount || 0) + '+';
 
        // Load jasa terpopuler
        loadPopularJasa();
 
    } catch (err) {
        console.error("Gagal load hero stats:", err);
    }
}
 
// =====================================================
// === JASA TERPOPULER DI HERO ===
// =====================================================
async function loadPopularJasa() {
    const listEl = document.getElementById('heroPopularList');
    const mobileEl = document.getElementById('heroPopularListMobile');
    if (!listEl && !mobileEl) return;
 
    try {
        const { data: orders } = await _supabase
            .from('orders')
            .select('jasa_id, jasa_nama');
 
        const emptyMsg = '<p class="text-xs text-slate-400 italic">Belum ada data.</p>';
 
        if (!orders || orders.length === 0) {
            if (listEl) listEl.innerHTML = emptyMsg;
            if (mobileEl) mobileEl.innerHTML = emptyMsg;
            return;
        }
 
        const freq = {};
        orders.forEach(o => {
            if (!o.jasa_id) return;
            freq[o.jasa_id] = freq[o.jasa_id] || { count: 0, nama: o.jasa_nama };
            freq[o.jasa_id].count++;
        });
 
        const top3 = Object.entries(freq)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 3);
 
        if (top3.length === 0) {
            if (listEl) listEl.innerHTML = emptyMsg;
            if (mobileEl) mobileEl.innerHTML = emptyMsg;
            return;
        }
 
        const ids = top3.map(([id]) => id);
        const { data: ratings } = await _supabase
            .from('ratings').select('jasa_id, nilai').in('jasa_id', ids);
 
        const ratingMap = {};
        (ratings || []).forEach(r => {
            ratingMap[r.jasa_id] = ratingMap[r.jasa_id] || [];
            ratingMap[r.jasa_id].push(r.nilai);
        });
 
        const medals = ['🥇', '🥈', '🥉'];
        const html = top3.map(([jasaId, info], i) => {
            const avgArr = ratingMap[jasaId] || [];
            const avg = avgArr.length > 0
                ? (avgArr.reduce((a, b) => a + b, 0) / avgArr.length).toFixed(1)
                : null;
            const starHtml = avg
                ? `<span class="text-yellow-400 text-xs">★</span><span class="text-[10px] text-slate-500 font-bold">${avg}</span>`
                : '';
            return `<div class="flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-1 py-0.5 transition" onclick="showPage(&quot;marketplace&quot;)">
                <div class="flex items-center gap-1.5 min-w-0">
                    <span class="text-sm">${medals[i]}</span>
                    <p class="text-xs font-bold text-slate-700 truncate max-w-[120px]">${info.nama}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    ${starHtml}
                    <span class="text-[9px] text-blue-500 font-bold">${info.count}x</span>
                </div>
            </div>`;
        }).join('');
 
        if (listEl) listEl.innerHTML = html;
        if (mobileEl) mobileEl.innerHTML = html;
 
    } catch (err) {
        console.error("Gagal load popular jasa:", err);
    }
}
 
 
// Rating dari halaman Riwayat Pesanan
async function setRatingFromOrder(jasaId, nilai, orderId) {
    if (!activeUser) return alert("Login dulu!");
 
    const labelEl = document.getElementById(`orderRatingLabel-${orderId}`);
    if (labelEl) labelEl.textContent = 'Menyimpan...';
 
    try {
        const { error } = await _supabase
            .from('ratings')
            .upsert({ jasa_id: jasaId, user_id: activeUser.id, nilai },
                    { onConflict: 'jasa_id,user_id' });
 
        if (error) throw error;
 
        // Highlight bintang di baris ini
        [1,2,3,4,5].forEach(n => {
            const btn = document.getElementById(`orderStar-${orderId}-${n}`);
            if (btn) btn.style.color = n <= nilai ? '#facc15' : '';
        });
        if (labelEl) labelEl.textContent = `Rating ${nilai}/5 ⭐`;
 
        loadHeroStats();
    } catch (err) {
        console.error("Gagal rating:", err);
        if (labelEl) labelEl.textContent = 'Gagal menyimpan.';
    }
}
 
// Load rating yang sudah ada untuk semua order di halaman riwayat
async function loadExistingOrderRatings(orders) {
    if (!activeUser || !orders?.length) return;
 
    const jasaIds = [...new Set(orders.filter(o => o.jasa_id).map(o => o.jasa_id))];
    if (!jasaIds.length) return;
 
    const { data: myRatings } = await _supabase
        .from('ratings')
        .select('jasa_id, nilai')
        .eq('user_id', activeUser.id)
        .in('jasa_id', jasaIds);
 
    if (!myRatings?.length) return;
 
    const ratingMap = {};
    myRatings.forEach(r => { ratingMap[r.jasa_id] = r.nilai; });
 
    orders.forEach(order => {
        if (!order.jasa_id) return;
        const nilai = ratingMap[order.jasa_id];
        if (!nilai) return;
 
        [1,2,3,4,5].forEach(n => {
            const btn = document.getElementById(`orderStar-${order.id}-${n}`);
            if (btn) btn.style.color = n <= nilai ? '#facc15' : '';
        });
        const labelEl = document.getElementById(`orderRatingLabel-${order.id}`);
        if (labelEl) labelEl.textContent = `Rating kamu: ${nilai}/5 ⭐`;
    });
}
 
 
function showDashTab(tab) {
    var main    = document.getElementById('dashMain');
    var keu     = document.getElementById('dashKeuangan');
    var tabMain = document.getElementById('tabMain');
    var tabKeu  = document.getElementById('tabKeuangan');
    if (tab === 'keuangan') {
        if (main) main.classList.add('hidden');
        if (keu)  keu.classList.remove('hidden');
        if (tabMain) { tabMain.classList.remove('bg-blue-600','text-white'); tabMain.classList.add('bg-white','text-slate-600','border','border-slate-200'); }
        if (tabKeu)  { tabKeu.classList.add('bg-blue-600','text-white');     tabKeu.classList.remove('bg-white','text-slate-600','border','border-slate-200'); }
        loadKeuangan();
    } else {
        if (main) main.classList.remove('hidden');
        if (keu)  keu.classList.add('hidden');
        if (tabKeu)  { tabKeu.classList.remove('bg-blue-600','text-white');   tabKeu.classList.add('bg-white','text-slate-600','border','border-slate-200'); }
        if (tabMain) { tabMain.classList.add('bg-blue-600','text-white');      tabMain.classList.remove('bg-white','text-slate-600','border','border-slate-200'); }
    }
}
 
function showOrderTab(tab) {
    var panelR  = document.getElementById('panelRiwayat');
    var panelW  = document.getElementById('panelWishlist');
    var tabR    = document.getElementById('tabRiwayat');
    var tabW    = document.getElementById('tabWishlist');
    if (tab === 'wishlist') {
        if (panelR) panelR.classList.add('hidden');
        if (panelW) panelW.classList.remove('hidden');
        if (tabR)   { tabR.classList.remove('bg-blue-600','text-white'); tabR.classList.add('bg-white','text-slate-600','border','border-slate-200'); }
        if (tabW)   { tabW.classList.add('bg-blue-600','text-white');    tabW.classList.remove('bg-white','text-slate-600','border','border-slate-200'); }
        renderWishlistPage();
    } else {
        if (panelW) panelW.classList.add('hidden');
        if (panelR) panelR.classList.remove('hidden');
        if (tabW)   { tabW.classList.remove('bg-blue-600','text-white'); tabW.classList.add('bg-white','text-slate-600','border','border-slate-200'); }
        if (tabR)   { tabR.classList.add('bg-blue-600','text-white');    tabR.classList.remove('bg-white','text-slate-600','border','border-slate-200'); }
    }
}
 
 
// ═══════════════════════════════════════════
// WISHLIST
// ═══════════════════════════════════════════
var myWishlistIds = new Set();
 
async function loadWishlistIds() {
    if (!activeUser) return;
    var r = await _supabase.from('wishlist').select('jasa_id').eq('user_id', activeUser.id);
    myWishlistIds = new Set((r.data || []).map(function(w){ return w.jasa_id; }));
    updateWishlistButtons();
}
 
function updateWishlistButtons() {
    myWishlistIds.forEach(function(id) {
        var btn = document.getElementById('wishBtn-' + id);
        if (btn) { btn.innerHTML = '♥'; btn.style.color = '#ef4444'; }
    });
}
 
async function toggleWishlist(jasaId, event) {
    if (event) event.stopPropagation();
    if (!activeUser) return alert('Login dulu untuk simpan wishlist.');
    var btn = document.getElementById('wishBtn-' + jasaId);
    var isWished = myWishlistIds.has(jasaId);
    if (isWished) {
        await _supabase.from('wishlist').delete().eq('user_id', activeUser.id).eq('jasa_id', jasaId);
        myWishlistIds.delete(jasaId);
        if (btn) { btn.innerHTML = '♡'; btn.style.color = ''; }
    } else {
        await _supabase.from('wishlist').insert([{ user_id: activeUser.id, jasa_id: jasaId }]);
        myWishlistIds.add(jasaId);
        if (btn) { btn.innerHTML = '♥'; btn.style.color = '#ef4444'; }
    }
}
 
async function renderWishlistPage() {
    var container = document.getElementById('wishlistContainer');
    if (!container || !activeUser) return;
    container.innerHTML = '<p class="text-slate-400 italic text-center py-8">Memuat...</p>';
 
    var r   = await _supabase.from('wishlist').select('jasa_id').eq('user_id', activeUser.id);
    var ids = (r.data || []).map(function(w){ return w.jasa_id; });
 
    // Sync myWishlistIds dengan data terbaru dari DB
    myWishlistIds = new Set(ids);
 
    if (ids.length === 0) {
        container.innerHTML = '<div class="text-center py-16"><p class="text-5xl mb-4">♡</p><p class="text-slate-400 font-medium">Belum ada jasa yang disimpan</p><p class="text-sm text-slate-300 mt-1">Klik ♡ di kartu jasa untuk menyimpannya</p></div>';
        return;
    }
 
    var rj = await _supabase.from('jasa').select('*').in('id', ids);
    container.innerHTML = (rj.data || []).map(function(j) {
        return '<div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex gap-4 items-center" id="wishItem-' + j.id + '">' +
            '<img src="' + (j.img || 'https://via.placeholder.com/80') + '" class="w-16 h-16 rounded-xl object-cover flex-shrink-0">' +
            '<div class="flex-1 min-w-0">' +
            '<p class="font-bold text-slate-800 truncate">' + j.nama + '</p>' +
            '<p class="text-blue-600 font-bold text-sm">Rp ' + Number(j.harga).toLocaleString() + '</p>' +
            (j.lokasi ? '<p class="text-xs text-slate-400">📍 ' + j.lokasi + '</p>' : '') +
            '</div>' +
            '<div class="flex flex-col gap-2 flex-shrink-0">' +
            '<button onclick="openDetail(' + JSON.stringify(j).replace(/"/g, '&quot;') + ')" class="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition">Lihat</button>' +
            '<button onclick="hapusWishlist(' + j.id + ', this)" class="text-xs font-bold text-red-400 bg-red-50 px-3 py-1.5 rounded-xl hover:bg-red-100 transition">Hapus ♥</button>' +
            '</div></div>';
    }).join('');
}
 
// Fungsi khusus hapus dari halaman wishlist — langsung delete tanpa cek Set
async function hapusWishlist(jasaId, btnEl) {
    if (!activeUser) return;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '...'; }
    try {
        var { error } = await _supabase
            .from('wishlist')
            .delete()
            .eq('user_id', activeUser.id)
            .eq('jasa_id', jasaId);
        if (error) throw error;
 
        // Hapus dari Set
        myWishlistIds.delete(jasaId);
 
        // Update tombol ♡ di marketplace jika ada
        var mktBtn = document.getElementById('wishBtn-' + jasaId);
        if (mktBtn) { mktBtn.innerHTML = '♡'; mktBtn.style.color = ''; }
 
        // Animasi hilang lalu reload
        var card = document.getElementById('wishItem-' + jasaId);
        if (card) {
            card.style.transition = 'opacity 0.3s';
            card.style.opacity = '0';
            setTimeout(function() { renderWishlistPage(); }, 300);
        } else {
            renderWishlistPage();
        }
        showToast('Dihapus dari wishlist');
    } catch(err) {
        console.error('hapusWishlist error:', err);
        alert('Gagal hapus: ' + err.message);
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Hapus ♥'; }
    }
}
 
// ═══════════════════════════════════════════
// KEUANGAN MITRA
// ═══════════════════════════════════════════
async function loadKeuangan() {
    var container = document.getElementById('keuanganContainer');
    if (!container || !activeUser) return;
    container.innerHTML = '<p class="text-slate-400 italic text-center py-6">Memuat data keuangan...</p>';
    try {
        var rj = await _supabase.from('jasa').select('id, nama').eq('user_id', activeUser.id);
        var myJasa = rj.data || [];
        var jasaIds = myJasa.map(function(j){ return j.id; });
        if (jasaIds.length === 0) {
            container.innerHTML = '<p class="text-slate-400 italic text-center py-6">Belum ada jasa terdaftar.</p>';
            return;
        }
        var ro = await _supabase.from('orders').select('id,jasa_id,jasa_nama,harga,status,created_at').in('jasa_id', jasaIds).order('created_at', {ascending:false});
        var orders = ro.data || [];
        var totalPendapatan = 0, totalSelesai = 0, totalPending = 0;
        orders.forEach(function(o) {
            if (o.status === 'selesai') { totalPendapatan += Number(o.harga||0); totalSelesai++; }
            else if (o.status === 'pending' || o.status === 'diterima') totalPending++;
        });
        var statusStyle = function(s) {
            return s==='selesai' ? 'background:#dcfce7;color:#16a34a;' : s==='diterima' ? 'background:#dbeafe;color:#2563eb;' : s==='ditolak' ? 'background:#fee2e2;color:#dc2626;' : 'background:#fef9c3;color:#ca8a04;';
        };
        container.innerHTML =
            '<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">' +
            '<div class="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-2xl text-white"><p class="text-green-100 text-xs font-bold uppercase mb-1">Total Pendapatan</p><p class="text-2xl font-black">Rp ' + totalPendapatan.toLocaleString('id-ID') + '</p><p class="text-green-200 text-xs mt-1">Dari ' + totalSelesai + ' pesanan selesai</p></div>' +
            '<div class="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl text-white"><p class="text-blue-100 text-xs font-bold uppercase mb-1">Pesanan Selesai</p><p class="text-2xl font-black">' + totalSelesai + '</p></div>' +
            '<div class="bg-gradient-to-br from-yellow-400 to-orange-500 p-6 rounded-2xl text-white"><p class="text-yellow-100 text-xs font-bold uppercase mb-1">Pesanan Berjalan</p><p class="text-2xl font-black">' + totalPending + '</p></div>' +
            '</div>' +
            '<h4 class="font-bold text-slate-700 mb-3">📋 Riwayat Transaksi</h4>' +
            '<div class="space-y-2">' +
            (orders.length === 0 ? '<p class="text-slate-400 italic text-center py-4">Belum ada transaksi.</p>' :
            orders.map(function(o) {
                var tgl = new Date(o.created_at).toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric'});
                return '<div style="background:white;border:1px solid #f1f5f9;border-radius:16px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;">' +
                '<div style="min-width:0;"><p style="font-weight:700;color:#0f172a;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (o.jasa_nama||'Jasa') + '</p><p style="font-size:11px;color:#94a3b8;">' + tgl + '</p></div>' +
                '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">' +
                (o.status==='selesai' ? '<p style="font-weight:800;color:#16a34a;font-size:14px;">+Rp ' + Number(o.harga||0).toLocaleString('id-ID') + '</p>' : '') +
                '<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;' + statusStyle(o.status) + '">' + (o.status||'pending').toUpperCase() + '</span>' +
                '</div></div>';
            }).join('')) + '</div>';
    } catch(err) {
        container.innerHTML = '<p class="text-red-400 italic text-center py-6">Gagal: ' + err.message + '</p>';
    }
}
 
 
 
// ═══════════════════════════════════════════
// STATUS TOKO BUKA / TUTUP
// ═══════════════════════════════════════════
var _tokoIsOpen = true; // default buka
 
async function loadStatusToko() {
    if (!activeUser) return;
    try {
        var r = await _supabase.from('profiles').select('is_open').eq('id', activeUser.id).maybeSingle();
        // Jika kolom is_open null → anggap buka
        _tokoIsOpen = (r.data && r.data.is_open === false) ? false : true;
        renderStatusToko();
 
        // Sync is_open ke semua jasa milik mitra di memori
        allJasa.forEach(function(j) {
            if (j.user_id === activeUser.id) j.is_open = _tokoIsOpen;
        });
    } catch(e) { console.error('loadStatusToko:', e); }
}
 
function renderStatusToko() {
    var box   = document.getElementById('statusTokoBox');
    var dot   = document.getElementById('statusTokoDot');
    var label = document.getElementById('statusTokoLabel');
    if (!box) return;
    if (_tokoIsOpen) {
        box.className   = 'px-4 py-2 bg-green-50 rounded-xl';
        if (dot)   { dot.className = 'w-2 h-2 bg-green-500 rounded-full animate-pulse'; }
        if (label) { label.textContent = '● Buka'; label.style.color = '#15803d'; }
        var p = box.querySelector('p');
        if (p) { p.textContent = 'Status Toko'; p.style.color = '#16a34a'; }
    } else {
        box.className   = 'px-4 py-2 bg-slate-100 rounded-xl';
        if (dot)   { dot.className = 'w-2 h-2 bg-slate-400 rounded-full'; }
        if (label) { label.textContent = '○ Tutup'; label.style.color = '#64748b'; }
        var p = box.querySelector('p');
        if (p) { p.textContent = 'Status Toko'; p.style.color = '#64748b'; }
    }
}
 
async function toggleStatusToko() {
    if (!activeUser) return;
    _tokoIsOpen = !_tokoIsOpen;
    renderStatusToko();
 
    try {
        // Simpan ke profiles
        await _supabase.from('profiles').update({ is_open: _tokoIsOpen }).eq('id', activeUser.id);
 
        // Update is_open di semua jasa milik mitra
        var rj = await _supabase.from('jasa').select('id').eq('user_id', activeUser.id);
        var ids = (rj.data || []).map(function(j){ return j.id; });
        if (ids.length > 0) {
            await _supabase.from('jasa').update({ is_open: _tokoIsOpen }).in('id', ids);
        }
 
        // Refresh kartu jasa di marketplace
        await fetchJasa();
 
        var msg = _tokoIsOpen ? '✅ Toko kamu sekarang BUKA' : '⛔ Toko kamu sekarang TUTUP';
        // Toast kecil tanpa alert
        showToast(msg);
 
    } catch(e) {
        console.error('toggleStatusToko:', e);
        // Revert jika gagal
        _tokoIsOpen = !_tokoIsOpen;
        renderStatusToko();
    }
}
 
function showToast(msg) {
    var toast = document.getElementById('toastMsg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastMsg';
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f172a;color:white;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:700;z-index:9999;transition:opacity 0.3s;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 2500);
}
 
function toggleCategoryModal() {
    document.getElementById("categoryModal").classList.toggle("hidden");
}
 
function selectCategory(cat) {
    selectedCategory = cat;
 
    // Update label tombol filter
    document.getElementById("currentCatText").innerText = cat === 'semua' ? 'Semua Kategori' : cat;
 
    // Aktifkan pill yang sesuai — cocokkan lewat onclick attribute atau teks yang mengandung nama kategori
    document.querySelectorAll('.cat-pill').forEach(function(btn) {
        var onclickVal = btn.getAttribute('onclick') || '';
        // Cari apakah onclick berisi nilai cat (misal selectCategory('Transportasi'))
        var isMatch = onclickVal.includes("'" + cat + "'") || onclickVal.includes('"' + cat + '"');
        // Fallback: cek teks mengandung nama kategori (tanpa emoji)
        if (!isMatch) {
            var cleanText = btn.innerText.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase();
            var cleanCat  = cat.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase();
            isMatch = cleanText === cleanCat || (cat === 'semua' && cleanText === 'semua');
        }
        if (isMatch) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
 
    applyFilters();
}
 
// Tambahkan ini di dalam 
// ══════════════════════════════════════════════════════
// FITUR CHAT
// ══════════════════════════════════════════════════════
var chatPartnerId   = null;
var chatPartnerName = '';
var chatInterval    = null;
 
// Buka chat dengan user tertentu (dari profil publik)
async function bukaChat(partnerId, partnerName) {
    if (!activeUser) return alert("Silakan login dulu untuk chat.");
    chatPartnerId   = partnerId;
    chatPartnerName = partnerName;
 
    showPage('chatPage');
 
    // Mobile: sembunyikan list, tampilkan chat area
    var listPanel = document.getElementById('chatListPanel');
    var area      = document.getElementById('chatArea');
    var input     = document.getElementById('chatInputArea');
 
    if (window.innerWidth < 768) {
        // Mobile: fullscreen chat area
        if (listPanel) listPanel.style.display = 'none';
        if (area)      { area.style.display = 'flex'; }
    } else {
        // Desktop: tampilkan keduanya side by side
        if (listPanel) { listPanel.style.cssText = 'display:flex;flex-direction:column;width:300px;height:100%;border-right:1px solid #e2e8f0;'; }
        if (area)      { area.style.display = 'flex'; area.style.flex = '1'; }
    }
    if (input) input.style.display = 'block';
 
    // Fetch foto & info partner dari DB
    var rp = await _supabase.from('profiles').select('username, avatar_url').eq('id', partnerId).maybeSingle();
    var profile = rp.data || {};
    var displayName = profile.username || partnerName;
    var avatarUrl   = profile.avatar_url || '';
 
    // Update header chat
    var nameEl   = document.getElementById('chatPartnerName');
    var avatarEl = document.getElementById('chatPartnerAvatar');
    var roleEl   = document.getElementById('chatPartnerRole');
 
    if (nameEl) nameEl.textContent = '@' + displayName;
    if (roleEl) roleEl.textContent = '';
 
    // Update avatar — pakai innerHTML wrapper agar tidak masalah outerHTML
    var avatarWrapper = document.getElementById('chatPartnerAvatar');
    if (avatarWrapper) {
        avatarWrapper.onclick = function() { bukaProfilPublik(partnerId); };
        avatarWrapper.style.cursor = 'pointer';
        if (avatarUrl) {
            avatarWrapper.innerHTML = '';
            avatarWrapper.style.background = 'transparent';
            avatarWrapper.style.padding = '0';
            var img = document.createElement('img');
            img.src = avatarUrl;
            img.style.cssText = 'width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #dbeafe;';
            avatarWrapper.appendChild(img);
        } else {
            avatarWrapper.innerHTML = displayName.charAt(0).toUpperCase();
            avatarWrapper.style.background = '#dbeafe';
        }
    }
 
    // Buat nama di header juga bisa diklik ke profil
    if (nameEl) {
        nameEl.className = 'font-bold text-slate-800 text-sm cursor-pointer hover:text-blue-600 transition';
        nameEl.onclick   = function() { bukaProfilPublik(partnerId); };
    }
 
    await loadChatMessages();
    await loadChatList();
 
    if (chatInterval) clearInterval(chatInterval);
    chatInterval = setInterval(loadChatMessages, 5000);
}
 
// Load daftar percakapan (semua user yang pernah chat)
async function loadChatList() {
    if (!activeUser) return;
    var listEl = document.getElementById('chatList');
    if (!listEl) return;
 
    try {
        // Ambil semua pesan yang melibatkan user ini
        var r = await _supabase
            .from('messages')
            .select('sender_id, receiver_id, isi, created_at, dibaca')
            .or('sender_id.eq.' + activeUser.id + ',receiver_id.eq.' + activeUser.id)
            .order('created_at', { ascending: false });
 
        if (r.error) throw r.error;
        var msgs = r.data || [];
 
        if (msgs.length === 0) {
            listEl.innerHTML = '<p class="text-slate-400 text-xs italic text-center p-6">Belum ada percakapan</p>';
            return;
        }
 
        // Kumpulkan partner unik
        var partners = {};
        msgs.forEach(function(m) {
            var pid = m.sender_id === activeUser.id ? m.receiver_id : m.sender_id;
            if (!partners[pid]) {
                partners[pid] = { lastMsg: m.isi, unread: 0 };
            }
            if (m.receiver_id === activeUser.id && !m.dibaca) {
                partners[pid].unread++;
            }
        });
 
        // Ambil profil semua partner
        var pids = Object.keys(partners);
        var rp = await _supabase.from('profiles').select('id, username, avatar_url').in('id', pids);
        var profileMap = {};
        (rp.data || []).forEach(function(p) { profileMap[p.id] = p; });
 
        // Hitung total unread
        var totalUnread = Object.values(partners).reduce(function(s, p) { return s + p.unread; }, 0);
        var badge = document.getElementById('chatUnreadBadge');
        if (badge) badge.classList.toggle('hidden', totalUnread === 0);
 
        // Render list
        listEl.innerHTML = pids.map(function(pid) {
            var p       = profileMap[pid] || {};
            var name    = p.username || 'User';
            var avatar  = p.avatar_url || '';
            var info    = partners[pid];
            var isActive = pid === chatPartnerId;
            var unreadHtml = info.unread > 0
                ? '<span style="background:#ef4444;color:white;font-size:10px;padding:1px 6px;border-radius:999px;font-weight:700;">' + info.unread + '</span>'
                : '';
            var avatarHtml = avatar
                ? '<img src="' + avatar + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;flex-shrink:0;">'
                : '<div style="width:44px;height:44px;background:#dbeafe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#2563eb;font-size:15px;flex-shrink:0;">' + name.charAt(0).toUpperCase() + '</div>';
            return '<button onclick="bukaChat(\'' + pid + '\', \'' + name + '\')" ' +
                'style="width:100%;display:flex;align-items:center;gap:12px;padding:12px 16px;background:' + (isActive ? '#eff6ff' : 'white') + ';border:none;border-bottom:1px solid #f1f5f9;cursor:pointer;text-align:left;">' +
                avatarHtml +
                '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">' +
                '<p style="font-weight:700;font-size:14px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">@' + name + '</p>' + unreadHtml +
                '</div>' +
                '<p style="font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (info.lastMsg || '') + '</p>' +
                '</div></button>';
        }).join('');
 
    } catch(err) {
        console.error("loadChatList error:", err);
    }
}
 
// Load pesan dalam percakapan aktif
async function loadChatMessages() {
    if (!activeUser || !chatPartnerId) return;
    var msgEl = document.getElementById('chatMessages');
    if (!msgEl) return;
 
    try {
        var r = await _supabase
            .from('messages')
            .select('id, sender_id, receiver_id, isi, created_at, dibaca')
            .or(
                'and(sender_id.eq.' + activeUser.id + ',receiver_id.eq.' + chatPartnerId + '),' +
                'and(sender_id.eq.' + chatPartnerId + ',receiver_id.eq.' + activeUser.id + ')'
            )
            .order('created_at', { ascending: true });
 
        if (r.error) throw r.error;
        var msgs = r.data || [];
 
        if (msgs.length === 0) {
            msgEl.innerHTML = '<p class="text-center text-slate-400 text-xs italic py-8">Belum ada pesan. Mulai percakapan!</p>';
            return;
        }
 
        msgEl.innerHTML = msgs.map(function(m) {
            var isMine = m.sender_id === activeUser.id;
            var tgl = new Date(m.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
            var bubbleStyle = isMine
                ? 'background:#2563eb;color:white;border-radius:18px 18px 4px 18px;'
                : 'background:white;color:#0f172a;border-radius:18px 18px 18px 4px;box-shadow:0 1px 2px rgba(0,0,0,0.06);';
            return '<div style="display:flex;justify-content:' + (isMine ? 'flex-end' : 'flex-start') + ';">' +
                '<div style="max-width:75%;' + bubbleStyle + 'padding:10px 14px;">' +
                '<p style="font-size:14px;line-height:1.5;margin:0;">' + escapeHtml(m.isi) + '</p>' +
                '<p style="font-size:10px;margin:4px 0 0;text-align:right;color:' + (isMine ? 'rgba(255,255,255,0.7)' : '#94a3b8') + ';">' + tgl + '</p>' +
                '</div></div>';
        }).join('');
 
        // Scroll ke bawah
        msgEl.scrollTop = msgEl.scrollHeight;
 
        // Tandai pesan masuk sebagai dibaca
        var unreadIds = msgs.filter(function(m) {
            return m.receiver_id === activeUser.id && !m.dibaca;
        }).map(function(m) { return m.id; });
 
        if (unreadIds.length > 0) {
            await _supabase.from('messages').update({ dibaca: true }).in('id', unreadIds);
            loadChatList(); // refresh badge
        }
 
    } catch(err) {
        console.error("loadChatMessages error:", err);
    }
}
 
// Kirim pesan
async function kirimPesan() {
    if (!activeUser)      return alert("Silakan login dulu.");
    if (!chatPartnerId)   return alert("Pilih penerima dulu.");
 
    var input = document.getElementById('chatInput');
    var isi   = (input ? input.value : '').trim();
    if (!isi) return;
 
    input.value = '';
    input.disabled = true;
 
    try {
        var r = await _supabase.from('messages').insert([{
            sender_id:   activeUser.id,
            receiver_id: chatPartnerId,
            isi:         isi,
            dibaca:      false
        }]);
        if (r.error) throw r.error;
        await loadChatMessages();
    } catch(err) {
        console.error("kirimPesan error:", err);
        alert("Gagal kirim pesan: " + err.message);
        if (input) input.value = isi;
    } finally {
        if (input) input.disabled = false;
        if (input) input.focus();
    }
}
 
// Filter list chat
function filterChatList() {
    var q = document.getElementById('chatSearchInput').value.toLowerCase();
    var btns = document.querySelectorAll('#chatList button');
    btns.forEach(function(btn) {
        btn.style.display = btn.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}
 
// Helper escape HTML
function escapeHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}
 
 
// Kembali ke daftar chat (tombol back di mobile)
function tutupChatArea() {
    var listPanel = document.getElementById('chatListPanel');
    var area      = document.getElementById('chatArea');
    if (listPanel) listPanel.style.display = 'flex';
    if (area)      area.style.display = 'none';
    if (chatInterval) clearInterval(chatInterval);
}
 
// Stop auto-refresh saat keluar dari halaman chat
var _origShowPage = showPage;
// fetchMitraOrders(); 
 
// --- FITUR DASHBOARD MITRA (PRO) ---
 
async function fetchMitraOrders() {
    renderMitraOrders();
}
 
async function renderMitraOrders() {
    var container = document.getElementById("mitraOrderList");
    if (!container || !activeUser) return;
 
    container.innerHTML = '<div class="flex justify-center py-8"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>';
 
    try {
        var r1 = await _supabase.from("jasa").select("id,nama,wa").eq("user_id", activeUser.id);
        if (r1.error) throw r1.error;
 
        if (!r1.data || r1.data.length === 0) {
            container.innerHTML = '<p class="text-slate-400 italic text-center py-4">Belum ada jasa yang terdaftar.</p>';
            return;
        }
 
        var myJasaIds = r1.data.map(function(j){ return j.id; });
        var waMap = {};
        r1.data.forEach(function(j){ waMap[j.id] = j.wa || ""; });
 
        var r2 = await _supabase.from("orders")
            .select("id,jasa_id,jasa_nama,harga,buyer_id,status,created_at")
            .in("jasa_id", myJasaIds)
            .order("created_at", {ascending: false});
        if (r2.error) throw r2.error;
 
        var orders = r2.data || [];
 
        var elTotal = document.getElementById("statTotalOrder");
        if (elTotal) elTotal.innerText = orders.length;
 
        if (orders.length === 0) {
            container.innerHTML = '<p class="text-slate-400 italic text-center py-4">Belum ada pesanan masuk.</p>';
            return;
        }
 
        // Ambil profil buyer terpisah
        var buyerIds = orders.map(function(o){ return o.buyer_id; }).filter(Boolean);
        buyerIds = [...new Set(buyerIds)];
        var profileMap = {};
        if (buyerIds.length > 0) {
            var r3 = await _supabase.from("profiles").select("id,username,wa_number").in("id", buyerIds);
            (r3.data || []).forEach(function(p){ profileMap[p.id] = p; });
        }
 
        var statusStyle = {
            "pending":  "bg-yellow-50 text-yellow-700 border-yellow-200",
            "diterima": "bg-blue-50 text-blue-700 border-blue-200",
            "selesai":  "bg-green-50 text-green-700 border-green-200",
            "ditolak":  "bg-red-50 text-red-600 border-red-200"
        };
 
        var html = "";
        orders.forEach(function(order) {
            var style     = statusStyle[order.status] || "bg-slate-50 text-slate-500 border-slate-200";
            var tgl       = new Date(order.created_at).toLocaleString("id-ID", {day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
            var buyer     = profileMap[order.buyer_id] || {};
            var buyerName = buyer.username || "Warga";
            var buyerWA   = (buyer.wa_number || "").replace(/\D/g,"");
            var jasaWA    = (waMap[order.jasa_id] || "").replace(/\D/g,"");
            var wa        = buyerWA || jasaWA;
            var harga     = Number(order.harga || 0).toLocaleString("id-ID");
            var statusUp  = (order.status || "pending").toUpperCase();
            var jasaNama  = (order.jasa_nama || "Jasa").replace(/"/g,"&quot;");
 
            var actionBtns = "";
            if (order.status === "pending") {
                actionBtns  = '<button onclick="updateOrderStatus(\'' + order.id + '\',\'diterima\',\'' + wa + '\')" class="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition">Terima Pesanan</button>';
                actionBtns += '<button onclick="updateOrderStatus(\'' + order.id + '\',\'ditolak\',\'\')" class="bg-red-50 text-red-500 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-red-100 transition">Tolak</button>';
            } else if (order.status === "diterima") {
                actionBtns  = '<button onclick="hubungiPemesan(\'' + wa + '\',\'' + jasaNama + '\')" class="flex-1 bg-green-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-600 transition">Hubungi via WA</button>';
                actionBtns += '<button onclick="updateOrderStatus(\'' + order.id + '\',\'selesai\',\'\')" class="bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-200 transition">Tandai Selesai</button>';
            } else {
                actionBtns = '<span class="text-sm text-slate-400 italic">Pesanan ' + order.status + '</span>';
            }
 
            html += '<div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-3">';
            html +=   '<div class="flex justify-between items-start mb-3">';
            html +=     '<div>';
            html +=       '<p class="text-xs text-slate-400">' + tgl + '</p>';
            html +=       '<p class="font-bold text-slate-800">' + (order.jasa_nama || "Jasa") + '</p>';
            html +=       '<p class="text-sm text-slate-500">Pemesan: <span class="font-bold text-blue-600">@' + buyerName + '</span></p>';
            html +=       '<p class="text-sm font-bold text-slate-700">Rp ' + harga + '</p>';
            html +=     '</div>';
            html +=     '<span class="text-xs font-bold px-3 py-1 rounded-full border ' + style + '">' + statusUp + '</span>';
            html +=   '</div>';
            html +=   '<div class="flex gap-2 flex-wrap mt-3">' + actionBtns + '</div>';
            html += '</div>';
        });
 
        container.innerHTML = html;
 
    } catch(err) {
        console.error("renderMitraOrders error:", err);
        container.innerHTML = '<p class="text-red-400 italic p-4 text-center">Gagal memuat: ' + err.message + '</p>';
    }
}
 
async function updateOrderStatus(orderId, newStatus, waNumber) {
    var res = await _supabase.from("orders").update({status: newStatus}).eq("id", orderId);
    if (res.error) return alert("Gagal update status: " + res.error.message);
 
    if (newStatus === "diterima") {
        // Hanya update status, TIDAK buka WA otomatis
        showToast("✅ Pesanan diterima! Silakan hubungi pemesan via WA.");
    } else if (newStatus === "ditolak") {
        showToast("❌ Pesanan ditolak.");
    } else if (newStatus === "selesai") {
        showToast("🎉 Pesanan selesai! Terima kasih.");
    }
    renderMitraOrders();
}
 
function hubungiPemesan(waNumber, jasaNama) {
    if (!waNumber) return alert("Nomor WA pemesan tidak tersedia.");
    var teks = encodeURIComponent("Halo! Kami dari jasa \"" + jasaNama + "\". Pesanan Anda sudah kami terima, mari koordinasi lebih lanjut.");
    window.open("https://wa.me/" + waNumber + "?text=" + teks, "_blank");
}
 
function updateMitraStats(orders) {
    document.getElementById("statTotalOrder").innerText = orders.length;
    // Hitung jasa aktif dari allJasa yang owner_email-nya adalah user aktif
    const myJasaCount = allJasa.filter(j => j.owner_email === activeUser.email).length;
    document.getElementById("statActiveJasa").innerText = myJasaCount;
}
 
// =====================================================
// === FITUR PROFIL LENGKAP (BIO, FOTO, USERNAME) ===
// =====================================================
 
let profileAvatarBase64 = ""; // menyimpan foto baru yang dipilih
 
// Buka/tutup modal profil & load data saat dibuka
async function toggleProfileModal() {
    const modal = document.getElementById('modalProfile');
    const isHidden = modal.classList.contains('hidden');
    modal.classList.toggle('hidden');
    if (isHidden) {
        await loadProfileData();
    }
}
 
// Load data profil dari Supabase ke form
async function loadProfileData() {
    if (!activeUser) return;
 
    const emailEl    = document.getElementById('profileEmailDisplay');
    const typeEl     = document.getElementById('profileTypeDisplay');
    const joinedEl   = document.getElementById('profileJoinedDisplay');
    const roleBadge  = document.getElementById('profileRoleBadge');
    const lokasiField = document.getElementById('profileLokasiField');
    const waField    = document.getElementById('profileWAField');
 
    if (emailEl) emailEl.textContent = activeUser.email;
 
    const isPenjasa = activeUser.role === 'penjasa';
    if (typeEl) {
        typeEl.textContent = isPenjasa ? '🔧 Mitra Jasa' : '🛍️ Pelanggan';
        typeEl.className = `text-xs font-bold px-2 py-0.5 rounded-full ${isPenjasa ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`;
    }
    if (roleBadge) roleBadge.textContent = isPenjasa ? 'Akun Mitra Jasa' : 'Akun Pelanggan';
    if (lokasiField) lokasiField.classList.toggle('hidden', !isPenjasa);
    if (waField)     waField.classList.toggle('hidden', !isPenjasa);
 
    try {
        // ✅ Ambil created_at langsung dari tabel users (bukan localStorage yang mungkin tidak punya kolom ini)
        const { data: userData } = await _supabase
            .from('users')
            .select('created_at')
            .eq('id', activeUser.id)
            .maybeSingle();
 
        if (joinedEl) {
            const rawDate = userData?.created_at || activeUser.created_at;
            if (rawDate) {
                joinedEl.textContent = new Date(rawDate).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric'
                });
            } else {
                joinedEl.textContent = '—';
            }
        }
 
        // Ambil data profil
        const { data: profile, error } = await _supabase
            .from('profiles')
            .select('username, bio, avatar_url, lokasi_usaha, wa_number')
            .eq('id', activeUser.id)
            .maybeSingle();
 
        if (error) throw error;
 
        const username = profile?.username || activeUser.email.split('@')[0];
 
        const usernameInput  = document.getElementById('newUsername');
        const bioInput       = document.getElementById('newBio');
        const lokasiInput    = document.getElementById('newLokasi');
        const waInput        = document.getElementById('newWA');
        const avatarPreview  = document.getElementById('profileAvatarPreview');
        const navAvatar      = document.getElementById('navAvatarImg');
        const navText        = document.getElementById('navUsernameText');
 
        if (usernameInput) usernameInput.value = username;
        if (bioInput)      bioInput.value      = profile?.bio || '';
        if (lokasiInput)   lokasiInput.value   = profile?.lokasi_usaha || '';
        if (waInput)       waInput.value       = profile?.wa_number || '';
 
        // Avatar: pakai base64 tersimpan, atau fallback ke generated avatar
        const avatarSrc = profile?.avatar_url
            || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=dbeafe&color=2563eb&bold=true&size=128`;
 
        if (avatarPreview) avatarPreview.src = avatarSrc;
        if (navAvatar)     navAvatar.src     = avatarSrc;
        if (navText)       navText.textContent = username;
 
        // Sinkron ke kartu profil di dashboard
        const dashAvatar = document.getElementById('dashAvatarImg');
        const dashText   = document.getElementById('dashUsernameText');
        if (dashAvatar) dashAvatar.src         = avatarSrc;
        if (dashText)   dashText.textContent   = username;
 
    } catch (err) {
        console.error("Gagal load profil:", err);
    }
}
 
// Preview foto sebelum upload
function previewAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
 
    if (file.size > 2 * 1024 * 1024) {
        alert("Ukuran foto maksimal 2MB ya!");
        return;
    }
 
    const reader = new FileReader();
    reader.onload = (e) => {
        profileAvatarBase64 = e.target.result; // simpan base64
        const preview = document.getElementById('profileAvatarPreview');
        if (preview) preview.src = profileAvatarBase64;
    };
    reader.readAsDataURL(file);
}
 
// Simpan semua perubahan profil ke Supabase
// ✅ Foto disimpan sebagai base64 langsung di kolom avatar_url — tidak perlu Supabase Storage
async function saveProfile() {
    if (!activeUser) return alert("Silakan login terlebih dahulu!");
 
    const newUsername = document.getElementById('newUsername')?.value.trim();
    const newBio      = document.getElementById('newBio')?.value.trim();
    const newLokasi   = document.getElementById('newLokasi')?.value.trim();
    const newWA       = document.getElementById('newWA')?.value.trim();
    const statusEl    = document.getElementById('profileStatus');
    const btn         = document.getElementById('btnSaveProfile');
 
    if (!newUsername) return alert("Username tidak boleh kosong!");
 
    // Validasi ukuran base64 (~750KB limit agar tidak melebihi batas kolom text)
    if (profileAvatarBase64 && profileAvatarBase64.length > 750_000) {
        return alert("Ukuran foto terlalu besar. Coba pilih foto yang lebih kecil (maks ~500KB).");
    }
 
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg> Menyimpan...`;
        }
        if (statusEl) statusEl.textContent = "Menyimpan...";
 
        // ✅ 1. Verifikasi user benar-benar ada di tabel users (cegah foreign key error)
        const { data: userCheck, error: userCheckError } = await _supabase
            .from('users')
            .select('id')
            .eq('id', activeUser.id)
            .maybeSingle();
 
        if (userCheckError || !userCheck) {
            localStorage.removeItem("activeUser");
            alert("Sesi kamu sudah tidak valid. Silakan login ulang.");
            location.reload();
            return;
        }
 
        // ✅ 2. Pastikan baris profiles sudah ada — buat dulu jika belum
        const { data: existingProfile } = await _supabase
            .from('profiles')
            .select('id')
            .eq('id', activeUser.id)
            .maybeSingle();
 
        if (!existingProfile) {
            const { error: insertErr } = await _supabase
                .from('profiles')
                .insert([{ id: activeUser.id, username: newUsername }]);
            if (insertErr) throw insertErr;
        }
 
        // Cek apakah username sudah dipakai user LAIN
        const { data: existingUser } = await _supabase
            .from('profiles')
            .select('id')
            .eq('username', newUsername)
            .neq('id', activeUser.id)   // kecualikan diri sendiri
            .maybeSingle();
 
        if (existingUser) {
            if (statusEl) statusEl.textContent = "";
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg> Simpan Perubahan`;
            }
            return alert(`Username "@${newUsername}" sudah dipakai orang lain. Coba username yang berbeda!`);
        }
 
        // Buat payload update
        const updatePayload = {
            username: newUsername,
            bio: newBio || null,
            updated_at: new Date().toISOString()
        };
 
        if (profileAvatarBase64) {
            updatePayload.avatar_url = profileAvatarBase64;
        }
 
        if (activeUser.role === 'penjasa') {
            updatePayload.lokasi_usaha = newLokasi || null;
            updatePayload.wa_number    = newWA || null;
        }
 
        // Gunakan UPDATE (bukan upsert) agar tidak trigger constraint username_key
        const { error: updateError } = await _supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', activeUser.id);
 
        if (updateError) throw updateError;
 
        // Update navbar langsung tanpa reload
        const navAvatar    = document.getElementById('navAvatarImg');
        const navText      = document.getElementById('navUsernameText');
        const avatarPreview = document.getElementById('profileAvatarPreview');
 
        if (navText) navText.textContent = newUsername;
 
        const finalSrc = profileAvatarBase64 || avatarPreview?.src;
        if (navAvatar && finalSrc) navAvatar.src = finalSrc;
 
        // Sinkron ke dashboard
        const dashAvatar = document.getElementById('dashAvatarImg');
        const dashText   = document.getElementById('dashUsernameText');
        if (dashAvatar && finalSrc) dashAvatar.src       = finalSrc;
        if (dashText)               dashText.textContent = newUsername;
 
        // Simpan ke localStorage agar sinkron
        activeUser.username = newUsername;
        localStorage.setItem("activeUser", JSON.stringify(activeUser));
 
        if (statusEl) statusEl.textContent = "✅ Profil berhasil disimpan!";
        profileAvatarBase64 = ""; // reset buffer
 
        setTimeout(() => {
            const modal = document.getElementById('modalProfile');
            if (modal && !modal.classList.contains('hidden')) toggleProfileModal();
            if (statusEl) statusEl.textContent = "";
        }, 1200);
 
    } catch (err) {
        console.error("Error simpan profil:", err);
        if (statusEl) statusEl.textContent = "❌ " + (err.message || "Gagal menyimpan");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg> Simpan Perubahan`;
        }
    }
}
 
// Fungsi lama dipertahankan untuk kompatibilitas
async function saveUsername() {
    return saveProfile();
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