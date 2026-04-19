const SUPABASE_URL = 'https://hwolvggrgdtduuxdyzdt.supabase.co';

// ─── Helper format angka Rupiah ringkas ─────────────────────────────
function _fmtRp(val) {
    var n = Number(val) || 0;
    if (n >= 1e9)  return 'Rp ' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e6)  return 'Rp ' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'jt';
    if (n >= 1e3)  return 'Rp ' + (n / 1e3).toFixed(0) + 'rb';
    return 'Rp ' + n.toLocaleString('id-ID');
}
// ────────────────────────────────────────────────────────────────────

const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3b2x2Z2dyZ2R0ZHV1eGR5emR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTQwMTAsImV4cCI6MjA5MTY3MDAxMH0.W8TFYsLr1WoediCkL9ahK6w24tOmvgayDV59uI1x-mY'; // Gunakan key Anda



//  Wrapper agar bcrypt bisa dipanggil langsung 
// bcryptjs via CDN expose sebagai "dcodeIO.bcrypt" atau "self.bcrypt"
var bcrypt = (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt)
    ? dcodeIO.bcrypt
    : (typeof self !== 'undefined' && self.bcrypt)
        ? self.bcrypt
        : null;

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



// 
// FITUR CHAT
// 
var chatPartnerId   = null;
var chatPartnerName = '';
var chatInterval    = null;
var _chatMsgCount   = 0;

//  Supabase Realtime channels 
var _chatRealtimeChannel   = null;   // per-sesi chat
var _globalRealtimeChannel = null;   // notif & badge global

/** Aktifkan realtime untuk percakapan aktif. */
function setupChatRealtime() {
    if (!activeUser) return;
    if (_chatRealtimeChannel) {
        _supabase.removeChannel(_chatRealtimeChannel);
        _chatRealtimeChannel = null;
    }
    if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }

    _chatRealtimeChannel = _supabase
        .channel('chat-conv-' + activeUser.id + '-' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' },
            function(payload) {
                var rec = payload.new || payload.old || {};
                var relevant =
                    (rec.sender_id   === activeUser.id && rec.receiver_id === chatPartnerId) ||
                    (rec.receiver_id === activeUser.id && rec.sender_id   === chatPartnerId);
                if (relevant) loadChatMessages();
                loadChatList();
                updateChatBadge();
            }
        )
        .subscribe(function(status) {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                // Fallback polling jika realtime putus
                if (!chatInterval) chatInterval = setInterval(loadChatMessages, 3000);
            }
        });
}

/** Matikan realtime percakapan aktif. */
function teardownChatRealtime() {
    if (_chatRealtimeChannel) {
        _supabase.removeChannel(_chatRealtimeChannel);
        _chatRealtimeChannel = null;
    }
    if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }
}

/** Realtime global untuk badge & notif pesan masuk. */
function setupGlobalRealtime() {
    if (!activeUser) return;
    if (_globalRealtimeChannel) {
        _supabase.removeChannel(_globalRealtimeChannel);
        _globalRealtimeChannel = null;
    }
    _globalRealtimeChannel = _supabase
        .channel('global-msg-' + activeUser.id)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'messages',
            filter: 'receiver_id=eq.' + activeUser.id
        }, async function(payload) {
            var msg = payload.new || {};
            // Update badge selalu
            updateChatBadge();
            cekPesanBaru();
            // Jika sedang buka chat dengan pengirim ini, update pesan langsung
            if (chatPartnerId && chatPartnerId === msg.sender_id) {
                loadChatMessages();
            }
            loadChatList();
        })
        .subscribe();
}

/** Matikan semua realtime channel. */
function teardownAllRealtime() {
    teardownChatRealtime();
    if (_globalRealtimeChannel) {
        _supabase.removeChannel(_globalRealtimeChannel);
        _globalRealtimeChannel = null;
    }
}
// 

// Buka chat dengan user tertentu (dari profil publik)
async function bukaChat(partnerId, partnerName) {
    if (!activeUser) return alert("Silakan login dulu untuk chat.");
    chatPartnerId   = partnerId;
    chatPartnerName = partnerName;
    _chatMsgCount   = 0; // reset agar langsung scroll ke bawah saat buka chat baru

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
    var btnHapus = document.getElementById('btnHapusChat');
    if (btnHapus) btnHapus.style.display = 'flex';

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
    // Supabase Realtime → pesan instan (bukan polling)
    setupChatRealtime();
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
            var tgl    = new Date(m.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });

            // Parse reply prefix  REPLY:...pesan
            var rawIsi   = m.isi || '';
            var quoteHtml = '';
            var actualIsi = rawIsi;
            var replyMatch = rawIsi.match(/^\u27E6REPLY:([\s\S]*?)\u27E7([\s\S]*)$/);
            if (replyMatch) {
                var quoteText = replyMatch[1];
                actualIsi     = replyMatch[2];
                var qColor = isMine ? 'rgba(255,255,255,0.15)' : '#f0f4ff';
                var qBorder= isMine ? 'rgba(255,255,255,0.4)'  : '#93c5fd';
                var qText  = isMine ? 'rgba(255,255,255,0.85)' : '#1e40af';
                quoteHtml = '<div style="background:' + qColor + ';border-left:3px solid ' + qBorder + ';border-radius:6px;padding:5px 8px;margin-bottom:6px;">' +
                    '<p style="font-size:11px;font-weight:700;color:' + qText + ';margin:0 0 2px;"> Membalas</p>' +
                    '<p style="font-size:11px;color:' + (isMine ? 'rgba(255,255,255,0.75)' : '#475569') + ';margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
                    escapeHtml(quoteText.substring(0, 80)) + (quoteText.length > 80 ? '...' : '') + '</p>' +
                    '</div>';
            }

            var bubbleStyle = isMine
                ? 'background:#2563eb;color:white;border-radius:18px 18px 4px 18px;'
                : 'background:white;color:#0f172a;border-radius:18px 18px 18px 4px;box-shadow:0 1px 2px rgba(0,0,0,0.08);';

            var msgId      = String(m.id);
            var encodedIsi = encodeURIComponent(actualIsi);

            // Tombol aksi: SEMUA user bisa balas, hapus hanya untuk pengirim
            var replyColor  = isMine ? 'rgba(255,255,255,0.6)' : '#94a3b8';
            var actionsHtml = '<div style="display:flex;gap:8px;margin-top:4px;justify-content:' + (isMine ? 'flex-end' : 'flex-start') + ';">' +
                '<button onclick="mulaiReplyEncoded(\'' + msgId + '\',\'' + encodedIsi + '\')" ' +
                'style="background:none;border:none;cursor:pointer;font-size:11px;color:' + replyColor + ';padding:0;">Balas</button>';
            if (isMine) {
                var encodedPreview = encodeURIComponent(actualIsi.substring(0, 60));
                actionsHtml += '<button onclick="bukaMsgHapusModal(\'' + msgId + '\',\'' + encodedPreview + '\')" ' +
                    'style="background:none;border:none;cursor:pointer;font-size:11px;color:rgba(255,255,255,0.5);padding:0;"> Hapus</button>';
            }
            actionsHtml += '</div>';

            var encodedQuote = replyMatch ? encodeURIComponent(replyMatch[1]) : '';
            var quoteDivOpen = replyMatch
                ? '<div onclick="scrollKeChat(\'' + encodedQuote + '\')" style="background:' +
                  (isMine ? 'rgba(255,255,255,0.15)' : '#f0f4ff') + ';border-left:3px solid ' +
                  (isMine ? 'rgba(255,255,255,0.4)' : '#93c5fd') + ';border-radius:6px;padding:5px 8px;margin-bottom:6px;cursor:pointer;transition:opacity 0.2s;" ' +
                  'onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">' +
                  '<p style="font-size:11px;font-weight:700;color:' + (isMine ? 'rgba(255,255,255,0.85)' : '#1e40af') + ';margin:0 0 2px;"> Membalas</p>' +
                  '<p style="font-size:11px;color:' + (isMine ? 'rgba(255,255,255,0.75)' : '#475569') + ';margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
                  escapeHtml(replyMatch[1].substring(0, 80)) + (replyMatch[1].length > 80 ? '...' : '') + '</p>' +
                  '</div>'
                : '';
            return '<div id="msg-' + msgId + '" data-isi="' + encodeURIComponent(actualIsi) + '" style="display:flex;justify-content:' + (isMine ? 'flex-end' : 'flex-start') + ';margin-bottom:2px;">' +
                '<div style="max-width:78%;' + bubbleStyle + 'padding:10px 14px;">' +
                quoteDivOpen +
                '<p style="font-size:14px;line-height:1.5;margin:0;white-space:pre-wrap;' + (actualIsi === '\uD83D\uDEAB Pesan telah dihapus' ? 'opacity:0.55;font-style:italic;' : '') + '">' + escapeHtml(actualIsi) + '</p>' +
                '<p style="font-size:10px;margin:4px 0 0;text-align:right;color:' + (isMine ? 'rgba(255,255,255,0.7)' : '#94a3b8') + ';">' + tgl + '</p>' +
                actionsHtml +
                '</div></div>';
        }).join('');

        // Hanya auto-scroll ke bawah jika:
        // 1. User sudah dekat bawah (threshold 120px), ATAU
        // 2. Ada pesan baru masuk, ATAU
        // 3. Pertama kali load (count sebelumnya 0)
        var isNearBottom = (msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight) < 120;
        var hasNewMsg    = msgs.length > _chatMsgCount;
        if (isNearBottom || hasNewMsg || _chatMsgCount === 0) {
            msgEl.scrollTop = msgEl.scrollHeight;
        }
        _chatMsgCount = msgs.length;

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


// 
// REPLY & HAPUS CHAT
// 
var _replyToId   = null;  // ID pesan yang sedang di-reply
var _replyToText = '';    // teks pesan yang di-reply

function mulaiReply(msgId, teks) {
    _replyToId   = msgId;
    _replyToText = teks;
    var bar  = document.getElementById('replyPreviewBar');
    var prev = document.getElementById('replyPreviewText');
    if (bar)  bar.style.display  = 'block';
    if (prev) prev.textContent   = teks.length > 60 ? teks.substring(0, 60) + '...' : teks;
    var input = document.getElementById('chatInput');
    if (input) input.focus();
}

// Versi aman untuk onclick (teks di-encode dulu)
function mulaiReplyEncoded(msgId, encoded) {
    try {
        var teks = decodeURIComponent(encoded);
        mulaiReply(msgId, teks);
    } catch(e) {
        mulaiReply(msgId, encoded);
    }
}

function batalReply() {
    _replyToId   = null;
    _replyToText = '';
    var bar = document.getElementById('replyPreviewBar');
    if (bar) bar.style.display = 'none';
}



// Scroll ke pesan yang di-quote (cari bubble berdasarkan isi pesan)
function scrollKeChat(encodedIsi) {
    try {
        var targetIsi = decodeURIComponent(encodedIsi);
        var msgEl = document.getElementById('chatMessages');
        if (!msgEl) return;

        // Cari semua bubble berdasarkan data-isi
        var bubbles = msgEl.querySelectorAll('[data-isi]');
        var target  = null;
        bubbles.forEach(function(b) {
            try {
                if (decodeURIComponent(b.getAttribute('data-isi')) === targetIsi) {
                    target = b;
                }
            } catch(e) {}
        });

        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight sebentar
            var inner = target.querySelector('div');
            if (inner) {
                var origBg = inner.style.background;
                inner.style.transition = 'background 0.3s';
                inner.style.background = '#fef9c3';
                setTimeout(function() { inner.style.background = origBg; }, 1200);
            }
        }
    } catch(e) {}
}


var _hapusMsgId   = null;
var _hapusMsgSelf = false;

function bukaMsgHapusModal(msgId, encodedPreview) {
    _hapusMsgId = msgId;
    var modal   = document.getElementById('hapusMsgModal');
    var preview = document.getElementById('hapusMsgPreview');
    if (preview) {
        try { preview.textContent = '"' + decodeURIComponent(encodedPreview) + '"'; }
        catch(e) { preview.textContent = '"Pesan..."'; }
    }
    if (modal) modal.style.display = 'flex';
}

function tutupHapusMsgModal() {
    var modal = document.getElementById('hapusMsgModal');
    if (modal) modal.style.display = 'none';
    _hapusMsgId = null;
}

async function konfirmasiHapusPesan(mode) {
    var msgId = _hapusMsgId;
    tutupHapusMsgModal();
    if (!msgId || !activeUser) return;

    try {
        if (mode === 'semua') {
            // Hapus dari database = hilang untuk semua orang
            var { error } = await _supabase
                .from('messages')
                .update({ isi: ' Pesan telah dihapus' })
                .eq('id', msgId)
                .eq('sender_id', activeUser.id);
            if (error) throw error;
            showToast('Pesan dihapus untuk semua orang');
        } else {
            // Hapus untuk diri sendiri: ganti isi dengan tanda pesan dihapus
            var { error } = await _supabase
                .from('messages')
                .update({ isi: ' Pesan telah dihapus' })
                .eq('id', msgId)
                .eq('sender_id', activeUser.id);
            if (error) throw error;
            showToast('Pesan dihapus untuk kamu');
        }
        _chatMsgCount = Math.max(0, _chatMsgCount - 1);
        await loadChatMessages();
    } catch(err) {
        alert('Gagal hapus: ' + err.message);
    }
}


async function hapusSemuaChat() {
    if (!activeUser || !chatPartnerId) return;
    if (!confirm('Hapus semua pesan dengan pengguna ini? Tindakan ini tidak bisa dibatalkan.')) return;

    try {
        // Hapus pesan yang dikirim user ini
        var r1 = await _supabase.from('messages')
            .delete()
            .eq('sender_id', activeUser.id)
            .eq('receiver_id', chatPartnerId);

        // Hapus pesan yang diterima user ini
        var r2 = await _supabase.from('messages')
            .delete()
            .eq('sender_id', chatPartnerId)
            .eq('receiver_id', activeUser.id);

        if (r1.error) throw r1.error;
        if (r2.error) throw r2.error;

        _chatMsgCount = 0;
        await loadChatMessages();
        await loadChatList();
        showToast('Semua pesan dihapus');
    } catch(err) {
        alert('Gagal hapus: ' + err.message);
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

        kirimPushNotif(chatPartnerId, 'Pesan baru dari seseorang', isi.substring(0, 80), 'chatPage');
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
    teardownChatRealtime();
}

// Stop auto-refresh saat keluar dari halaman chat
var _origShowPage = showPage;




// 
// NOTIFIKASI BROWSER
// 
var _notifGranted    = false;
var _lastMsgId       = null;   // ID pesan terakhir yang sudah dilihat
var _lastOrderCount  = null;   // Jumlah pesanan terakhir
var _globalInterval  = null;   // Interval polling global

// Minta izin notifikasi browser
async function mintaIzinNotifikasi() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        _notifGranted = true;
        return;
    }
    if (Notification.permission !== 'denied') {
        var perm = await Notification.requestPermission();
        _notifGranted = (perm === 'granted');
        if (_notifGranted) console.log('Izin notifikasi diterima ');
    }
}

// Tampilkan notifikasi browser
function tampilNotifikasi(judul, isi, url) {
    if (!_notifGranted) return;
    var n = new Notification(judul, {
        body: isi,
        icon: 'https://ui-avatars.com/api/?name=W&background=2563eb&color=fff&bold=true&size=64',
        badge: 'https://ui-avatars.com/api/?name=W&background=2563eb&color=fff&bold=true&size=32',
        tag: judul // cegah duplikat notifikasi yang sama
    });
    n.onclick = function() {
        window.focus();
        if (url) showPage(url);
        n.close();
    };
    setTimeout(function() { n.close(); }, 6000);
}

// Cek pesan chat baru (untuk semua user yang login)
async function cekPesanBaru() {
    if (!activeUser) return;
    try {
        var r = await _supabase
            .from('messages')
            .select('id, sender_id, isi, created_at')
            .eq('receiver_id', activeUser.id)
            .eq('dibaca', false)
            .order('created_at', { ascending: false })
            .limit(1);

        if (r.error || !r.data || r.data.length === 0) return;

        var latest = r.data[0];

        // Jangan notif jika sudah pernah notif pesan ini
        if (_lastMsgId === latest.id) return;
        _lastMsgId = latest.id;

        // Jangan notif jika user sedang di halaman chat dengan pengirim ini
        var sedangBukaChat = (
            document.getElementById('chatPage') &&
            document.getElementById('chatPage').style.display !== 'none' &&
            chatPartnerId === latest.sender_id
        );
        if (sedangBukaChat) return;

        // Ambil nama pengirim
        var rp = await _supabase.from('profiles').select('username').eq('id', latest.sender_id).maybeSingle();
        var nama = (rp.data && rp.data.username) ? '@' + rp.data.username : 'Seseorang';

        tampilNotifikasi('Pesan Baru dari ' + nama, latest.isi.substring(0, 80), 'chatPage');
        showToast('Pesan baru dari ' + nama);

        // Update badge chat (desktop + mobile)
        updateChatBadge();

    } catch(e) { console.error('cekPesanBaru:', e); }
}

// Cek pesanan masuk baru (khusus mitra/penjasa)
async function cekPesananBaru() {
    if (!activeUser) return; // semua user bisa terima notifikasi pesanan
    try {
        // Ambil jasa milik mitra
        var rj = await _supabase.from('jasa').select('id').eq('user_id', activeUser.id);
        if (!rj.data || rj.data.length === 0) return;
        var ids = rj.data.map(function(j){ return j.id; });

        // Hitung pesanan pending
        var ro = await _supabase
            .from('orders')
            .select('id, jasa_nama, created_at', { count: 'exact' })
            .in('jasa_id', ids)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);

        if (ro.error) return;
        var count = ro.count || 0;

        // Pertama kali load, simpan saja tanpa notif
        if (_lastOrderCount === null) {
            _lastOrderCount = count;
            return;
        }

        // Ada pesanan baru masuk
        if (count > _lastOrderCount && ro.data && ro.data.length > 0) {
            var latest = ro.data[0];
            var jasaNama = latest.jasa_nama || 'jasa kamu';
            tampilNotifikasi('Pesanan Baru Masuk!', 'Ada yang memesan ' + jasaNama + '. Cek dashboard sekarang!', 'dashboard');
            showToast('Pesanan baru masuk untuk ' + jasaNama + '!');
        }
        _lastOrderCount = count;

    } catch(e) { console.error('cekPesananBaru:', e); }
}

// Jalankan polling global (setiap 10 detik)

// Update badge notif chat di navbar (berjalan di background)
async function updateChatBadge() {
    if (!activeUser) return;
    try {
        var r = await _supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('receiver_id', activeUser.id)
            .eq('dibaca', false);

        var count = r.count || 0;

        // Badge desktop
        var badge = document.getElementById('chatUnreadBadge');
        if (badge) {
            badge.classList.toggle('hidden', count === 0);
            badge.textContent = count > 0 ? (count > 9 ? '9+' : count) : '!';
        }
        // Badge mobile
        var badgeM = document.getElementById('chatUnreadBadgeMobile');
        if (badgeM) {
            badgeM.classList.toggle('hidden', count === 0);
            badgeM.textContent = count > 0 ? (count > 9 ? '9+' : count) : '!';
        }
    } catch(e) { /* non-fatal */ }
}

function mulaiPollingNotifikasi() {
    // Realtime channel untuk pesan baru (instan, tanpa polling)
    setupGlobalRealtime();

    // Polling ringan hanya untuk notif PESANAN (tidak ada realtime) — interval lebih jarang
    if (_globalInterval) clearInterval(_globalInterval);
    _globalInterval = setInterval(async function() {
        if (!activeUser) return;
        await cekPesananBaru();
        // Badge juga di-refresh berkala sebagai fallback jika realtime putus
        await updateChatBadge();
    }, 15000); // 15 detik, hanya untuk pesanan
}

// Stop polling & realtime saat logout
function stopPollingNotifikasi() {
    if (_globalInterval) clearInterval(_globalInterval);
    _globalInterval = null;
    _lastMsgId      = null;
    _lastOrderCount = null;
    teardownAllRealtime();
}

document.addEventListener("DOMContentLoaded", () => {
    updateAuthUI();
    initDragAndDrop();
    fetchJasa();
    renderOrders();
    loadHeroStats();
    requestUserLocation();
    mintaIzinNotifikasi();
    mulaiPollingNotifikasi();
    if (activeUser) {
        updateChatBadge();
}
});

// --- NAVIGATION ---

//  HITUNG JARAK GPS (Haversine formula) 
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
    //  SYNC USER SETIAP PINDAH HALAMAN
    activeUser = JSON.parse(localStorage.getItem("activeUser"));

    const isGuest = !activeUser;
    
    if ((id === 'dashboard') && isGuest) {
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
        loadStatusToko();
        fetchMyJasa();          // load stats: jasa aktif, rating, total pesanan
        showDashTab('pesanan'); // default ke tab pesanan
    }
    
    if (id === 'marketplace') {
        if (typeof renderJasa === 'function') renderJasa(allJasa);
        requestUserLocation();
    }

    if (id === 'chatPage') {
        loadChatList();
        if (chatPartnerId) {
            setupChatRealtime(); // realtime, bukan polling
        }
    }   


    if (id === 'contactPage') {
        loadUlasan();
    }

    // 4. Reset Posisi Scroll & Tutup Mobile Menu (Jika sedang terbuka)
    window.scrollTo(0, 0);
    const mobileMenu = document.getElementById("mobileMenu");
    if (mobileMenu) mobileMenu.classList.add("hidden");
}

function closeMobileMenu() {
    const menu = document.getElementById("mobileMenu");
    if (menu) menu.classList.add("hidden");
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
        extra.innerHTML = `<button onclick="showPage('loginPage')" class="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">Masuk / Daftar</button>`;
    }
}


//  Toggle lihat/sembunyikan password 
function togglePassword(inputId, svgId) {
    var input = document.getElementById(inputId);
    var svg   = document.getElementById(svgId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        // Ganti icon jadi "mata coret" (hidden)
        if (svg) svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>';
    } else {
        input.type = 'password';
        // Kembalikan icon mata normal
        if (svg) svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>';
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
        // Ambil user berdasarkan email dulu
        const { data, error } = await _supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (error || !data) {
            return alert("Email atau password salah!");
        }

        // Verifikasi password:
        // Cek dulu apakah password di DB sudah berupa hash bcrypt atau masih plain text
        var storedPass = data.password || '';
        var isBcryptHash = storedPass.startsWith('$2a$') || storedPass.startsWith('$2b$') || storedPass.startsWith('$2y$');
        var passOk = false;

        if (isBcryptHash && bcrypt) {
            // Password sudah di-hash → pakai bcrypt.compare
            try {
                passOk = await bcrypt.compare(pass, storedPass);
            } catch(e) {
                console.error('bcrypt.compare error:', e);
                passOk = false;
            }
        } else {
            // Password masih plain text (akun lama) → bandingkan langsung
            passOk = (pass === storedPass);
        }

        if (!passOk) {
            return alert("Email atau password salah!");
        }

        // Upgrade otomatis: jika password masih plain text → hash sekarang
        if (!isBcryptHash && bcrypt) {
            try {
                var newHash = await bcrypt.hash(pass, 10);
                await _supabase.from('users').update({ password: newHash }).eq('id', data.id);
                console.log('Password di-upgrade ke bcrypt hash ');
            } catch(e) {
                console.warn('Gagal upgrade hash (non-fatal):', e);
            }
        }

        //  simpan session
        localStorage.setItem("activeUser", JSON.stringify(data));
        activeUser = data;
        simpanAkunKeList(data);
        updateAuthUI();
        _lastOrderCount = null;
        mintaIzinNotifikasi();
        mulaiPollingNotifikasi();
        alert("Login berhasil!");
        showPage('marketplace');
    } catch (err) {
        console.error(err);
        alert("Gagal login: " + err.message);
    }
}

// 
// GOOGLE LOGIN
// 
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
            simpanAkunKeList(user);
            updateAuthUI();
            mulaiPollingNotifikasi();
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

        showPage('marketplace');
        alert('Akun berhasil dibuat. Selamat datang, ' + name + '! Kamu bisa beralih peran kapan saja dari Dashboard.');

    } catch(err) {
        console.error('Gagal daftar Google:', err);
        alert('Gagal membuat akun: ' + err.message);
    }
}

// --- 2. FUNGSI REGISTER (Di Bawah Login) ---
async function handleRegister() {
    const emailEl = document.getElementById("regEmail");
    const passEl = document.getElementById("regPass");

    const email = emailEl.value.trim().replace(/"/g, '').replace(/\s/g, '');
    const pass = passEl.value.trim();
    const role = 'pelanggan'; // semua akun baru mulai sebagai pelanggan, bisa beralih di dashboard

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
        //  cek email sudah ada
        const { data: existing } = await _supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existing) {
            return alert("Email sudah terdaftar!");
        }

        //  Hash password sebelum disimpan (bcrypt, salt 10)
        if (!bcrypt) throw new Error('Library bcrypt belum siap, coba refresh halaman.');
        const hashedPass = await bcrypt.hash(pass, 10);

        //  insert user + ambil data user baru
        const { data: newUser, error: userError } = await _supabase
            .from('users')
            .insert([{
                email: email,
                password: hashedPass,
                role: role
            }])
            .select()
            .single();

        if (userError) throw userError;

        //  WAJIB: insert ke profiles
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
    stopPollingNotifikasi();
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

        if (navPenjasa) {
            navPenjasa.innerHTML = `<button onclick="showPage('dashboard')" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition">Dashboard</button>`;
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

//  PERBARUI LOKASI SEMUA JASA MILIK MITRA 
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

        alert(" Lokasi " + myJasa.length + " jasa berhasil diperbarui!\n\nKoordinat: " + lat.toFixed(5) + ", " + lon.toFixed(5));

    } catch(err) {
        console.error("Gagal perbarui lokasi:", err);
        alert("Gagal: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg> Perbarui Lokasi Semua Jasa';
        }
    }
}

// Lock untuk mencegah submit ganda
var _isSubmittingJasa = false;

async function tambahJasa() {
    if (!activeUser) return alert("Silakan Login terlebih dahulu.");

    //  ANTI SPAM: tolak jika sedang submit 
    if (_isSubmittingJasa) {
        return; // diam saja, jangan alert supaya tidak mengganggu
    }

    const nama = document.getElementById("pName").value.trim();
    const kategori = document.getElementById("pCategory").value;
    const harga = document.getElementById("pPrice").value;
    const wa = document.getElementById("pWA").value.trim();
    const lokasi = document.getElementById("pLoc").value.trim();
    const deskripsi = document.getElementById("pDesc").value.trim();

    if (!nama || !kategori || !harga || !wa) {
        return alert("Mohon lengkapi data utama!");
    }

    // Kunci tombol dan set flag
    _isSubmittingJasa = true;
    var btn = document.getElementById('btnTambahJasa');
    var btnOrigText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

    try {
        //  VALIDASI USER ADA DI DATABASE
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
        console.error('ERROR TAMBAH JASA:', err);
        alert('Gagal menyimpan jasa: ' + err.message);
    } finally {
        //  Selalu lepas lock setelah selesai (berhasil atau gagal) 
        _isSubmittingJasa = false;
        if (btn) { btn.disabled = false; btn.textContent = btnOrigText || 'Pasang Jasa Sekarang'; }
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

        // Update badge jumlah jasa di hero secara real-time
        var heroCount = document.getElementById('heroJasaCount');
        if (heroCount) heroCount.textContent = allJasa.length + '+';

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
                                 ${formatJarak(hitungJarak(userLatitude, userLongitude, j.latitude, j.longitude))}
                               </span>`
                            : ''}
                        ${activeUser ? `<button onclick="toggleWishlist(${j.id}, event)"
                            id="wishBtn-${j.id}"
                            class="absolute top-2 left-2 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow hover:scale-110 transition text-lg"
                            style="color:${myWishlistIds.has(j.id) ? '#ef4444' : '#94a3b8'};">
                            ${myWishlistIds.has(j.id) ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'}
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
                    ${j.lokasi ? `<p class="text-xs text-slate-400 mt-1"> ${j.lokasi}</p>` : ''}
                    <button onclick='openDetail(${JSON.stringify(j).replace(/"/g, "&quot;")})' 
                        class="w-full mt-3 bg-slate-50 py-2 rounded-xl font-bold text-slate-600 hover:bg-blue-600 hover:text-white transition">Lihat Detail
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
                        <button onclick='persiapanEdit(${JSON.stringify(j).replace(/"/g, '&quot;')})' class="text-orange-500"></button>
                        <button onclick="hapusJasa(${j.id})" class="text-red-500"></button>
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

    //  Load profil penjasa 
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
        if (avgRating) metaHTML += '<span class="text-[10px] font-bold text-yellow-500"> ' + avgRating + '</span>';
        if (lokasi)    metaHTML += '<span class="text-[10px] text-slate-400"> ' + lokasi + '</span>';
        if (metaEl) metaEl.innerHTML = metaHTML;

        // Tombol aksi
        if (btnProfil) btnProfil.onclick = function() { closeModal(); bukaProfilPublik(ownerId); };
        // Selalu tampilkan Chat jika bukan pemilik
        if (btnChat && activeUser && activeUser.id !== ownerId) {
            btnChat.onclick = function() { closeModal(); bukaChat(ownerId, username); };
            btnChat.style.display = "";
        } else if (btnChat) {
            btnChat.style.display = "none";
        }

        // Tambah / update tombol WA jika penjasa punya nomor WA
        var waNum = (profile.wa_number || '').replace(/\D/g, '');
        var btnWaExist = document.getElementById('modalBtnPenjasaWA');
        if (waNum && activeUser && activeUser.id !== ownerId) {
            if (!btnWaExist) {
                btnWaExist = document.createElement('a');
                btnWaExist.id = 'modalBtnPenjasaWA';
                btnWaExist.target = '_blank';
                btnWaExist.className = 'flex-1 text-xs font-bold text-white bg-[#25D366] hover:bg-[#1ebe5d] px-3 py-2 rounded-xl transition flex items-center justify-center gap-1';
                btnWaExist.innerHTML = '<svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.528 5.855L.057 23.985l6.305-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.012-1.371l-.36-.213-3.733.979.997-3.645-.234-.374A9.818 9.818 0 0112 2.182c5.42 0 9.818 4.398 9.818 9.818 0 5.421-4.398 9.818-9.818 9.818z"/></svg> WhatsApp';
                // Sisipkan setelah btnChat
                if (btnChat && btnChat.parentElement) {
                    btnChat.insertAdjacentElement('afterend', btnWaExist);
                }
            }
            btnWaExist.href = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent('Halo, saya tertarik dengan jasa Anda di WargaBantuWarga. Boleh tanya-tanya?');
            btnWaExist.style.display = '';
        } else if (btnWaExist) {
            btnWaExist.style.display = 'none';
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

        //  1. PASTIKAN PROFILE ADA
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

        //  2. BARU INSERT KOMENTAR (atau BALASAN jika reply mode aktif)
        var insertData = {
            jasa_id:      currentJasaId,
            user_id:      activeUser.id,
            isi_komentar: input.value.trim()
        };
        if (_replyParentId) {
            insertData.parent_id = parseInt(_replyParentId);
            insertData.is_reply  = true;
        }
        const { error } = await _supabase.from('komentar').insert([insertData]);

        if (error) throw error;

        batalBalasKomentar(); // reset reply bar
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

        // Query komentar tanpa FK join (lebih aman)
        const { data: listKomentar, error } = await _supabase
            .from('komentar')
            .select('id, jasa_id, user_id, isi_komentar, parent_id, is_reply, created_at')
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
            .select('id, jasa_id, user_id, isi_komentar, parent_id, is_reply, created_at')
            .in('parent_id', parentIds)
            .order('created_at', { ascending: true });
        var repliesMap = {};
        (rReplies.data || []).forEach(function(r) {
            if (!repliesMap[r.parent_id]) repliesMap[r.parent_id] = [];
            repliesMap[r.parent_id].push(r);
        });

        // Fetch semua profil yang terlibat (komentar + balasan)
        var allComments = listKomentar.concat(rReplies.data || []);
        var allUserIds  = [...new Set(allComments.map(function(c){ return c.user_id; }).filter(Boolean))];
        var profileMap  = {};
        if (allUserIds.length > 0) {
            var rProf = await _supabase.from('profiles').select('id, username, avatar_url').in('id', allUserIds);
            (rProf.data || []).forEach(function(p){ profileMap[p.id] = p; });
        }

        function renderAvatarHtml(avatarUrl, displayName) {
            return avatarUrl
                ? '<img src="' + avatarUrl + '" class="w-6 h-6 rounded-full object-cover border border-blue-100">'
                : '<div class="w-6 h-6 bg-blue-50 rounded-full flex items-center justify-center"><span class="text-[8px] font-bold text-blue-500">' + displayName.charAt(0).toUpperCase() + '</span></div>';
        }

        function renderOneComment(c, isReply) {
            var prof = profileMap[c.user_id] || {};
            var displayName = prof.username || 'Anonymous';
            var avatarUrl   = prof.avatar_url || null;
            var commentDate = new Date(c.created_at);
            var isToday     = new Date().toDateString() === commentDate.toDateString();
            var timeDisplay = commentDate.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
            var dateDisplay = isToday ? 'Hari ini' : commentDate.toLocaleDateString('id-ID', { day:'numeric', month:'short' });
            var avatarHtml  = renderAvatarHtml(avatarUrl, displayName);
            var isOwner     = activeUser && currentJasaData && activeUser.id === currentJasaData.user_id;
            var canReply    = activeUser && !isReply && isOwner;
            var uid = String(c.user_id);
            var cid = String(c.id);

            var html = '<div data-user-id="' + uid + '" class="' + (isReply ? 'ml-8 mt-2 bg-blue-50 border-blue-100' : 'bg-white border-slate-100 mb-2') + ' p-3 rounded-xl border shadow-sm group">';
            html += '<div class="flex justify-between items-start mb-1">';
            html += '<button onclick="bukaProfilPublik(\'' + uid + '\')" class="flex items-center gap-1.5 hover:opacity-75 transition text-left">';
            html += avatarHtml;
            html += '<p class="text-[10px] font-bold text-blue-600 hover:underline">@' + displayName + '</p>';
            if (isOwner && !isReply) html += '<span class="text-[8px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold ml-1">Reviewer</span>';
            html += '</button><div class="flex items-center gap-1.5">';
            html += '<p class="text-[8px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">' + dateDisplay + ', ' + timeDisplay + '</p>';
            if (activeUser && activeUser.id === c.user_id) {
                html += '<button onclick="hapusKomentar(\'' + cid + '\')" class="opacity-0 group-hover:opacity-100 transition w-5 h-5 flex items-center justify-center rounded-full bg-red-50 hover:bg-red-100 text-red-400 text-[10px] font-bold"></button>';
            }
            html += '</div></div>';
            html += '<p class="text-sm text-slate-700 leading-relaxed pl-7">' + c.isi_komentar + '</p>';
            if (canReply) {
                var encodedName = encodeURIComponent(displayName);
                html += '<button onclick="siapkanBalasKomentar(\'' + cid + '\',\'' + encodedName + '\')" class="ml-7 mt-2 text-[10px] font-bold text-blue-500 hover:text-blue-700 transition">Balas</button>';
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

var currentJasaData   = null;
var _replyParentId    = null; // ID komentar yang sedang dibalas
var _replyParentName  = '';   // Nama reviewer yang dibalas

function siapkanBalasKomentar(komentarId, encodedName) {
    _replyParentId   = komentarId;
    _replyParentName = decodeURIComponent(encodedName);
    // Set placeholder input utama & fokus
    var input       = document.getElementById('commentText');
    var replyBar    = document.getElementById('commentReplyBar');
    var replyLabel  = document.getElementById('commentReplyLabel');
    if (input) {
        input.placeholder = 'Balas @' + _replyParentName + '...';
        input.focus();
    }
    if (replyBar)   replyBar.style.display  = 'flex';
    if (replyLabel) replyLabel.textContent  = 'Membalas @' + _replyParentName;
    // Scroll ke input
    var area = document.getElementById('commentInputArea');
    if (area) area.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function batalBalasKomentar() {
    _replyParentId   = null;
    _replyParentName = '';
    var input      = document.getElementById('commentText');
    var replyBar   = document.getElementById('commentReplyBar');
    if (input)    { input.placeholder = 'Tulis komentar...'; }
    if (replyBar)   replyBar.style.display = 'none';
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
    const pubAvatarEl = document.getElementById('pubAvatar');
    pubAvatarEl.src = 'https://ui-avatars.com/api/?name=U&background=dbeafe&color=2563eb&bold=true&size=128';

    try {
        // ── Query 1: Profil dasar (TANPA current_role agar tidak gagal jika kolom belum ada) ──
        const [{ data: profile, error: profErr }, { data: userData }] = await Promise.all([
            _supabase.from('profiles').select('username, bio, avatar_url, lokasi_usaha, wa_number').eq('id', userId).maybeSingle(),
            _supabase.from('users').select('role, created_at, email').eq('id', userId).maybeSingle()
        ]);

        const username = profile?.username || userData?.email?.split('@')[0] || 'Pengguna';

        // ── Set avatar SECEPATNYA — tidak menunggu query lain ──
        const avatarSrc = profile?.avatar_url
            || `https://ui-avatars.com/api/?name=${encodeURIComponent(username.charAt(0))}&background=dbeafe&color=2563eb&bold=true&size=128`;
        pubAvatarEl.src = avatarSrc;
        // Fallback kalau gambar gagal load
        pubAvatarEl.onerror = function() {
            this.onerror = null;
            this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(username.charAt(0))}&background=dbeafe&color=2563eb&bold=true&size=128`;
        };

        // ── Query 2: current_role dihapus — tidak ada perbedaan role di profil publik ──

        // ── Username (tidak ada badge role) ──
        document.getElementById('pubUsername').textContent = '@' + username;

        // ── Bio ──
        const bioEl = document.getElementById('pubBio');
        bioEl.textContent = profile?.bio || 'Pengguna WargaBantuWarga.';

        // ── Meta info ──
        const metaEl = document.getElementById('pubMeta');
        const joinDate = userData?.created_at
            ? new Date(userData.created_at).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
            : null;
        metaEl.innerHTML = [
            profile?.lokasi_usaha ? `<span>📍 ${profile.lokasi_usaha}</span>` : '',
            joinDate              ? `<span>📅 Bergabung ${joinDate}</span>`   : '',
        ].filter(Boolean).join('');

        // ── Tombol kontak (Chat + WA jika punya nomor) ──
        var contactBtns = '';
        if (activeUser && activeUser.id !== userId) {
            var pName = profile?.username || 'User';
            contactBtns += `<button onclick="bukaChat('${userId}', '${pName}')"
                class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                Kirim Pesan</button>`;
        }
        if (profile?.wa_number) {
            contactBtns += `<a href="https://wa.me/${profile.wa_number.replace(/\D/g,'')}" target="_blank"
                class="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition">
                <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.523 5.845L.057 23.492a.5.5 0 00.623.605l5.806-1.525A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.668-.523-5.186-1.433l-.372-.22-3.844 1.009 1.028-3.75-.242-.386A9.955 9.955 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                Hubungi via WA</a>`;
        }
        document.getElementById('pubContactBtn').innerHTML = `<div class="flex gap-2 flex-wrap">${contactBtns}</div>`;

        // Badge level dihapus — tidak digunakan lagi

        // Jasa milik user ini — tampilkan untuk SEMUA akun (dual role)
        {
            const { data: jasaList } = await _supabase
                .from('jasa')
                .select('*')
                .eq('user_id', userId)
                .order('id', { ascending: false });

            const jasaSection = document.getElementById('pubJasaSection');
            const jasaListEl  = document.getElementById('pubJasaList');
            const jasaTitle   = document.getElementById('pubJasaTitle');

            if (jasaList && jasaList.length > 0) {
                jasaSection.classList.remove('hidden');
                // Update judul section dengan jumlah jasa
                if (jasaTitle) jasaTitle.textContent = 'Jasa yang Ditawarkan (' + jasaList.length + ')';
                jasaListEl.innerHTML = jasaList.map(function(j) {
                    var isOpen   = j.is_open !== false;
                    var statusBadge = isOpen
                        ? '<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">● Buka</span>'
                        : '<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">○ Tutup</span>';
                    return '<div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md hover:border-blue-200 transition cursor-pointer group"' +
                        ' onclick=\'openDetail(' + JSON.stringify(j).replace(/'/g, "&#39;") + ')\'>' +
                        '<div class="relative">' +
                            '<img src="' + (j.img || 'https://placehold.co/300x150?text=Jasa') + '"' +
                                 ' class="w-full h-36 object-cover group-hover:brightness-95 transition"' +
                                 ' onerror="this.src=\'https://placehold.co/300x150?text=Jasa\'">' +
                            '<div class="absolute top-2 right-2">' + statusBadge + '</div>' +
                        '</div>' +
                        '<div class="p-4">' +
                            '<p class="font-bold text-slate-800 text-sm mb-1 truncate">' + (j.nama || 'Jasa') + '</p>' +
                            '<p class="text-blue-600 font-black text-sm">Rp ' + Number(j.harga || 0).toLocaleString('id-ID') + '</p>' +
                            (j.lokasi ? '<p class="text-xs text-slate-400 mt-1 truncate">📍 ' + j.lokasi + '</p>' : '') +
                        '</div>' +
                    '</div>';
                }).join('');
            } else {
                // Sembunyikan section jika tidak ada jasa sama sekali
                jasaSection.classList.add('hidden');
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
        //  1. Coba cari di local (allJasa dulu)
        const localData = allJasa.find(j => j.id == id);
        if (localData) return localData;

        //  2. Kalau tidak ada, baru ke Supabase
        const { data, error } = await _supabase
            .from('jasa')
            .select('*')
            .eq('id', id)
            .maybeSingle(); //  GANTI INI

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

// 
// STATISTIK & FILTER PESANAN PELANGGAN
// 
var _allOrders     = [];   // semua pesanan, disimpan agar bisa filter tanpa re-fetch
var _activePeriod  = 'semua';

function hitungStatPesanan(orders) {
    var now    = new Date();
    var y = now.getFullYear(), m = now.getMonth(), d = now.getDate();

    // Batas waktu
    var startHari  = new Date(y, m, d, 0, 0, 0);
    var startMinggu = new Date(startHari);
    startMinggu.setDate(d - now.getDay()); // Minggu = awal minggu
    var startBulan = new Date(y, m, 1);

    var statH = 0, statM = 0, statB = 0;
    orders.forEach(function(o) {
        var t = new Date(o.created_at);
        if (t >= startHari)   statH++;
        if (t >= startMinggu) statM++;
        if (t >= startBulan)  statB++;
    });

    var el = function(id) { return document.getElementById(id); };
    if (el('statHari'))   el('statHari').textContent   = statH;
    if (el('statMinggu')) el('statMinggu').textContent = statM;
    if (el('statBulan'))  el('statBulan').textContent  = statB;

    // Tampilkan box stats
    var box = el('orderStatsBox');
    if (box) box.classList.remove('hidden');
}


var _activeStatusFilter = 'semua';
var _activePeriodOrders = [];

function filterOrdersByStatus(status) {
    _activeStatusFilter = status;
    // Update tombol
    ['semua','selesai','pending','diterima','ditolak'].forEach(function(k) {
        var btn = document.getElementById('fs' + k.charAt(0).toUpperCase() + k.slice(1));
        if (!btn) return;
        if (k === status) {
            btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-white transition';
        } else {
            var colorMap = {selesai:'text-green-600 border-green-200 hover:bg-green-50', pending:'text-yellow-600 border-yellow-200 hover:bg-yellow-50', diterima:'text-blue-600 border-blue-200 hover:bg-blue-50', ditolak:'text-red-500 border-red-200 hover:bg-red-50'};
            btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-white border transition ' + (colorMap[k] || 'text-slate-600 border-slate-200');
        }
    });
    // Filter dari data periode aktif
    var base = _activePeriod === 'semua' ? _allOrders : (_activePeriodOrders.length ? _activePeriodOrders : _allOrders);
    var filtered = status === 'semua' ? base : base.filter(function(o){ return o.status === status; });
    renderOrderList(filtered);
}

function filterOrdersByPeriod(period) {
    _activePeriod = period;

    // Update tombol aktif
    var buttons = { semua:'filterSemua', hari:'filterHari', minggu:'filterMinggu', bulan:'filterBulan' };
    Object.keys(buttons).forEach(function(k) {
        var btn = document.getElementById(buttons[k]);
        if (!btn) return;
        if (k === period) {
            btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-white transition';
        } else {
            btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition';
        }
    });

    // Filter data
    var now   = new Date();
    var y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    var filtered = _allOrders;

    if (period === 'hari') {
        var start = new Date(y, m, d, 0, 0, 0);
        filtered  = _allOrders.filter(function(o){ return new Date(o.created_at) >= start; });
    } else if (period === 'minggu') {
        var start = new Date(y, m, d, 0, 0, 0);
        start.setDate(d - now.getDay());
        filtered  = _allOrders.filter(function(o){ return new Date(o.created_at) >= start; });
    } else if (period === 'bulan') {
        var start = new Date(y, m, 1);
        filtered  = _allOrders.filter(function(o){ return new Date(o.created_at) >= start; });
    }

    _activePeriodOrders = filtered;
    if (_activeStatusFilter && _activeStatusFilter !== 'semua') {
        filtered = filtered.filter(function(o){ return o.status === _activeStatusFilter; });
    }
    renderOrderList(filtered);
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
        _allOrders    = currentOrders;  // simpan untuk filter

        // Hitung & tampilkan statistik
        hitungStatPesanan(_allOrders);

        if (currentOrders.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10">
                    <p class="text-slate-400 italic">Belum ada riwayat pesanan.</p>
                </div>
            `;
            return;
        }

        renderOrderList(currentOrders);
    } catch (err) {
        console.error("renderOrders error:", err);
        container.innerHTML = `<p class="text-red-400 italic text-center">Gagal memuat pesanan.</p>`;
    }
}

function renderOrderList(orders) {
    var container = document.getElementById('orderList');
    if (!container) return;

    if (!orders || orders.length === 0) {
        container.innerHTML = '<div class="text-center py-10"><p class="text-slate-400 italic">Tidak ada pesanan di periode ini.</p></div>';
        return;
    }

        container.innerHTML = orders.map((order, index) => {
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
                                ${order.status === 'pending' ? 'Menunggu' : order.status === 'diterima' ? 'Diterima' : order.status === 'selesai' ? 'Selesai' : order.status === 'ditolak' ? 'Ditolak' : order.status || 'Pending'}
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
                                        data-order="${order.id}" data-val="${n}"></button>
                            `).join('')}
                            <span id="orderRatingLabel-${order.id}" class="text-xs text-slate-400 ml-2 italic"></span>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Load existing ratings untuk tiap order
        loadExistingOrderRatings(orders);
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
        // Jasa Aktif = yang is_open !== false (buka)
        var jasaAktifCount = safeJasa.filter(function(j){ return j.is_open !== false; }).length;
        if (elActive) elActive.innerText = jasaAktifCount;
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
        btnTambah.textContent = 'Simpan Perubahan';
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

// 
// KOMPRES GAMBAR OTOMATIS SEBELUM SIMPAN
// Mengurangi ukuran file besar menjadi lebih kecil
// 
function kompresGambar(file, maxW, maxH, quality) {
    maxW = maxW || 1200;
    maxH = maxH || 1200;
    quality = quality || 0.75;
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function(e) {
            var img = new Image();
            img.onerror = reject;
            img.onload = function() {
                var w = img.width, h = img.height;
                // Hitung dimensi baru proporsional
                if (w > maxW || h > maxH) {
                    var ratio = Math.min(maxW / w, maxH / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                var canvas = document.createElement('canvas');
                canvas.width  = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function initDragAndDrop() {
    var zone  = document.getElementById("drop-zone");
    var input = document.getElementById("file-input");
    if (!zone) return;
    zone.onclick = function() { input.click(); };
    input.onchange = async function(e) {
        var file = e.target.files[0];
        if (!file) return;

        // Batas upload: 10MB
        if (file.size > 10 * 1024 * 1024) {
            return alert("Ukuran foto maksimal 10MB. Silakan pilih foto yang lebih kecil.");
        }

        var preview = document.getElementById("preview-img");
        var text    = document.getElementById("drop-text");

        // Tampilkan loading
        if (text) text.textContent = "Mengompres foto...";

        try {
            // Kompres: max 1000x1000px, kualitas 75%
            base64Image = await kompresGambar(file, 1000, 1000, 0.75);
            if (preview) {
                preview.src = base64Image;
                preview.classList.remove("hidden");
            }
            if (text) text.classList.add("hidden");
        } catch(err) {
            console.error("Kompres gagal:", err);
            if (text) text.textContent = "Klik untuk pilih foto";
        }
    };
}

function closeModal() { document.getElementById("detailModal").classList.add("hidden"); }
function checkPenjasaAccess() { if(!activeUser) showPage('loginPage'); else showPage('dashboard'); }
function aksesDashboard() { if(!activeUser) showPage('loginPage'); else showPage('dashboard'); }

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
            html += `<span class="text-yellow-400 text-sm"></span>`;
        } else if (i === full + 1 && half) {
            html += `<span class="text-yellow-300 text-sm"></span>`;
        } else {
            html += `<span class="text-slate-200 text-sm"></span>`;
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
                    if (msgEl) msgEl.textContent = `Rating kamu: ${myRating.nilai}/5  (klik bintang untuk ubah)`;
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

        if (msgEl) msgEl.textContent = `Rating ${nilai}/5 tersimpan!`;

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

        const medals = ['', '', ''];
        const html = top3.map(([jasaId, info], i) => {
            const avgArr = ratingMap[jasaId] || [];
            const avg = avgArr.length > 0
                ? (avgArr.reduce((a, b) => a + b, 0) / avgArr.length).toFixed(1)
                : null;
            const starHtml = avg
                ? `<span class="text-yellow-400 text-xs"></span><span class="text-[10px] text-slate-500 font-bold">${avg}</span>`
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
        if (labelEl) labelEl.textContent = `Rating ${nilai}/5`;

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
        if (labelEl) labelEl.textContent = `Rating kamu: ${nilai}/5`;
    });
}


function showDashTab(tab) {
    // Semua panel
    var panels = {
        pesanan:     document.getElementById('dashPesanan'),
        katalog:     document.getElementById('dashKatalog'),
        keuangan:    document.getElementById('dashKeuangan'),
        reviewer:    document.getElementById('dashReviewer'),
        riwayatJasa: document.getElementById('dashRiwayatJasa'),
    };
    var tabs = {
        pesanan:     document.getElementById('tabPesanan'),
        katalog:     document.getElementById('tabKatalog'),
        keuangan:    document.getElementById('tabKeuangan'),
        reviewer:    document.getElementById('tabReviewer'),
        riwayatJasa: document.getElementById('tabRiwayatJasa'),
    };

    // Sembunyikan semua panel, reset semua tab
    Object.keys(panels).forEach(function(k) {
        if (panels[k]) panels[k].classList.add('hidden');
        if (tabs[k])   { tabs[k].classList.remove('bg-blue-600','text-white'); tabs[k].classList.add('bg-white','text-slate-600','border','border-slate-200'); }
    });

    // Tampilkan panel yang dipilih
    var activePanel = panels[tab];
    var activeTab   = tabs[tab];
    if (activePanel) activePanel.classList.remove('hidden');
    if (activeTab)   { activeTab.classList.add('bg-blue-600','text-white'); activeTab.classList.remove('bg-white','text-slate-600','border','border-slate-200'); }

    // Aksi tambahan per tab
    if (tab === 'keuangan')    loadKeuangan();
    if (tab === 'katalog')     { if (typeof fetchMyJasa === 'function') fetchMyJasa(); }
    if (tab === 'pesanan')     { if (typeof renderMitraOrders === 'function') renderMitraOrders(); }
    if (tab === 'reviewer')    loadReviewerActivity();
    if (tab === 'riwayatJasa') loadRiwayatJasa();
}

function showOrderTab(tab) {
    var panelR  = document.getElementById('panelRiwayat');
    var panelW  = document.getElementById('panelWishlist');
    var tabR    = document.getElementById('tabRiwayat');
    var tabW    = document.getElementById('tabWishlist');
    var statsBox = document.getElementById('orderStatsBox');
    if (tab === 'wishlist') {
        if (panelR) panelR.classList.add('hidden');
        if (panelW) panelW.classList.remove('hidden');
        if (statsBox) statsBox.classList.add('hidden'); // sembunyikan stats
        if (tabR)   { tabR.classList.remove('bg-blue-600','text-white'); tabR.classList.add('bg-white','text-slate-600','border','border-slate-200'); }
        if (tabW)   { tabW.classList.add('bg-blue-600','text-white');    tabW.classList.remove('bg-white','text-slate-600','border','border-slate-200'); }
        renderWishlistPage();
    } else {
        if (panelW) panelW.classList.add('hidden');
        if (panelR) panelR.classList.remove('hidden');
        if (statsBox) statsBox.classList.remove('hidden'); // tampilkan stats
        if (tabW)   { tabW.classList.remove('bg-blue-600','text-white'); tabW.classList.add('bg-white','text-slate-600','border','border-slate-200'); }
        if (tabR)   { tabR.classList.add('bg-blue-600','text-white');    tabR.classList.remove('bg-white','text-slate-600','border','border-slate-200'); }
    }
}


// 
// WISHLIST
// 
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
        if (btn) { btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'; btn.style.color = '#ef4444'; }
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
        if (btn) { btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'; btn.style.color = '#94a3b8'; }
    } else {
        await _supabase.from('wishlist').insert([{ user_id: activeUser.id, jasa_id: jasaId }]);
        myWishlistIds.add(jasaId);
        if (btn) { btn.innerHTML = ''; btn.style.color = '#ef4444'; }
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
        container.innerHTML = '<div class="text-center py-16"><p class="text-slate-400 font-medium">Belum ada jasa yang disimpan</p><p class="text-sm text-slate-300 mt-1">Klik tanda hati di kartu jasa untuk menyimpannya</p></div>';
        return;
    }

    var rj = await _supabase.from('jasa').select('*').in('id', ids);
    container.innerHTML = (rj.data || []).map(function(j) {
        return '<div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex gap-4 items-center" id="wishItem-' + j.id + '">' +
            '<img src="' + (j.img || 'https://via.placeholder.com/80') + '" class="w-16 h-16 rounded-xl object-cover flex-shrink-0">' +
            '<div class="flex-1 min-w-0">' +
            '<p class="font-bold text-slate-800 truncate">' + j.nama + '</p>' +
            '<p class="text-blue-600 font-bold text-sm">Rp ' + Number(j.harga).toLocaleString() + '</p>' +
            (j.lokasi ? '<p class="text-xs text-slate-400">' + j.lokasi + '</p>' : '') +
            '</div>' +
            '<div class="flex flex-col gap-2 flex-shrink-0">' +
            '<button onclick="openDetail(' + JSON.stringify(j).replace(/"/g, '&quot;') + ')" class="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition">Lihat</button>' +
            '<button onclick="hapusWishlist(' + j.id + ', this)" class="text-xs font-bold text-red-400 bg-red-50 px-3 py-1.5 rounded-xl hover:bg-red-100 transition">Hapus </button>' +
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

        // Update tombol  di marketplace jika ada
        var mktBtn = document.getElementById('wishBtn-' + jasaId);
        if (mktBtn) { mktBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'; mktBtn.style.color = '#94a3b8'; }

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
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Hapus '; }
    }
}

// 
// KEUANGAN MITRA
// 
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
        // Simpan untuk filter
        window._keuOrders = orders;

        var statsHtml =
            '<div class="grid grid-cols-3 gap-3 mb-5">' +
            '<div class="bg-gradient-to-br from-green-500 to-green-600 p-4 rounded-2xl text-white text-center"><p class="text-green-100 text-[10px] font-bold uppercase mb-1">Pendapatan</p><p class="text-lg font-black">Rp ' + _fmtRp(totalPendapatan) + '</p><p class="text-green-200 text-[10px]">' + totalSelesai + ' selesai</p></div>' +
            '<div class="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-2xl text-white text-center"><p class="text-blue-100 text-[10px] font-bold uppercase mb-1">Selesai</p><p class="text-lg font-black">' + totalSelesai + '</p></div>' +
            '<div class="bg-gradient-to-br from-yellow-400 to-orange-500 p-4 rounded-2xl text-white text-center"><p class="text-yellow-100 text-[10px] font-bold uppercase mb-1">Berjalan</p><p class="text-lg font-black">' + totalPending + '</p></div>' +
            '</div>';

        var filterHtml =
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
            '<button onclick="filterKeuangan(&quot;semua&quot;)" id="kfSemua" style="padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:#0f172a;color:white;border:none;cursor:pointer;">Semua</button>' +
            '<button onclick="filterKeuangan(&quot;selesai&quot;)" id="kfSelesai" style="padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;">Selesai</button>' +
            '<button onclick="filterKeuangan(&quot;pending&quot;)" id="kfPending" style="padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;">Pending</button>' +
            '<button onclick="filterKeuangan(&quot;diterima&quot;)" id="kfDiterima" style="padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;">Diterima</button>' +
            '<button onclick="filterKeuangan(&quot;ditolak&quot;)" id="kfDitolak" style="padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;">Ditolak</button>' +
            '</div>';

        container.innerHTML = statsHtml +
            '<h4 style="font-weight:700;color:#0f172a;margin-bottom:8px;">Riwayat Transaksi</h4>' +
            filterHtml +
            '<div id="keuListContainer" class="space-y-2"></div>';

        renderKeuList(orders);
    } catch(err) {
        container.innerHTML = '<p class="text-red-400 italic text-center py-6">Gagal: ' + err.message + '</p>';
    }
}




function renderKeuList(orders) {
    var container = document.getElementById('keuListContainer');
    if (!container) return;
    var statusStyle = function(s) {
        return s==='selesai' ? 'background:#dcfce7;color:#16a34a;' : s==='diterima' ? 'background:#dbeafe;color:#2563eb;' : s==='ditolak' ? 'background:#fee2e2;color:#dc2626;' : 'background:#fef9c3;color:#ca8a04;';
    };
    if (!orders || orders.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#94a3b8;font-style:italic;padding:16px;">Tidak ada transaksi.</p>';
        return;
    }
    container.innerHTML = orders.map(function(o) {
        var tgl = new Date(o.created_at).toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric'});
        return '<div style="background:white;border:1px solid #f1f5f9;border-radius:16px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;">' +
        '<div style="min-width:0;"><p style="font-weight:700;color:#0f172a;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (o.jasa_nama||'Jasa') + '</p><p style="font-size:11px;color:#94a3b8;">' + tgl + '</p></div>' +
        '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">' +
        (o.status==='selesai' ? '<p style="font-weight:800;color:#16a34a;font-size:14px;">+Rp ' + Number(o.harga||0).toLocaleString('id-ID') + '</p>' : '') +
        '<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;' + statusStyle(o.status) + '">' + (o.status||'pending').toUpperCase() + '</span>' +
        '</div></div>';
    }).join('');
}

function filterKeuangan(status) {
    // Update tombol aktif
    ['semua','selesai','pending','diterima','ditolak'].forEach(function(k) {
        var btn = document.getElementById('kf' + k.charAt(0).toUpperCase() + k.slice(1));
        if (btn) btn.style.background = (k === status) ? '#0f172a' : '#f1f5f9';
        if (btn) btn.style.color      = (k === status) ? 'white'   : '#475569';
    });
    var all = window._keuOrders || [];
    var filtered = status === 'semua' ? all : all.filter(function(o){ return o.status === status; });
    renderKeuList(filtered);
}

// 
// STATUS TOKO BUKA / TUTUP
// 
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
        if (label) { label.textContent = 'Buka'; label.style.color = '#15803d'; }
        var p = box.querySelector('p');
        if (p) { p.textContent = 'Status Toko'; p.style.color = '#16a34a'; }
    } else {
        box.className   = 'px-4 py-2 bg-slate-100 rounded-xl';
        if (dot)   { dot.className = 'w-2 h-2 bg-slate-400 rounded-full'; }
        if (label) { label.textContent = 'Tutup'; label.style.color = '#64748b'; }
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

        var msg = _tokoIsOpen ? 'Toko kamu sekarang BUKA' : 'Toko kamu sekarang TUTUP';
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
// 
// FITUR CHAT
// 
var chatPartnerId   = null;
var chatPartnerName = '';
var chatInterval    = null;

// Buka chat dengan user tertentu (dari profil publik)
async function bukaChat(partnerId, partnerName) {
    if (!activeUser) return alert("Silakan login dulu untuk chat.");
    chatPartnerId   = partnerId;
    chatPartnerName = partnerName;
    _chatMsgCount   = 0; // reset agar langsung scroll ke bawah saat buka chat baru

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
    var btnHapus = document.getElementById('btnHapusChat'); if (btnHapus) btnHapus.style.display = 'flex';

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

    teardownChatRealtime();
    // Supabase Realtime → pesan instan (bukan polling)
    setupChatRealtime();
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
            var tgl    = new Date(m.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });

            // Parse reply prefix  REPLY:...pesan
            var rawIsi   = m.isi || '';
            var quoteHtml = '';
            var actualIsi = rawIsi;
            var replyMatch = rawIsi.match(/^\u27E6REPLY:([\s\S]*?)\u27E7([\s\S]*)$/);
            if (replyMatch) {
                var quoteText = replyMatch[1];
                actualIsi     = replyMatch[2];
                var qColor = isMine ? 'rgba(255,255,255,0.15)' : '#f0f4ff';
                var qBorder= isMine ? 'rgba(255,255,255,0.4)'  : '#93c5fd';
                var qText  = isMine ? 'rgba(255,255,255,0.85)' : '#1e40af';
                quoteHtml = '<div style="background:' + qColor + ';border-left:3px solid ' + qBorder + ';border-radius:6px;padding:5px 8px;margin-bottom:6px;">' +
                    '<p style="font-size:11px;font-weight:700;color:' + qText + ';margin:0 0 2px;"> Membalas</p>' +
                    '<p style="font-size:11px;color:' + (isMine ? 'rgba(255,255,255,0.75)' : '#475569') + ';margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
                    escapeHtml(quoteText.substring(0, 80)) + (quoteText.length > 80 ? '...' : '') + '</p>' +
                    '</div>';
            }

            var bubbleStyle = isMine
                ? 'background:#2563eb;color:white;border-radius:18px 18px 4px 18px;'
                : 'background:white;color:#0f172a;border-radius:18px 18px 18px 4px;box-shadow:0 1px 2px rgba(0,0,0,0.08);';

            var msgId      = String(m.id);
            var encodedIsi = encodeURIComponent(actualIsi);

            // Tombol aksi: SEMUA user bisa balas, hapus hanya untuk pengirim
            var replyColor  = isMine ? 'rgba(255,255,255,0.6)' : '#94a3b8';
            var actionsHtml = '<div style="display:flex;gap:8px;margin-top:4px;justify-content:' + (isMine ? 'flex-end' : 'flex-start') + ';">' +
                '<button onclick="mulaiReplyEncoded(\'' + msgId + '\',\'' + encodedIsi + '\')" ' +
                'style="background:none;border:none;cursor:pointer;font-size:11px;color:' + replyColor + ';padding:0;">Balas</button>';
            if (isMine) {
                var encodedPreview = encodeURIComponent(actualIsi.substring(0, 60));
                actionsHtml += '<button onclick="bukaMsgHapusModal(\'' + msgId + '\',\'' + encodedPreview + '\')" ' +
                    'style="background:none;border:none;cursor:pointer;font-size:11px;color:rgba(255,255,255,0.5);padding:0;"> Hapus</button>';
            }
            actionsHtml += '</div>';

            var encodedQuote = replyMatch ? encodeURIComponent(replyMatch[1]) : '';
            var quoteDivOpen = replyMatch
                ? '<div onclick="scrollKeChat(\'' + encodedQuote + '\')" style="background:' +
                  (isMine ? 'rgba(255,255,255,0.15)' : '#f0f4ff') + ';border-left:3px solid ' +
                  (isMine ? 'rgba(255,255,255,0.4)' : '#93c5fd') + ';border-radius:6px;padding:5px 8px;margin-bottom:6px;cursor:pointer;transition:opacity 0.2s;" ' +
                  'onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">' +
                  '<p style="font-size:11px;font-weight:700;color:' + (isMine ? 'rgba(255,255,255,0.85)' : '#1e40af') + ';margin:0 0 2px;"> Membalas</p>' +
                  '<p style="font-size:11px;color:' + (isMine ? 'rgba(255,255,255,0.75)' : '#475569') + ';margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
                  escapeHtml(replyMatch[1].substring(0, 80)) + (replyMatch[1].length > 80 ? '...' : '') + '</p>' +
                  '</div>'
                : '';
            return '<div id="msg-' + msgId + '" data-isi="' + encodeURIComponent(actualIsi) + '" style="display:flex;justify-content:' + (isMine ? 'flex-end' : 'flex-start') + ';margin-bottom:2px;">' +
                '<div style="max-width:78%;' + bubbleStyle + 'padding:10px 14px;">' +
                quoteDivOpen +
                '<p style="font-size:14px;line-height:1.5;margin:0;white-space:pre-wrap;' + (actualIsi === '\uD83D\uDEAB Pesan telah dihapus' ? 'opacity:0.55;font-style:italic;' : '') + '">' + escapeHtml(actualIsi) + '</p>' +
                '<p style="font-size:10px;margin:4px 0 0;text-align:right;color:' + (isMine ? 'rgba(255,255,255,0.7)' : '#94a3b8') + ';">' + tgl + '</p>' +
                actionsHtml +
                '</div></div>';
        }).join('');

        // Hanya auto-scroll ke bawah jika:
        // 1. User sudah dekat bawah (threshold 120px), ATAU
        // 2. Ada pesan baru masuk, ATAU
        // 3. Pertama kali load (count sebelumnya 0)
        var isNearBottom = (msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight) < 120;
        var hasNewMsg    = msgs.length > _chatMsgCount;
        if (isNearBottom || hasNewMsg || _chatMsgCount === 0) {
            msgEl.scrollTop = msgEl.scrollHeight;
        }
        _chatMsgCount = msgs.length;

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
        var finalIsi = isi;
        if (_replyToId && _replyToText) {
            // Format unicode yang tidak akan ikut ter-quote ulang
            finalIsi = '\u27E6REPLY:' + _replyToText + '\u27E7' + isi;
        }
        var r = await _supabase.from('messages').insert([{
            sender_id:   activeUser.id,
            receiver_id: chatPartnerId,
            isi:         finalIsi,
            dibaca:      false
        }]);
        if (r.error) throw r.error;
        batalReply();
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
    teardownChatRealtime();
}

// Stop auto-refresh saat keluar dari halaman chat
var _origShowPage = showPage;
// fetchMitraOrders(); 

// --- FITUR DASHBOARD MITRA (PRO) ---

async function fetchMitraOrders() {
    renderMitraOrders();
}


// 
// REVIEWER NOTIF DI DASHBOARD MITRA
// 
var _reviewerTypeFilter = 'semua';
var _reviewerStarFilter = 0; // 0 = semua bintang

function setReviewerFilter(type) {
    _reviewerTypeFilter = type;
    ['semua','komentar','rating'].forEach(function(k) {
        var btn = document.getElementById('rf' + k.charAt(0).toUpperCase() + k.slice(1));
        if (!btn) return;
        btn.className = k === type
            ? 'px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-white transition'
            : 'px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition';
    });
    // Tampilkan/sembunyikan filter bintang
    var starRow = document.getElementById('reviewerStarFilters');
    if (starRow) starRow.style.display = (type === 'rating') ? 'flex' : 'none';
    // Reset filter bintang kalau bukan rating
    if (type !== 'rating') { _reviewerStarFilter = 0; setReviewerStarFilter(0, true); }
    loadReviewerActivity();
}

function setReviewerStarFilter(nilai, silent) {
    _reviewerStarFilter = nilai;
    // Update tombol bintang
    for (var i = 0; i <= 5; i++) {
        var btn = document.getElementById('rfs' + i);
        if (!btn) continue;
        btn.className = i === nilai
            ? 'px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 text-white transition'
            : 'px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-600 border border-slate-200 transition';
    }
    if (!silent) loadReviewerActivity();
}

async function loadReviewerActivity() {
    var container = document.getElementById('reviewerActivityList');
    if (!container || !activeUser) return;
    container.innerHTML = '<p class="text-slate-400 text-xs italic text-center py-4">Memuat...</p>';

    try {
        // Ambil semua jasa mitra
        var rj = await _supabase.from('jasa').select('id, nama').eq('user_id', activeUser.id);
        var myJasa = rj.data || [];
        var jasaIds = myJasa.map(function(j){ return j.id; });
        var jasaMap = {};
        myJasa.forEach(function(j){ jasaMap[j.id] = j.nama; });

        if (jasaIds.length === 0) {
            container.innerHTML = '<p class="text-slate-400 text-xs italic text-center py-4">Belum ada jasa.</p>';
            return;
        }

        // Isi dropdown filter jasa
        var selJasa = document.getElementById('reviewerFilterJasa');
        if (selJasa && selJasa.options.length <= 1) {
            myJasa.forEach(function(j) {
                var opt = document.createElement('option');
                opt.value = j.id;
                opt.textContent = j.nama;
                selJasa.appendChild(opt);
            });
        }

        // Filter jasa yang dipilih
        var selectedJasaId = selJasa ? selJasa.value : 'semua';
        var filteredIds = selectedJasaId === 'semua' ? jasaIds : [parseInt(selectedJasaId)];

        // Ambil komentar + rating sesuai filter
        var fetchKomentar = _reviewerTypeFilter !== 'rating';
        var fetchRating   = _reviewerTypeFilter !== 'komentar';
        var [rc, rr] = await Promise.all([
            fetchKomentar ? _supabase.from('komentar').select('id, jasa_id, user_id, isi_komentar, created_at').in('jasa_id', filteredIds).eq('is_reply', false).order('created_at', {ascending:false}).limit(30) : {data:[]},
            fetchRating   ? _supabase.from('ratings').select('jasa_id, user_id, nilai, created_at').in('jasa_id', filteredIds).order('created_at', {ascending:false}).limit(30) : {data:[]}
        ]);

        // Gabung + filter bintang jika perlu
        var activities = [];
        (rc.data || []).forEach(function(c){ activities.push({ type:'komentar', jasa_id:c.jasa_id, user_id:c.user_id, isi_komentar:c.isi_komentar, created_at:c.created_at }); });
        (rr.data || []).forEach(function(r){ activities.push({ type:'rating', jasa_id:r.jasa_id, user_id:r.user_id, nilai:r.nilai, created_at:r.created_at }); });
        // Filter bintang
        if (_reviewerStarFilter > 0) {
            activities = activities.filter(function(a){ return a.type === 'rating' && a.nilai === _reviewerStarFilter; });
        }
        activities.sort(function(a,b){ return new Date(b.created_at) - new Date(a.created_at); });
        activities = activities.slice(0, 30);

        if (activities.length === 0) {
            container.innerHTML = '<p class="text-slate-400 text-xs italic text-center py-4">Belum ada aktivitas reviewer.</p>';
            return;
        }

        // Ambil profil user
        var uids = [...new Set(activities.map(function(a){ return a.user_id; }))];
        var rp = await _supabase.from('profiles').select('id, username, avatar_url').in('id', uids);
        var profMap = {};
        (rp.data || []).forEach(function(p){ profMap[p.id] = p; });

        container.innerHTML = activities.map(function(a) {
            var prof   = profMap[a.user_id] || {};
            var name   = prof.username || 'Seseorang';
            var avatar = prof.avatar_url
                ? '<img src="' + prof.avatar_url + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;">'
                : '<div style="width:36px;height:36px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-weight:700;color:#2563eb;font-size:14px;flex-shrink:0;">' + name.charAt(0).toUpperCase() + '</div>';
            var tgl  = new Date(a.created_at).toLocaleDateString('id-ID', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
            var info = '';
            if (a.type === 'komentar') {
                info = '<span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:2px 7px;border-radius:99px;font-weight:700;"> Komentar</span> ' +
                       '<span style="font-size:12px;color:#475569;">"' + (a.isi_komentar||'').substring(0,50) + (a.isi_komentar && a.isi_komentar.length>50?'...':'') + '"</span>';
            } else {
                var stars = '';
                for (var i=1;i<=5;i++) stars += '<span style="color:' + (i<=a.nilai?'#f59e0b':'#e2e8f0') + ';font-size:12px;"></span>';
                info = '<span style="font-size:11px;background:#fef9c3;color:#854d0e;padding:2px 7px;border-radius:99px;font-weight:700;"> Rating</span> ' + stars;
            }
            var jasaNama = jasaMap[a.jasa_id] || 'Jasa';
            return '<div onclick="bukaJasaDariReviewer(' + a.jasa_id + ',&quot;' + a.type + '&quot;,&quot;' + a.user_id + '&quot;)" style="display:flex;align-items:center;gap:10px;padding:10px;background:#f8fafc;border-radius:14px;margin-bottom:8px;border:1px solid #f1f5f9;cursor:pointer;transition:background 0.2s;" onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'#f8fafc\'">' +
                avatar +
                '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                '<p style="font-weight:700;font-size:13px;color:#0f172a;margin:0;">@' + name + '</p>' +
                info +
                '</div>' +
                '<p style="font-size:10px;color:#94a3b8;margin:2px 0 0;">' + jasaNama + ' · ' + tgl + '</p>' +
                '<p style="font-size:9px;color:#2563eb;margin:1px 0 0;font-weight:600;">Klik untuk lihat di jasa</p>' +
                '</div></div>';
        }).join('');
    } catch(e) {
        container.innerHTML = '<p class="text-red-400 text-xs italic text-center py-4">Gagal memuat: ' + e.message + '</p>';
    }
}


// Buka modal jasa dari reviewer dashboard, lalu scroll ke komentar/rating
async function bukaJasaDariReviewer(jasaId, targetType, targetUserId) {
    try {
        // Fetch data jasa
        var rj = await _supabase.from('jasa').select('*').eq('id', jasaId).maybeSingle();
        if (!rj.data) return alert('Jasa tidak ditemukan.');
        var jasa = rj.data;

        // Buka modal detail
        await openDetail(jasa);

        // Tunggu komentar selesai render lalu scroll ke target
        setTimeout(async function() {
            if (targetType === 'komentar') {
                // Cari bubble komentar dari user tersebut
                var commentList = document.getElementById('commentList');
                if (!commentList) return;
                var allComments = commentList.querySelectorAll('[data-user-id]');
                var target = null;
                allComments.forEach(function(el) {
                    if (el.getAttribute('data-user-id') === String(targetUserId)) target = el;
                });
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    var origBg = target.style.background;
                    target.style.transition = 'background 0.3s';
                    target.style.background = '#fef9c3';
                    setTimeout(function() { target.style.background = origBg; }, 1500);
                } else {
                    // Scroll ke section komentar
                    var section = document.getElementById('commentList');
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else {
                // Scroll ke section rating
                var ratingSection = document.querySelector('#detailModal .rating-section, #detailModal [id*="Rating"]');
                if (ratingSection) ratingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 600);
    } catch(e) {
        console.error('bukaJasaDariReviewer:', e);
    }
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


            var harga     = Number(order.harga || 0).toLocaleString("id-ID");
            var statusUp  = (order.status || "pending").toUpperCase();
            var jasaNama  = (order.jasa_nama || "Jasa").replace(/"/g,"&quot;");

            var actionBtns = "";
            if (order.status === "pending") {
                actionBtns  = '<button onclick="updateOrderStatus(\'' + order.id + '\',\'diterima\',\'\')" class="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition">Terima Pesanan</button>';
                actionBtns += '<button onclick="updateOrderStatus(\'' + order.id + '\',\'ditolak\',\'\')" class="bg-red-50 text-red-500 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-red-100 transition">Tolak</button>';
            } else if (order.status === "diterima") {
                // Tombol Chat - selalu tampil
                actionBtns = '<button onclick="bukaChat(\'' + order.buyer_id + '\')" class="bg-blue-50 text-blue-600 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-100 transition border border-blue-200">Chat Pemesan</button>';
                // Tombol WA - hanya kalau buyer punya nomor WA
                if (buyerWA) {
                    actionBtns += '<button onclick="hubungiPemesan(\'' + buyerWA + '\',\'' + jasaNama + '\')" class="flex-1 bg-green-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-600 transition">Hubungi via WA</button>';
                }
                actionBtns += '<button onclick="updateOrderStatus(\'' + order.id + '\',\'selesai\',\'\')" class="bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-200 transition">TandaiSelesai</button>';
            } else {
                actionBtns = '<span class="text-sm text-slate-400 italic">Pesanan ' + order.status + '</span>';
            }

            html += '<div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-3">';
            html +=   '<div class="flex justify-between items-start mb-3">';
            html +=     '<div>';
            html +=       '<p class="text-xs text-slate-400">' + tgl + '</p>';
            html +=       '<p class="font-bold text-slate-800">' + (order.jasa_nama || "Jasa") + '</p>';
            html +=       '<p class="text-sm text-slate-500">Pemesan: <button onclick="bukaProfilPublik(\'' + order.buyer_id + '\')" class="font-bold text-blue-600 hover:underline hover:text-blue-800 transition">@' + buyerName + '</button></p>';
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
        showToast("Pesanan diterima! Silakan hubungi pemesan via WA.");
    } else if (newStatus === "ditolak") {
        showToast("Pesanan ditolak.");
    } else if (newStatus === "selesai") {
        showToast("Pesanan selesai! Tercatat sebagai pengeluaran.");
        // Refresh riwayat pesanan di dashboard pencari jika tab terbuka
        var ordersPanel = document.getElementById('subPanelOrders');
        if (ordersPanel && !ordersPanel.classList.contains('hidden')) renderOrders();
        // Refresh pengeluaran jika panel terbuka
        var pengPanel = document.getElementById('dashPengeluaran');
        if (pengPanel && !pengPanel.classList.contains('hidden')) loadPengeluaran();
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
    // Jasa aktif = milik user ini + is_open !== false
    const myJasaCount = allJasa.filter(function(j){ return j.owner_email === activeUser.email && j.is_open !== false; }).length;
    document.getElementById("statActiveJasa").innerText = myJasaCount;
}

// =====================================================
// === FITUR PROFIL LENGKAP (BIO, FOTO, USERNAME) ===
// =====================================================

let profileAvatarBase64 = ""; // menyimpan foto baru yang dipilih

// Buka/tutup modal profil & load data saat dibuka

// 
// GANTI EMAIL
// 
function toggleEditEmail() {
    var viewMode = document.getElementById('emailViewMode');
    var editMode = document.getElementById('emailEditMode');
    var btn      = document.getElementById('btnEditEmail');
    if (!viewMode || !editMode) return;
    viewMode.classList.add('hidden');
    editMode.classList.remove('hidden');
    if (btn) btn.classList.add('hidden');
    var input = document.getElementById('newEmailInput');
    if (input) { input.value = ''; input.focus(); }
}

function batalEditEmail() {
    var viewMode = document.getElementById('emailViewMode');
    var editMode = document.getElementById('emailEditMode');
    var btn      = document.getElementById('btnEditEmail');
    if (viewMode) viewMode.classList.remove('hidden');
    if (editMode) editMode.classList.add('hidden');
    if (btn)      btn.classList.remove('hidden');
}

async function simpanEmailBaru() {
    if (!activeUser) return;
    var newEmail   = (document.getElementById('newEmailInput')?.value || '').trim().toLowerCase();
    var passInput  = document.getElementById('newEmailPassInput')?.value || '';

    if (!newEmail) return alert('Email baru tidak boleh kosong!');
    if (!newEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return alert('Format email tidak valid!');
    if (!passInput) return alert('Masukkan password untuk konfirmasi!');

    try {
        // Verifikasi password dulu
        var rUser = await _supabase.from('users').select('password').eq('id', activeUser.id).maybeSingle();
        if (!rUser.data) throw new Error('User tidak ditemukan');

        var passOk = false;
        try {
            if (bcrypt) passOk = await bcrypt.compare(passInput, rUser.data.password);
            else        passOk = (passInput === rUser.data.password);
        } catch(e) { passOk = (passInput === rUser.data.password); }

        if (!passOk) return alert('Password salah! Coba lagi.');

        // Cek email belum dipakai
        var rCheck = await _supabase.from('users').select('id').eq('email', newEmail).maybeSingle();
        if (rCheck.data) return alert('Email sudah digunakan akun lain!');

        // Update email
        var { error } = await _supabase.from('users').update({ email: newEmail }).eq('id', activeUser.id);
        if (error) throw error;

        // Update localStorage
        activeUser.email = newEmail;
        localStorage.setItem('activeUser', JSON.stringify(activeUser));

        // Update UI
        var display = document.getElementById('profileEmailDisplay');
        if (display) display.textContent = newEmail;
        batalEditEmail();
        showToast('Email berhasil diubah ke ' + newEmail);

    } catch(err) {
        alert('Gagal ganti email: ' + err.message);
    }
}


// 
// GANTI PASSWORD
// 
function toggleEditPassword() {
    var view = document.getElementById('passViewMode');
    var edit = document.getElementById('passEditMode');
    var btn  = document.getElementById('btnEditPassword');
    if (!view || !edit) return;
    view.classList.add('hidden');
    edit.classList.remove('hidden');
    if (btn) btn.classList.add('hidden');
    var inp = document.getElementById('oldPassInput');
    if (inp) inp.focus();
}

function batalEditPassword() {
    var view = document.getElementById('passViewMode');
    var edit = document.getElementById('passEditMode');
    var btn  = document.getElementById('btnEditPassword');
    if (view) view.classList.remove('hidden');
    if (edit) edit.classList.add('hidden');
    if (btn)  btn.classList.remove('hidden');
    // Reset semua field
    ['oldPassInput','newPassInput','confirmPassInput'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function simpanPasswordBaru() {
    if (!activeUser) return;
    var oldPass     = document.getElementById('oldPassInput')?.value || '';
    var newPass     = document.getElementById('newPassInput')?.value || '';
    var confirmPass = document.getElementById('confirmPassInput')?.value || '';

    if (!oldPass)     return alert('Masukkan password lama dulu!');
    if (!newPass)     return alert('Password baru tidak boleh kosong!');
    if (newPass.length < 6) return alert('Password baru minimal 6 karakter!');
    if (newPass !== confirmPass) return alert('Konfirmasi password tidak cocok!');
    if (oldPass === newPass)     return alert('Password baru harus berbeda dari password lama!');

    try {
        // Ambil hash password saat ini
        var rUser = await _supabase.from('users').select('password').eq('id', activeUser.id).maybeSingle();
        if (!rUser.data) throw new Error('User tidak ditemukan');

        // Verifikasi password lama
        var passOk = false;
        try {
            if (bcrypt) passOk = await bcrypt.compare(oldPass, rUser.data.password);
            else        passOk = (oldPass === rUser.data.password);
        } catch(e) { passOk = (oldPass === rUser.data.password); }

        if (!passOk) return alert('Password lama salah! Coba lagi.');

        // Hash password baru
        var newHash = oldPass; // fallback jika bcrypt tidak ada
        if (bcrypt) {
            newHash = await bcrypt.hash(newPass, 10);
        } else {
            newHash = newPass;
        }

        // Simpan ke database
        var { error } = await _supabase.from('users').update({ password: newHash }).eq('id', activeUser.id);
        if (error) throw error;

        batalEditPassword();
        showToast('Password berhasil diubah!');

    } catch(err) {
        alert('Gagal ganti password: ' + err.message);
    }
}


// 
// MULTI AKUN — Switch & Tambah Akun
// 

// Simpan daftar akun di localStorage
function getSavedAccounts() {
    try {
        return JSON.parse(localStorage.getItem('savedAccounts') || '[]');
    } catch(e) { return []; }
}

function saveSavedAccounts(list) {
    localStorage.setItem('savedAccounts', JSON.stringify(list));
}

// Simpan akun aktif ke daftar saat login
function simpanAkunKeList(user) {
    if (!user || !user.id) return;
    var list = getSavedAccounts();
    var idx  = list.findIndex(function(a){ return a.id === user.id; });
    var entry = {
        id:       user.id,
        email:    user.email,
        role:     user.role,
        username: user.username || user.email.split('@')[0],
        avatar:   user.avatar_url || ''
    };
    if (idx >= 0) list[idx] = entry;
    else          list.push(entry);
    saveSavedAccounts(list);

    // Fetch avatar dari profiles secara async agar tampil di kelola akun
    _supabase.from('profiles').select('username,avatar_url').eq('id', user.id).maybeSingle().then(function(res) {
        if (!res.data) return;
        var saved = getSavedAccounts();
        var i = saved.findIndex(function(a){ return a.id === user.id; });
        if (i >= 0) {
            if (res.data.avatar_url) saved[i].avatar   = res.data.avatar_url;
            if (res.data.username)   saved[i].username = res.data.username;
            saveSavedAccounts(saved);
        }
    }).catch(function(){});
}

function bukaAkunPanel() {
    if (activeUser) simpanAkunKeList(activeUser);

    // 1. Tampilkan LANGSUNG pakai data lokal (tidak tunggu network)
    _renderAkunList(getSavedAccounts());
    document.getElementById('akunPanel').style.display = 'flex';

    // 2. Refresh avatar dari DB di background (tidak blokir UI)
    _refreshAvatarsBackground();
}

async function _refreshAvatarsBackground() {
    try {
        var list = getSavedAccounts();
        var ids  = list.map(function(a){ return a.id; });
        if (ids.length === 0) return;
        var rp = await _supabase.from('profiles').select('id,username,avatar_url').in('id', ids);
        if (!rp.data) return;
        rp.data.forEach(function(p) {
            var i = list.findIndex(function(a){ return a.id === p.id; });
            if (i >= 0) {
                if (p.avatar_url) list[i].avatar   = p.avatar_url;
                if (p.username)   list[i].username = p.username;
            }
        });
        saveSavedAccounts(list);
        // Update UI jika panel masih terbuka
        var panel = document.getElementById('akunPanel');
        if (panel && panel.style.display !== 'none') {
            _renderAkunList(getSavedAccounts());
        }
    } catch(e) {}
}

function _renderAkunList(list) {
    var el = document.getElementById('akunList');
    if (!el) return;

    if (list.length === 0) {
        el.innerHTML = '<p style="text-align:center;color:#94a3b8;font-size:13px;padding:24px;">Belum ada akun tersimpan.</p>';
    } else {
        el.innerHTML = list.map(function(acc) {
            var isActive = activeUser && activeUser.id === acc.id;
            var initials = (acc.username || acc.email).charAt(0).toUpperCase();
            var avatarHtml = acc.avatar
                ? '<img src="' + acc.avatar + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid #dbeafe;">'
                : '<div style="width:44px;height:44px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-weight:700;color:#2563eb;font-size:16px;">' + initials + '</div>';
            var roleBadge = '<span style="font-size:10px;background:#eff6ff;color:#2563eb;font-weight:700;padding:2px 8px;border-radius:999px;">WargaBantuWarga</span>';

            return '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;margin-bottom:8px;' +
                (isActive ? 'background:#eff6ff;border:2px solid #bfdbfe;' : 'background:#f8fafc;border:1px solid #f1f5f9;') + '">' +
                avatarHtml +
                '<div style="flex:1;min-width:0;">' +
                '<p style="font-weight:700;font-size:14px;color:#0f172a;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">@' + (acc.username || acc.email.split("@")[0]) + '</p>' +
                '<p style="font-size:11px;color:#94a3b8;margin:2px 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + acc.email + '</p>' +
                roleBadge +
                '</div>' +
                (isActive
                    ? '<span style="font-size:11px;font-weight:700;color:#2563eb;"> Aktif</span>'
                    : '<button onclick="switchAkun(&quot;' + acc.id + '&quot;)" style="background:#2563eb;color:white;border:none;border-radius:10px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Pakai</button>'
                ) +
                (!isActive ? '<button onclick="hapusAkunDariList(&quot;' + acc.id + '&quot;)" style="background:#fee2e2;color:#dc2626;border:none;border-radius:10px;padding:7px 10px;font-size:12px;cursor:pointer;"><svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>' : '') +
                '</div>';
        }).join('');
    }

}

function tutupAkunPanel() {
    var panel = document.getElementById('akunPanel');
    if (panel) panel.style.display = 'none';
}

async function switchAkun(userId) {
    // Ambil data akun yang dipilih dari DB
    try {
        var r = await _supabase.from('users').select('*').eq('id', userId).maybeSingle();
        if (!r.data) return alert('Akun tidak ditemukan.');

        var rp = await _supabase.from('profiles').select('username,avatar_url').eq('id', userId).maybeSingle();
        var user = r.data;
        if (rp.data) {
            user.username  = rp.data.username;
            user.avatar_url = rp.data.avatar_url;
        }

        // Simpan akun baru sebagai aktif
        localStorage.setItem('activeUser', JSON.stringify(user));
        activeUser = user;
        simpanAkunKeList(user);

        tutupAkunPanel();
        toggleProfileModal(); // tutup modal profil
        updateAuthUI();
        showToast('Beralih ke @' + (user.username || user.email.split('@')[0]));

        // Reload halaman aktif
        showPage('marketplace');
        fetchJasa();
    } catch(err) {
        alert('Gagal switch akun: ' + err.message);
    }
}

function hapusAkunDariList(userId) {
    var list = getSavedAccounts().filter(function(a){ return a.id !== userId; });
    saveSavedAccounts(list);
    bukaAkunPanel(); // refresh tampilan
}


// 
// HAPUS AKUN PERMANEN
// 
function konfirmasiHapusAkun() {
    if (!activeUser) return;
    var nama = activeUser.username || activeUser.email;
    // Konfirmasi 2 langkah
    var ok1 = confirm(' Hapus akun @' + nama + '?\n\nSemua data (profil, jasa, pesanan, chat) akan dihapus permanen dan TIDAK BISA dipulihkan.');
    if (!ok1) return;
    var ok2 = confirm('Apakah kamu yakin? Ini tidak bisa dibatalkan!');
    if (!ok2) return;

    prosesHapusAkun();
}

async function prosesHapusAkun() {
    if (!activeUser) return;
    var uid = activeUser.id;
    showToast('Menghapus akun...');

    try {
        // Hapus data satu per satu (urutan penting karena ada foreign key)
        await _supabase.from('messages').delete().or('sender_id.eq.' + uid + ',receiver_id.eq.' + uid);
        await _supabase.from('ratings').delete().eq('user_id', uid);
        await _supabase.from('komentar').delete().eq('user_id', uid);
        await _supabase.from('wishlist').delete().eq('user_id', uid);
        await _supabase.from('orders').delete().eq('buyer_id', uid);
        await _supabase.from('fcm_tokens').delete().eq('user_id', uid);

        // Hapus jasa milik mitra (jika penjasa)
        if (activeUser.role === 'penjasa') {
            var rj = await _supabase.from('jasa').select('id').eq('user_id', uid);
            var jasaIds = (rj.data || []).map(function(j){ return j.id; });
            if (jasaIds.length > 0) {
                await _supabase.from('orders').delete().in('jasa_id', jasaIds);
                await _supabase.from('ratings').delete().in('jasa_id', jasaIds);
                await _supabase.from('komentar').delete().in('jasa_id', jasaIds);
                await _supabase.from('jasa').delete().eq('user_id', uid);
            }
            await _supabase.from('orders').delete().eq('owner_id', uid);
        }

        // Hapus profil & user
        await _supabase.from('profiles').delete().eq('id', uid);
        await _supabase.from('users').delete().eq('id', uid);

        // Hapus dari list multi-akun
        var list = getSavedAccounts().filter(function(a){ return a.id !== uid; });
        saveSavedAccounts(list);

        // Logout
        localStorage.removeItem('activeUser');
        activeUser = null;

        tutupAkunPanel();
        alert('Akun berhasil dihapus. Sampai jumpa!');
        location.reload();

    } catch(err) {
        console.error('Hapus akun error:', err);
        alert('Gagal hapus akun: ' + err.message + '\n\nCoba lagi atau hubungi admin.');
    }
}

function tambahAkunBaru() {
    tutupAkunPanel();
    // Simpan akun aktif dulu sebelum logout sementara
    if (activeUser) simpanAkunKeList(activeUser);
    // Buka halaman login tanpa logout — user bisa login akun lain
    toggleProfileModal();
    showPage('loginPage');
    showToast('Silakan login dengan akun lain');
}

//  Profile data cache 
// Menyimpan hasil fetch profil agar buka modal ke-2, ke-3, dst. langsung instan
var _profileDataCache = {}; // { [userId]: { data, ts } }

function _getProfileCache(uid) {
    var c = _profileDataCache[uid];
    if (!c) return null;
    if (Date.now() - c.ts > 90000) { delete _profileDataCache[uid]; return null; } // expired 90 dtk
    return c.data;
}
function _setProfileCache(uid, data) {
    _profileDataCache[uid] = { data: data, ts: Date.now() };
}
function _invalidateProfileCache(uid) {
    delete _profileDataCache[uid];
}
// 

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

    const emailEl     = document.getElementById('profileEmailDisplay');
    const typeEl      = document.getElementById('profileTypeDisplay');
    const joinedEl    = document.getElementById('profileJoinedDisplay');
    const roleBadge   = document.getElementById('profileRoleBadge');
    const lokasiField = document.getElementById('profileLokasiField');
    const waField     = document.getElementById('profileWAField');
    const avatarPreview = document.getElementById('profileAvatarPreview');

    // Tidak ada perbedaan role yang ditampilkan — semua pengguna sama
    if (emailEl) emailEl.textContent = activeUser.email;
    if (typeEl) {
        typeEl.textContent = 'WargaBantuWarga';
        typeEl.className   = 'text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600';
    }
    if (lokasiField) lokasiField.classList.remove('hidden');
    if (waField)     waField.classList.remove('hidden');

    // Helper: render data ke form + avatar (dipakai dari cache maupun fetch)
    function _applyProfileData(username, profile, userData, withAnimation) {
        const usernameInput = document.getElementById('newUsername');
        const bioInput      = document.getElementById('newBio');
        const lokasiInput   = document.getElementById('newLokasi');
        const waInput       = document.getElementById('newWA');
        const navAvatar     = document.getElementById('navAvatarImg');
        const navText       = document.getElementById('navUsernameText');
        const dashAvatar    = document.getElementById('dashAvatarImg');
        const dashText      = document.getElementById('dashUsernameText');

        if (usernameInput) usernameInput.value = username;
        if (bioInput) {
            bioInput.value       = profile?.bio || '';
            bioInput.placeholder = 'Ceritakan sedikit tentang dirimu...';
        }
        if (lokasiInput) lokasiInput.value = profile?.lokasi_usaha || '';
        if (waInput)     waInput.value     = profile?.wa_number    || '';

        if (joinedEl && userData) {
            const rawDate = userData.created_at || activeUser.created_at;
            joinedEl.textContent = rawDate
                ? new Date(rawDate).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })
                : '—';
        }

        const avatarSrc = profile?.avatar_url
            || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=dbeafe&color=2563eb&bold=true&size=128`;

        if (navAvatar) navAvatar.src       = avatarSrc;
        if (navText)   navText.textContent = username;
        if (dashAvatar) dashAvatar.src     = avatarSrc;
        if (dashText)   dashText.textContent = username;

        if (!avatarPreview) return;

        if (!withAnimation) {
            // Dari cache: tampil langsung, tidak perlu skeleton
            avatarPreview.src             = avatarSrc;
            avatarPreview.style.opacity   = '1';
            avatarPreview.style.transform = 'scale(1)';
        } else {
            // Dari fetch: preload lalu fade-in
            var sk = document.getElementById('_avatarSkeleton');
            if (sk) sk.style.display = 'none';
            var tempImg = new Image();
            tempImg.onload = function() {
                avatarPreview.src = avatarSrc;
                requestAnimationFrame(function() {
                    avatarPreview.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
                    avatarPreview.style.opacity    = '1';
                    avatarPreview.style.transform  = 'scale(1)';
                });
            };
            tempImg.onerror = function() {
                avatarPreview.src             = avatarSrc;
                avatarPreview.style.opacity   = '1';
                avatarPreview.style.transform = 'scale(1)';
            };
            tempImg.src = avatarSrc;
        }
    }

    //  Cek cache dulu 
    var cached = _getProfileCache(activeUser.id);
    if (cached) {
        // Tampil INSTAN dari cache (0 network wait)
        const username = cached.profile?.username || activeUser.email.split('@')[0];
        _applyProfileData(username, cached.profile, cached.userData, false);
        // Refresh di background (perbarui cache tanpa blokir UI)
        _fetchAndCacheProfile(_applyProfileData);
        return;
    }
    // 

    // Belum ada cache → tampilkan skeleton lalu fetch
    if (avatarPreview) {
        avatarPreview.style.transition = 'none';
        avatarPreview.style.opacity   = '0';
        avatarPreview.style.transform = 'scale(0.92)';
    }
    var avatarWrapper = avatarPreview ? avatarPreview.parentElement : null;
    if (avatarWrapper) {
        avatarWrapper.style.position = 'relative';
        var skeleton = document.getElementById('_avatarSkeleton');
        if (!skeleton) {
            skeleton = document.createElement('div');
            skeleton.id = '_avatarSkeleton';
            skeleton.style.cssText = 'position:absolute;inset:0;border-radius:50%;background:linear-gradient(90deg,#e2e8f0 25%,#f1f5f9 50%,#e2e8f0 75%);background-size:200% 100%;animation:_shimmer 1.2s infinite;pointer-events:none;';
            if (!document.getElementById('_shimmerStyle')) {
                var st = document.createElement('style');
                st.id  = '_shimmerStyle';
                st.textContent = '@keyframes _shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
                document.head.appendChild(st);
            }
            avatarWrapper.appendChild(skeleton);
        }
        skeleton.style.display = 'block';
    }

    await _fetchAndCacheProfile(_applyProfileData);
}

// Fetch users + profiles PARALLEL, simpan ke cache, lalu apply ke UI
async function _fetchAndCacheProfile(applyFn) {
    if (!activeUser) return;
    try {
        const [userRes, profileRes] = await Promise.all([
            _supabase.from('users').select('created_at').eq('id', activeUser.id).maybeSingle(),
            _supabase.from('profiles').select('username, bio, avatar_url, lokasi_usaha, wa_number').eq('id', activeUser.id).maybeSingle()
        ]);

        if (profileRes.error) throw profileRes.error;

        const userData = userRes.data   || {};
        const profile  = profileRes.data || {};
        const username = profile.username || activeUser.email.split('@')[0];

        _setProfileCache(activeUser.id, { profile, userData });
        applyFn(username, profile, userData, true);

    } catch (err) {
        console.error('Gagal load profil:', err);
        var sk = document.getElementById('_avatarSkeleton');
        if (sk) sk.style.display = 'none';
        var ap = document.getElementById('profileAvatarPreview');
        if (ap) { ap.style.opacity = '1'; ap.style.transform = 'scale(1)'; }
    }
}

// Preview & crop foto profil
var _cropperInstance = null;

async function previewAvatar(event) {
    var file = event.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        return alert("Ukuran foto maksimal 10MB.");
    }

    // Buka modal crop
    var reader = new FileReader();
    reader.onload = function(e) {
        var modal    = document.getElementById('cropModal');
        var cropImg  = document.getElementById('cropImage');
        if (!modal || !cropImg) return;

        // Reset cropper lama
        if (_cropperInstance) { _cropperInstance.destroy(); _cropperInstance = null; }

        cropImg.src = e.target.result;
        modal.style.display = 'flex';

        // Init cropper setelah gambar load
        cropImg.onload = function() {
            _cropperInstance = new Cropper(cropImg, {
                aspectRatio: 1,          // kotak 1:1 untuk foto profil
                viewMode:    1,
                dragMode:    'move',
                cropBoxResizable: true,
                background:  false,
                autoCropArea: 0.8,
            });
        };
    };
    reader.readAsDataURL(file);
}

function batalCrop() {
    var modal = document.getElementById('cropModal');
    if (modal) modal.style.display = 'none';
    if (_cropperInstance) { _cropperInstance.destroy(); _cropperInstance = null; }
    // Reset input file agar bisa pilih ulang
    var input = document.getElementById('avatarInput');
    if (input) input.value = '';
}

async function konfirmasiCrop() {
    if (!_cropperInstance) return;

    // Ambil canvas hasil crop → kompres → simpan sebagai base64
    var canvas = _cropperInstance.getCroppedCanvas({ width: 400, height: 400 });
    profileAvatarBase64 = canvas.toDataURL('image/jpeg', 0.85);

    // Update preview di modal profil
    var preview = document.getElementById('profileAvatarPreview');
    if (preview) preview.src = profileAvatarBase64;

    // Tutup modal crop
    batalCrop();
}

// Simpan semua perubahan profil ke Supabase
//  Foto disimpan sebagai base64 langsung di kolom avatar_url — tidak perlu Supabase Storage
async function saveProfile() {
    if (!activeUser) return alert("Silakan login terlebih dahulu!");

    var usernameEl = document.getElementById('newUsername');
    var bioEl2     = document.getElementById('newBio');
    var lokasiEl   = document.getElementById('newLokasi');
    var waEl       = document.getElementById('newWA');
    const statusEl = document.getElementById('profileStatus');
    const btn      = document.getElementById('btnSaveProfile');

    var newUsername = usernameEl ? usernameEl.value.trim() : '';
    var newBio      = bioEl2     ? bioEl2.value.trim()     : '';
    var newLokasi   = lokasiEl   ? lokasiEl.value.trim()   : '';
    var newWA       = waEl       ? waEl.value.trim()       : '';

    if (!newUsername) return alert("Username tidak boleh kosong!");

    // Foto sudah dikompres otomatis, tidak perlu validasi ukuran manual

    try {
        console.log('saveProfile mulai, username:', newUsername, 'userId:', activeUser.id);
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Menyimpan...';
        }
        if (statusEl) statusEl.textContent = 'Menyimpan...';

        //  1. Verifikasi user benar-benar ada di tabel users (cegah foreign key error)
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

        //  2. Pastikan baris profiles sudah ada — buat dulu jika belum
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
            bio: newBio || null
        };

        if (profileAvatarBase64) {
            updatePayload.avatar_url = profileAvatarBase64;
        }

        if (activeUser.role === 'penjasa') {
            updatePayload.lokasi_usaha = newLokasi || null;
        }
        // WA disimpan untuk semua user (pelanggan juga perlu WA)
        var cleanWA = (newWA || '').replace(/\D/g, '');
        updatePayload.wa_number = cleanWA || null;

        // Gunakan UPDATE (bukan upsert) agar tidak trigger constraint username_key
        const { error: updateError } = await _supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', activeUser.id);

        if (updateError) throw updateError;

        // Hapus cache profil agar buka modal berikutnya ambil data terbaru
        _invalidateProfileCache(activeUser.id);

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

        if (statusEl) statusEl.textContent = 'Profil berhasil disimpan!';
        profileAvatarBase64 = '';
        showToast('Profil berhasil disimpan!');

        setTimeout(function() {
            var modal = document.getElementById('modalProfile');
            if (modal && !modal.classList.contains('hidden')) toggleProfileModal();
            if (statusEl) statusEl.textContent = '';
        }, 1200);

    } catch (err) {
        console.error('Error simpan profil:', err);
        var errMsg = err.message || JSON.stringify(err) || 'Gagal menyimpan';
        if (statusEl) statusEl.textContent = ' ' + errMsg;
        alert('Gagal simpan profil: ' + errMsg);
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

// 
// KIRIM LAPORAN — support WA & Email, pilih developer
// 
function kirimLaporan(method) {
    var nama   = (document.getElementById('contactName')?.value || '').trim();
    var email  = (document.getElementById('contactEmail')?.value || '').trim();
    var msg    = (document.getElementById('contactMsg')?.value || '').trim();
    var target = (document.getElementById('contactTarget')?.value || 'joel');

    if (!nama || !msg) return alert('Nama dan deskripsi masalah wajib diisi!');

    var devMap = {
        joel: { email: 'joeljuniorjoel@gmail.com', nama: 'Joel' },
        rio:  { email: 'sadwwario@gmail.com',      nama: 'Rio'  },
        raya: { email: 'rayagibranbachtiar@gmail.com', nama: 'Raya' }
    };
    var dev = devMap[target] || devMap['joel'];

    var subject = encodeURIComponent('[WargaBantuWarga] Laporan dari ' + nama);
    var body = encodeURIComponent(
        'Halo ' + dev.nama + ',\n\n' +
        'Nama: ' + nama + '\n' +
        (email ? 'Email: ' + email + '\n' : '') +
        '\nLaporan:\n' + msg
    );
    window.open('mailto:' + dev.email + '?subject=' + subject + '&body=' + body);

    ['contactName','contactEmail','contactMsg'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    showToast('Laporan berhasil dikirim!');
}

// 
// FITUR ULASAN PENGGUNA
// Buat tabel di Supabase dengan SQL berikut:
// create table ulasan (
//   id uuid default gen_random_uuid() primary key,
//   nama text not null,
//   rating integer not null check (rating >= 1 and rating <= 5),
//   komentar text not null,
//   created_at timestamp with time zone default now()
// );
// 

var _ulasanRating = 0;
var _ulasanPendingData = null; // menyimpan data sementara sebelum modal identitas dipilih

function setRating(val) {
    _ulasanRating = val;
    document.getElementById('ulasanRating').value = val;
    var btns = document.querySelectorAll('.star-btn');
    btns.forEach(function(btn) {
        var bVal = parseInt(btn.getAttribute('data-val'));
        btn.style.color = bVal <= val ? '#f59e0b' : '#cbd5e1';
    });
}

// Dipanggil saat user klik "Kirim Ulasan" — validasi dulu, lalu tampilkan modal identitas
async function kirimUlasan() {
    var komentar = (document.getElementById('ulasanKomentar')?.value || '').trim();
    var rating   = parseInt(document.getElementById('ulasanRating')?.value || '0');

    if (rating < 1)  return alert('Silakan pilih rating bintang terlebih dahulu!');
    if (!komentar)   return alert('Komentar wajib diisi!');

    // Simpan data pending
    _ulasanPendingData = { komentar, rating };

    // Ambil data profil user jika login
    var modal = document.getElementById('identitasUlasanModal');
    var avatarEl = document.getElementById('modalAvatarIdentitas');
    var namaEl   = document.getElementById('modalNamaIdentitas');

    if (activeUser) {
        // Ambil profil dari Supabase
        try {
            var rp = await _supabase.from('profiles').select('username, avatar_url').eq('id', activeUser.id).maybeSingle();
            var profile = rp.data || {};
            var displayName = profile.username || activeUser.email || 'Pengguna';
            var avatarUrl   = profile.avatar_url || '';

            if (namaEl) namaEl.textContent = displayName;
            if (avatarEl) {
                if (avatarUrl) {
                    avatarEl.innerHTML = '<img src="' + avatarUrl + '" style="width:46px;height:46px;object-fit:cover;border-radius:50%;">';
                } else {
                    avatarEl.textContent = displayName.charAt(0).toUpperCase();
                }
            }
            // Simpan juga ke pending
            _ulasanPendingData.profileName   = displayName;
            _ulasanPendingData.profileAvatar = avatarUrl;
        } catch(e) {
            var fallback = activeUser.email || 'Pengguna';
            if (namaEl)   namaEl.textContent = fallback;
            if (avatarEl) avatarEl.textContent = fallback.charAt(0).toUpperCase();
            _ulasanPendingData.profileName   = fallback;
            _ulasanPendingData.profileAvatar = '';
        }
    } else {
        // Belum login — hanya tampilkan opsi anonim, atau minta login
        if (namaEl)   namaEl.textContent = 'Belum login';
        if (avatarEl) avatarEl.innerHTML = '<svg width="24" height="24" fill="none" stroke="#94a3b8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>';
        var btnIdentitas = document.getElementById('btnPilihIdentitas');
        if (btnIdentitas) btnIdentitas.style.opacity = '0.4';
        _ulasanPendingData.profileName   = '';
        _ulasanPendingData.profileAvatar = '';
    }

    if (modal) modal.style.display = 'block';
}

// Tutup modal identitas jika klik di luar area card
function tutupIdentitasModal(event) {
    // Jika dipanggil dari overlay (event ada), pastikan klik benar-benar di overlay
    // bukan di dalam card (card sudah stopPropagation)
    // Jika dipanggil dari tombol Batal (event = null), langsung tutup
    var modal = document.getElementById('identitasUlasanModal');
    if (!modal) return;
    modal.style.display = 'none';
}

// Dipanggil setelah user memilih opsi identitas di modal
async function submitUlasanFinal(tampilkanIdentitas) {
    var modal = document.getElementById('identitasUlasanModal');
    if (modal) modal.style.display = 'none';

    if (!_ulasanPendingData) return;
    var { komentar, rating, profileName, profileAvatar } = _ulasanPendingData;
    _ulasanPendingData = null;

    var nama;
    var avatar_url;
    if (tampilkanIdentitas && profileName) {
        nama       = profileName;
        avatar_url = profileAvatar || '';
    } else {
        nama       = 'Anonim';
        avatar_url = '';
    }

    var btn = document.querySelector('button[onclick="kirimUlasan()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }

    try {
        var insertData = { nama, rating, komentar };
        if (avatar_url) insertData.avatar_url = avatar_url;

        var { error } = await _supabase.from('ulasan').insert([insertData]);
        if (error) throw error;

        document.getElementById('ulasanKomentar').value = '';
        setRating(0);
        showToast('Ulasan berhasil dikirim! Terima kasih ');
        await loadUlasan();
    } catch (err) {
        console.error('Gagal kirim ulasan:', err);
        var local = JSON.parse(localStorage.getItem('ulasan_lokal') || '[]');
        local.unshift({ nama, rating, komentar, avatar_url, created_at: new Date().toISOString() });
        localStorage.setItem('ulasan_lokal', JSON.stringify(local.slice(0, 50)));
        document.getElementById('ulasanKomentar').value = '';
        setRating(0);
        showToast('Ulasan tersimpan!');
        renderUlasan(local);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Kirim Ulasan'; }
    }
}

// 
// PROFIL DEVELOPER
// 
var _devData = {
    joel: {
        name:   'Joel Larry Junior Rondonuwu',
        inisial: 'J',
        color:  '#2563eb',
        banner: 'from-blue-500 to-blue-700',
        role:   'Mahasiswa Sistem Informasi — Universitas Mercu Buana',
        bio:    'Halo! Saya seorang developer pemula yang sedang aktif belajar dan mengembangkan keterampilan di dunia pemrograman. Saat ini saya fokus memahami dasar-dasar pengembangan web dan terus mencoba berbagai proyek kecil untuk meningkatkan kemampuan. Saya percaya proses belajar adalah perjalanan panjang, dan saya siap berkembang selangkah demi selangkah.',
        skills: ['HTML', 'CSS', 'JavaScript'],
        hobi:   'Olahraga',
        github: 'https://github.com/ManusiaBaruuu14-sketch',
        ig:     'https://www.instagram.com/rndnwujoel?igsh=OTZidXU2ZGtkOHg=',
        igName: '@rndnwujoel',
        email:  'joeljuniorjoel@gmail.com',
    },
    rio: {
        name:   'Rio Sadewa',
        inisial: 'R',
        color:  '#4338ca',
        banner: 'from-indigo-500 to-indigo-700',
        role:   'Mahasiswa Sistem Informasi — Universitas Mercu Buana',
        bio:    'Hai, terima kasih sudah berkunjung! Saya masih dalam tahap awal sebagai developer, tapi punya semangat besar untuk terus belajar dan berkembang. Saya tertarik mengeksplorasi teknologi baru, membangun proyek sederhana, dan memperbaiki diri dari setiap kesalahan. Ke depan, saya ingin menjadi developer yang tidak hanya bisa coding, tapi juga memberi solusi nyata.',
        skills: ['HTML', 'CSS', 'JavaScript'],
        hobi:   'Musik',
        github: 'https://github.com/sadewsws',
        ig:     'https://www.instagram.com/riosdwaa?igsh=NG82dnFuMm5yYzJ3&utm_source=qr',
        igName: '@riosdwaa',
        email:  'sadwwario@gmail.com',
    },
    gibran: {
        name:   'Raya Gibran Bachtiar',
        inisial: 'R',
        color:  '#7c3aed',
        banner: 'from-violet-500 to-violet-700',
        role:   'Mahasiswa Sistem Informasi — Universitas Mercu Buana',
        bio:    'Selamat datang di halaman saya! Saya adalah developer pemula yang sedang berproses memahami dunia teknologi. Saat ini saya terus belajar, mencoba, dan mengembangkan skill melalui berbagai pengalaman kecil. Bagi saya, konsistensi lebih penting daripada kesempurnaan, dan saya berkomitmen untuk terus berkembang menjadi lebih baik setiap harinya.',
        skills: ['HTML', 'CSS', 'JavaScript'],
        hobi:   'Olahraga',
        github: 'https://github.com/rayagibranbachtiar-ai',
        ig:     'https://www.instagram.com/ryagibran?igsh=ZjZoZjR4aHo2MWNv',
        igName: '@ryagibran',
        email:  'rayagibranbachtiar@gmail.com',
    }
};

function bukaProfilDeveloper(id) {
    var dev = _devData[id];
    if (!dev) return;

    // Isi data
    document.getElementById('devProfileName').textContent  = dev.name;
    document.getElementById('devProfileRole').textContent  = dev.role;
    document.getElementById('devProfileBio').textContent   = dev.bio;
    document.getElementById('devProfileHobi').textContent  = dev.hobi;

    // Avatar
    var avatar = document.getElementById('devProfileAvatar');
    avatar.textContent = dev.inisial;
    avatar.style.background = dev.color;

    // Banner
    var banner = document.getElementById('devProfileBanner');
    banner.className = 'h-24 bg-gradient-to-r ' + dev.banner;

    // Skills
    var skillsEl = document.getElementById('devProfileSkills');
    skillsEl.innerHTML = dev.skills.map(function(s) {
        return '<span class="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">' + s + '</span>';
    }).join('');

    // Links
    document.getElementById('devProfileGithub').href = dev.github;
    document.getElementById('devProfileIG').href     = dev.ig;
    document.getElementById('devProfileEmail').href  = 'mailto:' + dev.email + '?subject=Halo%20dari%20WargaBantuWarga';

    showPage('devProfilePage');
}

async function loadUlasan() {
    var listEl = document.getElementById('ulasanList');
    if (!listEl) return;

    try {
        var { data, error } = await _supabase
            .from('ulasan')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(30);

        if (error) throw error;

        // Gabung dengan localStorage fallback
        var local = JSON.parse(localStorage.getItem('ulasan_lokal') || '[]');
        var combined = (data || []).concat(local);
        // Deduplicate by created_at
        renderUlasan(combined);
    } catch (err) {
        // Tampilkan dari localStorage saja
        var local = JSON.parse(localStorage.getItem('ulasan_lokal') || '[]');
        renderUlasan(local);
    }
}

function renderUlasan(data) {
    var listEl = document.getElementById('ulasanList');
    if (!listEl) return;

    if (!data || data.length === 0) {
        listEl.innerHTML = '<div class="text-center py-8 text-slate-400 text-sm">Belum ada ulasan. Jadilah yang pertama! </div>';
        return;
    }

    var avgRating = (data.reduce(function(s, u) { return s + (u.rating || 0); }, 0) / data.length).toFixed(1);
    var stars = function(r) {
        return [1,2,3,4,5].map(function(i) {
            return '<span style="color:' + (i <= r ? '#f59e0b' : '#cbd5e1') + '"></span>';
        }).join('');
    };
    var timeAgo = function(iso) {
        var d = new Date(iso);
        var diff = Math.floor((Date.now() - d) / 1000);
        if (diff < 60) return 'baru saja';
        if (diff < 3600) return Math.floor(diff/60) + ' menit lalu';
        if (diff < 86400) return Math.floor(diff/3600) + ' jam lalu';
        return Math.floor(diff/86400) + ' hari lalu';
    };

    listEl.innerHTML =
        // Ringkasan rating
        '<div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-3 flex items-center gap-4">' +
            '<div class="text-center">' +
                '<p class="text-4xl font-extrabold text-slate-800">' + avgRating + '</p>' +
                '<div class="text-xl my-1">' + stars(Math.round(parseFloat(avgRating))) + '</div>' +
                '<p class="text-xs text-slate-400">' + data.length + ' ulasan</p>' +
            '</div>' +
            '<div class="flex-1 space-y-1">' +
                [5,4,3,2,1].map(function(r) {
                    var count = data.filter(function(u) { return u.rating === r; }).length;
                    var pct = data.length ? Math.round(count/data.length*100) : 0;
                    return '<div class="flex items-center gap-2 text-xs">' +
                        '<span class="text-yellow-400 w-3">' + r + '</span>' +
                        '<span class="text-yellow-400 text-sm"></span>' +
                        '<div class="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">' +
                            '<div class="bg-yellow-400 h-1.5 rounded-full" style="width:' + pct + '%"></div>' +
                        '</div>' +
                        '<span class="text-slate-400 w-6 text-right">' + count + '</span>' +
                    '</div>';
                }).join('') +
            '</div>' +
        '</div>' +
        // Kartu ulasan
        data.map(function(u) {
            var inisial = (u.nama || 'A').charAt(0).toUpperCase();
            var colors = ['#2563eb','#7c3aed','#db2777','#059669','#d97706'];
            var color = colors[inisial.charCodeAt(0) % colors.length];
            var avatarHtml = u.avatar_url
                ? '<img src="' + u.avatar_url + '" style="width:40px;height:40px;border-radius:12px;object-fit:cover;flex-shrink:0;border:2px solid #e2e8f0;">'
                : '<div style="width:40px;height:40px;border-radius:12px;background:' + color + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:16px;">' + inisial + '</div>';
            var anonimBadge = (u.nama === 'Anonim')
                ? '<span style="font-size:10px;background:#f1f5f9;color:#94a3b8;padding:2px 6px;border-radius:6px;margin-left:6px;font-weight:600;">Anonim</span>'
                : '';
            return '<div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">' +
                '<div class="flex items-start gap-3">' +
                    avatarHtml +
                    '<div class="flex-1 min-w-0">' +
                        '<div class="flex items-center justify-between">' +
                            '<p class="font-bold text-slate-800 text-sm">' + (u.nama || 'Anonim') + anonimBadge + '</p>' +
                            '<span class="text-xs text-slate-400">' + timeAgo(u.created_at) + '</span>' +
                        '</div>' +
                        '<div class="my-1">' + stars(u.rating) + '</div>' +
                        '<p class="text-sm text-slate-600 leading-relaxed">' + (u.komentar || '') + '</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
}

// Load ulasan ketika halaman kontak dibuka
var _ulasanLoaded = false;
var _origShowPage = typeof showPage === 'function' ? showPage : null;

function checkSession() {
    const user = JSON.parse(localStorage.getItem("activeUser"));
    const authStatus = document.getElementById("authStatus");

    if (!authStatus) return;

    if (user) {
        // Jika sudah login
        authStatus.innerHTML = `
            <button onclick="handleLogout()" class="text-sm font-bold text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl transition">Keluar
            </button>`;
    } else {
        // Jika belum login (Gunakan kode ini agar tampilan konsisten)
        authStatus.innerHTML = `
            <button onclick="showPage('loginPage')" class="px-4 py-2 text-sm font-bold text-slate-600 hover:text-blue-600 transition rounded-xl">
                Masuk
            </button>
            <button onclick="showPage('registerPage')" class="px-5 py-2 text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition rounded-xl shadow-md">Daftar
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
// 
// FITUR DUAL ROLE: PENYEDIA JASA & PENCARI KEBUTUHAN
// 

// Peran aktif di dashboard (disimpan di localStorage per sesi)
var _activeRole = localStorage.getItem('_dashRole') || 'penjasa';

function switchRole(role) {
    _activeRole = role;
    localStorage.setItem('_dashRole', role);
    renderDashboardRole();
}

function renderDashboardRole() {
    var panelPenyedia    = document.getElementById('panelPenyedia');
    var panelPencari     = document.getElementById('panelPencari');
    var btnPenyedia      = document.getElementById('btnRolePenyedia');
    var btnPencari       = document.getElementById('btnRolePencari');
    var roleDesc         = document.getElementById('dashRoleDesc');
    var statusToko       = document.getElementById('btnStatusToko');
    var dashPenyediaStats= document.getElementById('dashPenyediaStats');
    var dashPencariStats = document.getElementById('dashPencariStats');

    // Panel penyedia-only yang hidup di luar panelPenyedia
    var penyediaPanelIds = ['dashPesanan','dashKatalog','dashKeuangan','dashReviewer','dashProyek'];

    if (!panelPenyedia || !panelPencari) return;

    if (_activeRole === 'penjasa') {
        panelPenyedia.classList.remove('hidden');
        panelPencari.classList.add('hidden');
        // Panel penyedia di luar: tampilkan sesuai tab aktif (jangan paksa show semua)
        // Cukup pastikan tidak tersembunyi karena role switch
        if (dashPenyediaStats) dashPenyediaStats.classList.remove('hidden');
        if (dashPencariStats)  dashPencariStats.classList.add('hidden');
        // Sembunyikan panel pengeluaran pencari
        var dashPeng = document.getElementById('dashPengeluaran');
        if (dashPeng) dashPeng.classList.add('hidden');
        btnPenyedia.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-blue-600 text-white shadow';
        btnPencari.className  = 'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-500 hover:bg-slate-50';
        if (roleDesc) roleDesc.textContent = 'Mode Penyedia Jasa — kelola katalog dan terima pesanan';        if (statusToko) statusToko.style.display = '';
        // Pastikan dashPesanan tampil (default tab penjasa)
        showDashTab('pesanan');
        setTimeout(loadRiwayatJasaBadge, 300);
    } else {
        panelPenyedia.classList.add('hidden');
        panelPencari.classList.remove('hidden');
        // Sembunyikan SEMUA panel khusus penyedia
        penyediaPanelIds.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        if (dashPenyediaStats) dashPenyediaStats.classList.add('hidden');
        if (dashPencariStats)  dashPencariStats.classList.remove('hidden');
        btnPencari.className  = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-blue-600 text-white shadow';
        btnPenyedia.className = 'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-500 hover:bg-slate-50';
        if (roleDesc) roleDesc.textContent = 'Mode Butuh Jasa — posting kebutuhan dan terima lamaran';
        if (statusToko) statusToko.style.display = 'none';
        loadMyKebutuhan();
        loadStatPencari();
        // Pre-load badge lamaran masuk
        setTimeout(loadRiwayatApplyBadge, 200);
    }
}

// Jalankan renderDashboardRole setiap showPage('dashboard')
var _origShowPage_role = typeof showPage === 'function' ? showPage : null;
(function() {
    var _orig = showPage;
    showPage = function(id) {
        _orig(id);
        if (id === 'dashboard') {
            setTimeout(function() {
                renderDashboardRole();
                // Refresh badge proyek
                hitungPostinganBaru();
            }, 50);
        }
        if (id === 'marketplace') {
            // Reset ke tab jasa saat pertama buka, update badge kebutuhan
            setTimeout(function() {
                hitungKebutuhanBadge();
            }, 50);
        }
    };
})();

//  FORM KEBUTUHAN TOGGLE 
function toggleFormKebutuhan() {
    var wrapper = document.getElementById('formKebutuhanWrapper');
    var icon    = document.getElementById('btnFormKebutuhanIcon');
    var label   = document.getElementById('btnFormKebutuhanLabel');
    if (!wrapper) return;
    var isHidden = wrapper.classList.contains('hidden');
    wrapper.classList.toggle('hidden', !isHidden);
    if (isHidden) {
        icon.textContent  = '';
        label.textContent = 'Tutup';
    } else {
        icon.textContent  = '+';
        label.textContent = 'Buat Postingan';
        // Reset edit mode ketika form ditutup
        _resetEditMode();
        ['kbJudul','kbKategori','kbBudget','kbLokasi','kbDeskripsi'].forEach(function(id){
            var el = document.getElementById(id); if (el) el.value = '';
        });
    }
}

//  VARIABEL EDIT MODE KEBUTUHAN 
var _editingKebutuhanId = null;

// Isi form dengan data kebutuhan yang mau diedit
function editKebutuhan(k) {
    if (typeof k === 'string') { try { k = JSON.parse(k); } catch(e) { return; } }
    _editingKebutuhanId = k.id;

    // Isi semua field
    var jd = document.getElementById('kbJudul');
    var kt = document.getElementById('kbKategori');
    var bg = document.getElementById('kbBudget');
    var lk = document.getElementById('kbLokasi');
    var ds = document.getElementById('kbDeskripsi');

    if (jd) jd.value = k.judul     || '';
    if (kt) kt.value = k.kategori  || '';
    if (bg) bg.value = k.budget    || '';
    if (lk) lk.value = k.lokasi    || '';
    if (ds) ds.value = k.deskripsi || '';

    // Ubah tombol submit menjadi "Simpan Perubahan"
    var btnSubmit = document.querySelector('button[onclick="submitKebutuhan()"]');
    if (btnSubmit) { btnSubmit.textContent = 'Simpan Perubahan'; btnSubmit.classList.replace('bg-blue-600','bg-orange-500'); btnSubmit.classList.replace('hover:bg-blue-700','hover:bg-orange-600'); }

    // Ubah label header form
    var formTitle = document.querySelector('#formKebutuhanWrapper h4');
    if (formTitle) formTitle.textContent = ' Edit Kebutuhan';

    // Buka form jika belum terbuka
    var wrapper = document.getElementById('formKebutuhanWrapper');
    if (wrapper && wrapper.classList.contains('hidden')) toggleFormKebutuhan();

    // Scroll ke form
    if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Reset edit mode
function _resetEditMode() {
    _editingKebutuhanId = null;
    var btnSubmit = document.querySelector('button[onclick="submitKebutuhan()"]');
    if (btnSubmit) {
        btnSubmit.textContent = 'Posting Kebutuhan';
        btnSubmit.classList.replace('bg-orange-500','bg-blue-600');
        btnSubmit.classList.replace('hover:bg-orange-600','hover:bg-blue-700');
    }
    var formTitle = document.querySelector('#formKebutuhanWrapper h4');
    if (formTitle) formTitle.textContent = 'Detail Kebutuhan';
}

//  SUBMIT POSTINGAN KEBUTUHAN (CREATE & UPDATE) 
async function submitKebutuhan() {
    if (!activeUser) return alert('Silakan login terlebih dahulu!');

    var judul    = (document.getElementById('kbJudul')?.value     || '').trim();
    var kategori = (document.getElementById('kbKategori')?.value  || '').trim();
    var budget   = parseInt(document.getElementById('kbBudget')?.value   || '0') || null;
    var lokasi   = (document.getElementById('kbLokasi')?.value    || '').trim();
    var deskripsi= (document.getElementById('kbDeskripsi')?.value || '').trim();

    if (!judul)    return alert('Judul kebutuhan wajib diisi!');
    if (!kategori) return alert('Pilih kategori terlebih dahulu!');
    if (!deskripsi)return alert('Deskripsi kebutuhan wajib diisi!');

    var btn = document.querySelector('button[onclick="submitKebutuhan()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

    try {
        //  MODE EDIT 
        if (_editingKebutuhanId) {
            var { error } = await _supabase.from('kebutuhan').update({
                judul, kategori, budget, lokasi, deskripsi
            }).eq('id', _editingKebutuhanId).eq('user_id', activeUser.id);
            if (error) throw error;

            // Hapus juga dari localStorage jika ada
            var local = JSON.parse(localStorage.getItem('kebutuhan_lokal') || '[]').map(function(k) {
                return String(k.id) === String(_editingKebutuhanId)
                    ? Object.assign({}, k, { judul, kategori, budget, lokasi, deskripsi })
                    : k;
            });
            localStorage.setItem('kebutuhan_lokal', JSON.stringify(local));

            _resetEditMode();
            // Reset field
            ['kbJudul','kbKategori','kbBudget','kbLokasi','kbDeskripsi'].forEach(function(id){
                var el = document.getElementById(id); if (el) el.value = '';
            });
            toggleFormKebutuhan();
            showToast('Postingan berhasil diperbarui!');
            await loadMyKebutuhan();
            return;
        }

        //  MODE CREATE 
        var { error } = await _supabase.from('kebutuhan').insert([{
            user_id: activeUser.id,
            judul, kategori, budget, lokasi, deskripsi,
            status: 'open'
        }]);
        if (error) throw error;

        // Reset form
        ['kbJudul','kbKategori','kbBudget','kbLokasi','kbDeskripsi'].forEach(function(id){
            var el = document.getElementById(id); if (el) el.value = '';
        });
        toggleFormKebutuhan();
        showToast('Postingan kebutuhan berhasil dibuat!');
        await loadMyKebutuhan();

    } catch(err) {
        console.error('Gagal submit kebutuhan:', err);
        if (_editingKebutuhanId) {
            // Fallback edit di localStorage
            var local2 = JSON.parse(localStorage.getItem('kebutuhan_lokal') || '[]').map(function(k) {
                return String(k.id) === String(_editingKebutuhanId)
                    ? Object.assign({}, k, { judul, kategori, budget, lokasi, deskripsi })
                    : k;
            });
            localStorage.setItem('kebutuhan_lokal', JSON.stringify(local2));
            _resetEditMode();
            toggleFormKebutuhan();
            showToast('Perubahan disimpan lokal.');
            loadMyKebutuhan();
        } else {
            // Fallback create ke localStorage
            var localArr = JSON.parse(localStorage.getItem('kebutuhan_lokal') || '[]');
            localArr.unshift({ id: Date.now(), user_id: activeUser.id, judul, kategori, budget, lokasi, deskripsi, status:'open', created_at: new Date().toISOString() });
            localStorage.setItem('kebutuhan_lokal', JSON.stringify(localArr.slice(0, 30)));
            toggleFormKebutuhan();
            showToast('Postingan disimpan lokal!');
            renderMyKebutuhan(localArr.filter(function(k){ return k.user_id === activeUser.id; }));
        }
    } finally {
        if (btn) { btn.disabled = false; }
        if (!_editingKebutuhanId) {
            if (btn) { btn.textContent = 'Posting Kebutuhan'; }
        }
    }
}

//  LOAD POSTINGAN MILIK USER (PENCARI) 
async function loadMyKebutuhan() {
    if (!activeUser) return;
    try {
        var { data, error } = await _supabase
            .from('kebutuhan')
            .select('*')
            .eq('user_id', activeUser.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        renderMyKebutuhan(data || []);
    } catch(err) {
        var local = JSON.parse(localStorage.getItem('kebutuhan_lokal') || '[]')
            .filter(function(k){ return k.user_id === activeUser.id; });
        renderMyKebutuhan(local);
    }
}

function renderMyKebutuhan(list) {
    var el = document.getElementById('myKebutuhanList');
    if (!el) return;
    if (!list || list.length === 0) {
        el.innerHTML = '<div class="text-center py-12 text-slate-400"><p class="text-4xl mb-3"></p><p class="font-semibold">Belum ada postingan kebutuhan</p><p class="text-sm mt-1">Klik "Buat Postingan" untuk mulai</p></div>';
        return;
    }
    el.innerHTML = list.map(function(k) {
        var isOpen    = k.status === 'open';
        var isClosed  = k.status === 'closed';

        var statusColor = isOpen
            ? 'bg-green-50 text-green-700 border-green-200'
            : isClosed
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-slate-100 text-slate-500 border-slate-200';
        var statusLabel = isOpen ? 'Terbuka' : isClosed ? 'Selesai' : 'Ditutup';
        var budget  = k.budget ? 'Rp ' + Number(k.budget).toLocaleString('id-ID') : 'Fleksibel';
        var timeAgo = _timeAgo(k.created_at);

        // Tombol aksi — edit & hapus hanya untuk postingan open
        var editBtn   = isOpen
            ? '<button onclick="editKebutuhan(' + JSON.stringify(k).replace(/"/g,'&quot;') + ')" ' +
              'class="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition">' +
              '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
              'Edit</button>'
            : '';
        var hapusBtn  =
            '<button onclick="hapusKebutuhan(\'' + k.id + '\')" ' +
            'class="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl transition">' +
            '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
            'Hapus</button>';

        return '<div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ' + (isClosed ? 'border-purple-100' : '') + '">' +
            '<div class="flex items-start justify-between gap-3 mb-3">' +
                '<div class="flex-1 min-w-0">' +
                    '<div class="flex items-center gap-2 mb-1.5 flex-wrap">' +
                        '<span class="text-xs font-bold px-2.5 py-0.5 rounded-full border ' + statusColor + '">' + statusLabel + '</span>' +
                        '<span class="text-xs text-slate-400">' + timeAgo + '</span>' +
                    '</div>' +
                    '<h4 class="font-bold text-slate-800 text-sm leading-snug">' + escHtml(k.judul) + '</h4>' +
                '</div>' +
                '<div class="flex gap-1.5 flex-shrink-0">' + editBtn + hapusBtn + '</div>' +
            '</div>' +
            '<p class="text-xs text-slate-500 leading-relaxed mb-3">' + escHtml(k.deskripsi) + '</p>' +
            '<div class="flex items-center gap-3 text-xs text-slate-400 flex-wrap">' +
                '<span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">' + (k.kategori || '') + '</span>' +
                (k.lokasi ? '<span> ' + escHtml(k.lokasi) + '</span>' : '') +
                '<span>' + budget + '</span>' +
            '</div>' +
            (isOpen
                ? '<div id="applicants-' + k.id + '" class="mt-3 border-t pt-3 text-xs text-slate-400">Memuat pelamar...</div>'
                : '<div class="mt-3 border-t pt-3 text-xs text-purple-500 font-semibold"> Pekerjaan ini sudah selesai dan tercatat di pengeluaran</div>') +
        '</div>';
    }).join('');

    // Load applicants hanya untuk yang masih open
    list.forEach(function(k) { if (k.status === 'open') loadApplicants(k.id); });
}

//  LOAD POSTINGAN UNTUK PENYEDIA (CARI PROYEK) 
async function loadPostinganKebutuhan() {
    var el = document.getElementById('proyekList');
    if (!el) return;
    var kategoriFilter = document.getElementById('proyekCategoryFilter')?.value || 'semua';

    el.innerHTML = '<p class="text-slate-400 italic col-span-2 text-center py-8">Memuat postingan...</p>';

    try {
        var query = _supabase.from('kebutuhan').select('*, profiles(username, avatar_url)').eq('status', 'open').order('created_at', { ascending: false });
        if (kategoriFilter !== 'semua') query = query.eq('kategori', kategoriFilter);
        var { data, error } = await query;
        if (error) throw error;
        renderProyekList(data || []);
    } catch(err) {
        console.error('Gagal load kebutuhan:', err);
        var local = JSON.parse(localStorage.getItem('kebutuhan_lokal') || '[]').filter(function(k){ return k.status === 'open'; });
        renderProyekList(local);
    }
}

function renderProyekList(list) {
    var el = document.getElementById('proyekList');
    if (!el) return;
    if (!list || list.length === 0) {
        el.innerHTML = '<div class="text-center py-12 text-slate-400 col-span-2"><p class="text-4xl mb-3"></p><p class="font-semibold">Belum ada postingan kebutuhan</p><p class="text-sm mt-1">Coba lagi nanti atau pilih kategori lain</p></div>';
        return;
    }
    el.innerHTML = list.map(function(k) {
        var profile = k.profiles || {};
        var posterName = profile.username || 'Pengguna';
        var avatar = profile.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(posterName) + '&background=dbeafe&color=2563eb&bold=true&size=64');
        var budget = k.budget ? 'Rp ' + Number(k.budget).toLocaleString('id-ID') : 'Fleksibel';
        var timeAgo = _timeAgo(k.created_at);
        var alreadyApplied = _hasApplied(k.id);
        return '<div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">' +
            '<div class="flex items-center gap-3">' +
                '<img src="' + avatar + '" class="w-10 h-10 rounded-xl object-cover border border-slate-100">' +
                '<div class="flex-1 min-w-0">' +
                    '<p class="font-bold text-slate-800 text-sm">' + escHtml(posterName) + '</p>' +
                    '<p class="text-xs text-slate-400">' + timeAgo + '</p>' +
                '</div>' +
                '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">' + (k.kategori || '') + '</span>' +
            '</div>' +
            '<div>' +
                '<h4 class="font-bold text-slate-800 text-sm mb-1">' + escHtml(k.judul) + '</h4>' +
                '<p class="text-xs text-slate-500 leading-relaxed">' + escHtml(k.deskripsi) + '</p>' +
            '</div>' +
            '<div class="flex items-center gap-3 text-xs text-slate-400">' +
                (k.lokasi ? '<span> ' + escHtml(k.lokasi) + '</span>' : '') +
                '<span>' + budget + '</span>' +
            '</div>' +
            '<button onclick="applyKebutuhan(\'' + k.id + '\', \'' + escHtml(k.user_id) + '\')" ' +
                (alreadyApplied ? 'disabled class="w-full py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-400 cursor-not-allowed">' +
                    'Sudah Apply' :
                    'class="w-full py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm">' +
                    'Apply Sekarang') +
            '</button>' +
        '</div>';
    }).join('');

    // Update badge
    hitungPostinganBaru();
}

//  APPLY KE POSTINGAN 
var _appliedSet = JSON.parse(localStorage.getItem('_applied') || '[]');

function _hasApplied(kebutuhanId) {
    return _appliedSet.indexOf(String(kebutuhanId)) !== -1;
}

async function applyKebutuhan(kebutuhanId, ownerId) {
    if (!activeUser) return alert('Login dulu untuk apply!');
    if (activeUser.id === ownerId) return alert('Kamu tidak bisa apply ke postingan sendiri!');
    if (_hasApplied(kebutuhanId)) return;

    try {
        // Simpan apply ke tabel aplikasi (jika ada), fallback chat
        var { error } = await _supabase.from('aplikasi_kebutuhan').insert([{
            kebutuhan_id: kebutuhanId,
            penyedia_id:  activeUser.id,
            status:       'pending'
        }]);
        // Abaikan error jika tabel belum ada — tetap buka chat
    } catch(e) {}

    // Tandai sudah apply
    _appliedSet.push(String(kebutuhanId));
    localStorage.setItem('_applied', JSON.stringify(_appliedSet));

    // Langsung buka chat dengan pemilik postingan
    var rp = await _supabase.from('profiles').select('username').eq('id', ownerId).maybeSingle();
    var partnerName = rp?.data?.username || 'Pengguna';
    bukaChat(ownerId, partnerName);
    showToast('Apply berhasil! Chat dengan ' + partnerName + ' sudah terbuka.');

    // Re-render agar tombol berubah
    loadPostinganKebutuhan();
}

//  LOAD APPLICANTS UNTUK PEMILIK POSTINGAN 
async function loadApplicants(kebutuhanId) {
    var el = document.getElementById('applicants-' + kebutuhanId);
    if (!el) return;
    try {
        var { data, error } = await _supabase
            .from('aplikasi_kebutuhan')
            .select('*, profiles(username, avatar_url)')
            .eq('kebutuhan_id', kebutuhanId);
        if (error) throw error;
        if (!data || data.length === 0) {
            el.innerHTML = 'Belum ada yang apply';
            return;
        }
        el.innerHTML = '<p class="font-semibold text-slate-600 mb-2">' + data.length + ' Pelamar:</p>' +
            '<div class="flex flex-wrap gap-2">' +
            data.map(function(a) {
                var p = a.profiles || {};
                var nm = p.username || 'User';
                var av = p.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(nm) + '&background=dbeafe&color=2563eb&bold=true&size=64');
                return '<button onclick="bukaChat(\'' + a.penyedia_id + '\', \'' + nm + '\')" ' +
                    'class="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-semibold transition">' +
                    '<img src="' + av + '" class="w-5 h-5 rounded-full object-cover">' +
                    '@' + nm +
                    '</button>';
            }).join('') +
            '</div>';
    } catch(e) {
        el.innerHTML = 'Belum ada yang apply';
    }
}

//  HAPUS POSTINGAN KEBUTUHAN 
async function hapusKebutuhan(id) {
    if (!confirm('Hapus postingan ini?')) return;
    try {
        await _supabase.from('kebutuhan').delete().eq('id', id).eq('user_id', activeUser.id);
    } catch(e) {}
    // Hapus dari localStorage juga
    var local = JSON.parse(localStorage.getItem('kebutuhan_lokal') || '[]').filter(function(k){ return String(k.id) !== String(id); });
    localStorage.setItem('kebutuhan_lokal', JSON.stringify(local));
    showToast('Postingan dihapus.');
    loadMyKebutuhan();
}

//  BADGE PROYEK BARU 
async function hitungPostinganBaru() {
    try {
        var { count } = await _supabase.from('kebutuhan').select('*', { count: 'exact', head: true }).eq('status', 'open');
        var badge = document.getElementById('proyekBadgeTab');
        if (badge) {
            if (count && count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch(e) {}
}

//  BADGE KEBUTUHAN DI MARKETPLACE 
async function hitungKebutuhanBadge() {
    try {
        var { count } = await _supabase.from('kebutuhan').select('*', { count: 'exact', head: true }).eq('status', 'open');
        var badge = document.getElementById('kebutuhanBadge');
        if (badge) {
            if (count && count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch(e) {}
}

//  HELPER 
function _timeAgo(iso) {
    if (!iso) return '';
    var diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)   return 'baru saja';
    if (diff < 3600) return Math.floor(diff/60) + ' menit lalu';
    if (diff < 86400)return Math.floor(diff/3600) + ' jam lalu';
    return Math.floor(diff/86400) + ' hari lalu';
}

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 
// MARKETPLACE DUAL TAB: JASA & BUTUH JASA (KEBUTUHAN)
// 

var _mktActiveTab      = 'jasa';
var _selectedKebCat    = 'semua';
var _allKebutuhanData  = [];   // cache untuk filter client-side

function showMarketplaceTab(tab) {
    _mktActiveTab = tab;
    var panelJasa = document.getElementById('panelMarketJasa');
    var panelKeb  = document.getElementById('panelMarketKebutuhan');
    var btnJasa   = document.getElementById('tabJasaBtn');
    var btnKeb    = document.getElementById('tabKebutuhanBtn');

    if (tab === 'jasa') {
        if (panelJasa) panelJasa.classList.remove('hidden');
        if (panelKeb)  panelKeb.classList.add('hidden');
        if (btnJasa) btnJasa.className = 'px-5 py-2.5 rounded-xl text-sm font-bold transition bg-blue-600 text-white shadow';
        if (btnKeb)  btnKeb.className  = 'px-5 py-2.5 rounded-xl text-sm font-bold transition text-slate-500 hover:bg-slate-50';
    } else {
        if (panelJasa) panelJasa.classList.add('hidden');
        if (panelKeb)  panelKeb.classList.remove('hidden');
        if (btnKeb)  btnKeb.className  = 'px-5 py-2.5 rounded-xl text-sm font-bold transition bg-blue-600 text-white shadow';
        if (btnJasa) btnJasa.className = 'px-5 py-2.5 rounded-xl text-sm font-bold transition text-slate-500 hover:bg-slate-50';
        loadKebutuhanPublic();
    }
}

function toggleKebCategoryModal() {
    document.getElementById('kebCategoryModal').classList.toggle('hidden');
}

function selectKebCategory(cat) {
    _selectedKebCat = cat;
    var label = document.getElementById('currentKebCatText');
    if (label) label.textContent = cat === 'semua' ? 'Semua Kategori' : cat;
    // Update pill styles
    document.querySelectorAll('[id^="kebPill-"]').forEach(function(btn) {
        var btnCat = btn.id.replace('kebPill-','');
        btn.classList.toggle('active', btnCat === cat);
    });
    toggleKebCategoryModal();
    filterKebutuhanPublic();
}

function filterKebutuhanPublic() {
    var q    = (document.getElementById('searchKebutuhan')?.value || '').toLowerCase();
    var sort = document.getElementById('sortKebutuhan')?.value || 'terbaru';
    var cat  = _selectedKebCat;

    var filtered = _allKebutuhanData.filter(function(k) {
        var matchCat  = cat === 'semua' || k.kategori === cat;
        var matchQ    = !q || (k.judul||'').toLowerCase().includes(q) || (k.lokasi||'').toLowerCase().includes(q) || (k.deskripsi||'').toLowerCase().includes(q);
        return matchCat && matchQ;
    });

    // Sort
    if (sort === 'budget_tertinggi') {
        filtered.sort(function(a,b){ return (Number(b.budget)||0) - (Number(a.budget)||0); });
    } else if (sort === 'budget_terendah') {
        filtered.sort(function(a,b){ return (Number(a.budget)||0) - (Number(b.budget)||0); });
    } else {
        filtered.sort(function(a,b){ return new Date(b.created_at) - new Date(a.created_at); });
    }

    renderKebutuhanPublic(filtered);
}

// Load semua postingan kebutuhan untuk tab publik di marketplace
async function loadKebutuhanPublic() {
    var el = document.getElementById('mktKebutuhanList');
    if (!el) return;
    el.innerHTML = '<p class="text-slate-400 italic col-span-3 text-center py-10"><span class="inline-block animate-spin mr-2"></span>Memuat postingan...</p>';

    try {
        // Query tanpa join profiles — lebih aman lintas setup Supabase
        var { data: kebutuhanData, error } = await _supabase
            .from('kebutuhan')
            .select('*')
            .eq('status', 'open')
            .order('created_at', { ascending: false });

        if (error) throw error;
        var list = kebutuhanData || [];

        // Ambil data profiles secara terpisah
        if (list.length > 0) {
            var userIds = [...new Set(list.map(function(k){ return k.user_id; }))];
            var rp = await _supabase.from('profiles').select('id, username, avatar_url').in('id', userIds);
            var profMap = {};
            (rp.data || []).forEach(function(p){ profMap[p.id] = p; });
            list = list.map(function(k){ return Object.assign({}, k, { _profile: profMap[k.user_id] || {} }); });
        }

        // Filter: sembunyikan yang sudah di-apply oleh user ini
        list = list.filter(function(k){ return !_hasApplied(k.id); });

        // Simpan ke cache
        _allKebutuhanData = list;

        // Update badge
        var badge = document.getElementById('kebutuhanBadge');
        if (badge) {
            badge.textContent  = list.length;
            badge.classList.toggle('hidden', list.length === 0);
        }

        filterKebutuhanPublic();

    } catch(err) {
        console.error('loadKebutuhanPublic error:', err);
        // Fallback ke localStorage
        var local = JSON.parse(localStorage.getItem('kebutuhan_lokal') || '[]')
            .filter(function(k){ return k.status === 'open' && !_hasApplied(k.id); });
        _allKebutuhanData = local;
        filterKebutuhanPublic();
    }
}

function renderKebutuhanPublic(list) {
    var el = document.getElementById('mktKebutuhanList');
    if (!el) return;

    if (!list || list.length === 0) {
        el.innerHTML = '<div class="text-center py-14 text-slate-400 col-span-3"><p class="text-5xl mb-4"></p><p class="font-semibold">Belum ada postingan kebutuhan</p><p class="text-sm mt-1">Coba pilih kategori lain atau cek lagi nanti</p></div>';
        return;
    }

    var katColors = {
        'Elektronik':'bg-blue-50 text-blue-600 border-blue-100',
        'Transportasi':'bg-sky-50 text-sky-600 border-sky-100',
        'Pertukangan':'bg-yellow-50 text-yellow-700 border-yellow-100',
        'Kebersihan':'bg-green-50 text-green-700 border-green-100',
        'Kuliner':'bg-red-50 text-red-600 border-red-100',
        'Edukasi':'bg-orange-50 text-orange-600 border-orange-100',
        'Kesehatan':'bg-pink-50 text-pink-600 border-pink-100',
        'Kecantikan':'bg-purple-50 text-purple-600 border-purple-100',
        'Hewan':'bg-amber-50 text-amber-600 border-amber-100',
        'Fotografi':'bg-indigo-50 text-indigo-600 border-indigo-100',
        'Event':'bg-rose-50 text-rose-600 border-rose-100',
    };

    el.innerHTML = list.map(function(k) {
        var profile    = k._profile || k.profiles || {};
        var posterName = profile.username || 'Pengguna';
        var avatar     = profile.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(posterName.charAt(0)) + '&background=dbeafe&color=2563eb&bold=true&size=64');
        var budget     = k.budget ? 'Rp ' + Number(k.budget).toLocaleString('id-ID') : 'Fleksibel';
        var timeAgo    = _timeAgo(k.created_at);
        var isMine     = activeUser && activeUser.id === k.user_id;
        var katClass   = katColors[k.kategori] || 'bg-slate-50 text-slate-600 border-slate-200';

        var applyBtn = isMine
            ? '<div class="text-xs text-center text-slate-400 italic py-2 border border-dashed border-slate-200 rounded-xl">Postingan milikmu</div>'
            : '<button onclick="applyKebutuhanPublic(\'' + k.id + '\', \'' + escHtml(k.user_id) + '\')" class="w-full py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm active:scale-95">Apply Sekarang</button>';

        return '<div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3 hover:border-blue-200 hover:shadow-md transition-all">' +
            '<div class="flex items-center gap-3">' +
                '<img src="' + avatar + '" class="w-10 h-10 rounded-xl object-cover border border-slate-100 flex-shrink-0" onerror="this.src=\'https://ui-avatars.com/api/?name=U&background=dbeafe&color=2563eb&bold=true&size=64\'">' +
                '<div class="flex-1 min-w-0">' +
                    '<p class="font-bold text-slate-800 text-sm truncate">@' + escHtml(posterName) + '</p>' +
                    '<p class="text-xs text-slate-400">' + timeAgo + '</p>' +
                '</div>' +
                '<span class="text-xs font-bold px-2.5 py-1 rounded-full border ' + katClass + '">' + (k.kategori || '') + '</span>' +
            '</div>' +
            '<div>' +
                '<h4 class="font-extrabold text-slate-800 text-sm mb-1.5">' + escHtml(k.judul) + '</h4>' +
                '<p class="text-xs text-slate-500 leading-relaxed line-clamp-2">' + escHtml(k.deskripsi) + '</p>' +
            '</div>' +
            '<div class="flex items-center gap-3 text-xs text-slate-400 flex-wrap">' +
                (k.lokasi ? '<span> ' + escHtml(k.lokasi) + '</span>' : '') +
                '<span>' + budget + '</span>' +
            '</div>' +
            '<div class="border-t pt-3 mt-1">' + applyBtn + '</div>' +
        '</div>';
    }).join('');
}

// Apply dari marketplace publik — simpan lamaran, JANGAN buka chat otomatis
async function applyKebutuhanPublic(kebutuhanId, ownerId) {
    if (!activeUser) return alert('Login dulu untuk apply!');
    if (activeUser.id === ownerId) return alert('Kamu tidak bisa apply ke postingan sendiri!');
    if (_hasApplied(kebutuhanId)) return;

    // Disable tombol apply di card ini sementara
    var applyBtns = document.querySelectorAll('button[onclick*="applyKebutuhanPublic(\'' + kebutuhanId + '\'"]');
    applyBtns.forEach(function(b){ b.disabled = true; b.textContent = ' Mengirim...'; });

    try {
        var { error } = await _supabase.from('aplikasi_kebutuhan').insert([{
            kebutuhan_id: kebutuhanId,
            penyedia_id:  activeUser.id,
            status:       'pending'
        }]);
        if (error && !error.message.includes('duplicate')) throw error;
    } catch(e) {
        console.error('applyKebutuhanPublic error:', e);
    }

    // Tandai sudah apply di localStorage
    _appliedSet.push(String(kebutuhanId));
    localStorage.setItem('_applied', JSON.stringify(_appliedSet));

    // Toast informatif
    showToast('Lamaran terkirim! Tunggu pemilik menerima lamaranmu.');

    // Hapus card dari list (card langsung hilang)
    _allKebutuhanData = _allKebutuhanData.filter(function(k){ return String(k.id) !== String(kebutuhanId); });
    filterKebutuhanPublic();
    var badge = document.getElementById('kebutuhanBadge');
    if (badge) { badge.textContent = _allKebutuhanData.length; badge.classList.toggle('hidden', _allKebutuhanData.length === 0); }
}

// 
// STAT PENCARI KEBUTUHAN
// 
async function loadStatPencari() {
    if (!activeUser) return;
    try {
        var { data, error } = await _supabase
            .from('kebutuhan')
            .select('id, status')
            .eq('user_id', activeUser.id);
        if (error) throw error;
        var total  = (data || []).length;
        var aktif  = (data || []).filter(function(k){ return k.status === 'open'; }).length;
        var elTotal = document.getElementById('statTotalPostingan');
        var elAktif = document.getElementById('statPostinganAktif');
        if (elTotal) elTotal.textContent = total;
        if (elAktif) elAktif.textContent = aktif;
    } catch(e) { console.error('loadStatPencari:', e); }
}

// Load badge saja (tanpa render full list)
async function loadRiwayatApplyBadge() {
    if (!activeUser) return;
    try {
        var { data: myKeb } = await _supabase.from('kebutuhan').select('id').eq('user_id', activeUser.id);
        var kebIds = (myKeb || []).map(function(k){ return k.id; });
        if (kebIds.length === 0) return;
        var { count } = await _supabase
            .from('aplikasi_kebutuhan')
            .select('*', { count: 'exact', head: true })
            .in('kebutuhan_id', kebIds)
            .eq('status', 'pending');
        var badge = document.getElementById('lamaranBadge');
        if (badge) { badge.textContent = count || 0; badge.classList.toggle('hidden', !count || count === 0); }
    } catch(e) {}
}

// 
// TAB DALAM PENCARI: POSTINGAN / RIWAYAT APPLY
// 
function showPencariTab(tab) {
    var panels = {
        postingan: document.getElementById('subPanelPostingan'),
        riwayat:   document.getElementById('subPanelRiwayatApply'),
        orders:    document.getElementById('subPanelOrders'),
        wishlist:  document.getElementById('subPanelWishlistDash'),
    };
    var btns = {
        postingan: document.getElementById('pencariTabPostingan'),
        riwayat:   document.getElementById('pencariTabRiwayat'),
        orders:    document.getElementById('pencariTabOrders'),
        wishlist:  document.getElementById('pencariTabWishlist'),
    };

    var activeClass   = 'px-4 py-2 rounded-xl text-sm font-bold bg-blue-600 text-white transition';
    var inactiveClass = 'px-4 py-2 rounded-xl text-sm font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition';
    var inactiveWithBadge = inactiveClass + ' flex items-center gap-1.5';

    Object.keys(panels).forEach(function(k) {
        if (panels[k]) panels[k].classList.add('hidden');
        if (btns[k])   btns[k].className = (k === 'riwayat' ? inactiveWithBadge : inactiveClass);
    });

    if (panels[tab]) panels[tab].classList.remove('hidden');
    if (btns[tab])   btns[tab].className = (tab === 'riwayat' ? activeClass + ' flex items-center gap-1.5' : activeClass);

    if (tab === 'riwayat')  loadRiwayatApply();
    if (tab === 'orders')   renderOrders();
    if (tab === 'wishlist') renderWishlistPage();
}

// Load semua apply yang masuk ke postingan milik pencari + orders selesai sebagai pengeluaran
async function loadRiwayatApply() {
    if (!activeUser) return;
    var el = document.getElementById('riwayatApplyList');
    if (!el) return;
    el.innerHTML = '<p class="text-slate-400 italic text-center py-8"><span class="inline-block animate-spin mr-1"></span>Memuat...</p>';

    try {
        // Ambil semua postingan milik user
        var { data: myKeb } = await _supabase
            .from('kebutuhan')
            .select('id, judul, kategori, budget, status')
            .eq('user_id', activeUser.id);

        var kebIds = (myKeb || []).map(function(k){ return k.id; });
        var kebMap = {};
        (myKeb || []).forEach(function(k){ kebMap[k.id] = k; });

        if (kebIds.length === 0) {
            el.innerHTML = '<div class="text-center py-12 text-slate-400"><p class="text-4xl mb-3"></p><p class="font-semibold">Belum ada postingan</p><p class="text-sm mt-1">Buat postingan kebutuhan dulu di tab "Postingan Saya"</p></div>';
            return;
        }

        // Ambil semua apply yang masuk ke postingan user
        var { data: applies, error: appErr } = await _supabase
            .from('aplikasi_kebutuhan')
            .select('*')
            .in('kebutuhan_id', kebIds)
            .order('created_at', { ascending: false });

        if (appErr) throw appErr;
        var applyList = applies || [];

        // Update badge
        var pendingCount = applyList.filter(function(a){ return a.status === 'pending'; }).length;
        var badge = document.getElementById('lamaranBadge');
        if (badge) { badge.textContent = pendingCount; badge.classList.toggle('hidden', pendingCount === 0); }

        if (applyList.length === 0) {
            el.innerHTML = '<div class="text-center py-12 text-slate-400"><p class="text-4xl mb-3"></p><p class="font-semibold">Belum ada yang apply</p><p class="text-sm mt-1">Penyedia jasa belum ada yang melamar ke postinganmu</p></div>';
            return;
        }

        // Ambil profil para penyedia
        var penyediaIds = [...new Set(applyList.map(function(a){ return a.penyedia_id; }))];
        var rp = await _supabase.from('profiles').select('id, username, avatar_url').in('id', penyediaIds);
        var profMap = {};
        (rp.data || []).forEach(function(p){ profMap[p.id] = p; });

        el.innerHTML = (function() {
            // Pisahkan berdasarkan status
            var pending   = applyList.filter(function(a){ return a.status === 'pending'; });
            var diterima  = applyList.filter(function(a){ return a.status === 'diterima'; });
            var selesai   = applyList.filter(function(a){ return a.status === 'selesai'; });
            var ditolak   = applyList.filter(function(a){ return a.status === 'ditolak'; });

            var grouped   = [].concat(
                pending.length  ? [{ isHeader: true, label: 'Menunggu Keputusan (' + pending.length + ')' }].concat(pending)   : [],
                diterima.length ? [{ isHeader: true, label: 'Diterima — Sedang Berjalan (' + diterima.length + ')' }].concat(diterima) : [],
                selesai.length  ? [{ isHeader: true, label: 'Selesai (' + selesai.length + ')' }].concat(selesai)   : [],
                ditolak.length  ? [{ isHeader: true, label: 'Ditolak (' + ditolak.length + ')' }].concat(ditolak)   : []
            );

            return grouped.map(function(a) {
                if (a.isHeader) {
                    return '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-wider mt-5 mb-2 px-1">' + a.label + '</p>';
                }

                var keb    = kebMap[a.kebutuhan_id] || {};
                var prof   = profMap[a.penyedia_id] || {};
                var nama   = prof.username || 'Penyedia';
                var avatar = prof.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(nama.charAt(0)) + '&background=dbeafe&color=2563eb&bold=true&size=64');
                var tgl    = _timeAgo(a.created_at);
                var budget = keb.budget ? 'Rp ' + Number(keb.budget).toLocaleString('id-ID') : 'Fleksibel';

                var statusBadge = '';
                var actionBtns  = '';

                if (a.status === 'pending') {
                    statusBadge = '<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200"> Menunggu</span>';
                    actionBtns  =
                        '<button onclick="terimaApply(\'' + a.id + '\',\'' + a.penyedia_id + '\',\'' + a.kebutuhan_id + '\',\'' + escHtml(nama) + '\')" ' +
                            'class="flex-1 py-2 rounded-xl font-bold text-xs bg-green-600 hover:bg-green-700 text-white transition shadow-sm">Terima</button>' +
                        '<button onclick="tolakApply(\'' + a.id + '\')" ' +
                            'class="flex-1 py-2 rounded-xl font-bold text-xs bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 transition border border-slate-200">Tolak</button>';

                } else if (a.status === 'diterima') {
                    statusBadge = '<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200"> Diterima</span>';
                    actionBtns  =
                        '<button onclick="bukaChat(\'' + a.penyedia_id + '\',\'' + escHtml(nama) + '\')" ' +
                            'class="flex-1 py-2 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white transition">Chat</button>' +
                        '<button onclick="selesaikanPekerjaan(\'' + a.id + '\',\'' + a.kebutuhan_id + '\',\'' + a.penyedia_id + '\',\'' + escHtml(keb.judul || 'Pekerjaan') + '\',' + (keb.budget || 0) + ')" ' +
                            'class="flex-1 py-2 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-700 text-white transition shadow-sm">Selesai</button>';

                } else if (a.status === 'selesai') {
                    statusBadge = '<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200"> Selesai</span>';
                    actionBtns  =
                        '<button onclick="bukaChat(\'' + a.penyedia_id + '\',\'' + escHtml(nama) + '\')" ' +
                            'class="flex-1 py-2 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 transition">Chat</button>' +
                        (keb.budget ? '<div class="flex-1 text-center text-xs font-bold text-purple-600 py-2 bg-purple-50 rounded-xl border border-purple-100">-' + budget + '</div>' : '');

                } else if (a.status === 'ditolak') {
                    statusBadge = '<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200"> Ditolak</span>';
                    actionBtns  = '<div class="flex-1 text-center text-xs text-slate-400 italic py-1">Lamaran telah ditolak</div>';
                }

                var cardBorder = a.status === 'selesai' ? 'border-purple-100 bg-purple-50/30' : 'border-slate-100';

                return '<div class="bg-white rounded-2xl border shadow-sm p-4 space-y-3 ' + cardBorder + '">' +
                    '<div class="flex items-center gap-3">' +
                        '<img src="' + avatar + '" class="w-12 h-12 rounded-xl object-cover border border-slate-100 flex-shrink-0" ' +
                            'onerror="this.src=\'https://ui-avatars.com/api/?name=U&background=dbeafe&color=2563eb&bold=true&size=64\'">' +
                        '<div class="flex-1 min-w-0">' +
                            '<div class="flex items-center gap-2 flex-wrap">' +
                                '<p class="font-bold text-slate-800 text-sm">@' + escHtml(nama) + '</p>' +
                                statusBadge +
                            '</div>' +
                            '<p class="text-xs text-slate-500 mt-0.5 truncate">Melamar ke: <span class="font-semibold text-blue-600">' + escHtml(keb.judul || 'Kebutuhan') + '</span></p>' +
                            '<div class="flex items-center gap-3 text-xs text-slate-400 mt-0.5">' +
                                '<span>' + budget + '</span>' +
                                '<span>' + tgl + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="flex gap-2 pt-1">' + actionBtns + '</div>' +
                '</div>';
            }).join('');
        })();

    } catch(err) {
        console.error('loadRiwayatApply error:', err);
        el.innerHTML = '<p class="text-red-400 italic text-center py-6">Gagal memuat: ' + err.message + '</p>';
    }
}

// Terima lamaran — update status, buka chat, reload
async function terimaApply(applyId, penyediaId, kebutuhanId, penyediaNama) {
    if (!activeUser) return;
    try {
        var { error } = await _supabase
            .from('aplikasi_kebutuhan')
            .update({ status: 'diterima' })
            .eq('id', applyId);
        if (error) throw error;

        showToast('Lamaran @' + penyediaNama + ' diterima! Kamu bisa langsung chat.');
        // Buka chat dengan penyedia
        bukaChat(penyediaId, penyediaNama);
        // Reload daftar lamaran
        loadRiwayatApply();
    } catch(err) {
        alert('Gagal menerima lamaran: ' + err.message);
    }
}

// Tolak lamaran
async function tolakApply(applyId) {
    if (!confirm('Tolak lamaran ini?')) return;
    try {
        var { error } = await _supabase
            .from('aplikasi_kebutuhan')
            .update({ status: 'ditolak' })
            .eq('id', applyId);
        if (error) throw error;
        showToast('Lamaran ditolak.');
        loadRiwayatApply();
    } catch(err) {
        alert('Gagal menolak: ' + err.message);
    }
}

// Selesaikan pekerjaan — masuk ke pengeluaran + tutup postingan
async function selesaikanPekerjaan(applyId, kebutuhanId, penyediaId, judulKerja, budgetAmt) {
    if (!activeUser) return;
    if (!confirm('Tandai pekerjaan ini sebagai selesai? Ini akan tercatat sebagai pengeluaran.')) return;

    try {
        // 1. Update status aplikasi → 'selesai'
        await _supabase.from('aplikasi_kebutuhan').update({ status: 'selesai' }).eq('id', applyId);

        // 2. Update status kebutuhan → 'closed'
        await _supabase.from('kebutuhan').update({ status: 'closed' }).eq('id', kebutuhanId);

        // 3. Insert ke tabel orders sebagai pengeluaran
        var { error: ordErr } = await _supabase.from('orders').insert([{
            buyer_id:  activeUser.id,
            jasa_id:   null,
            jasa_nama: judulKerja,
            harga:     Number(budgetAmt) || 0,
            status:    'selesai',
            seller_id: penyediaId
        }]);
        // Abaikan jika kolom seller_id belum ada — coba lagi tanpa seller_id
        if (ordErr) {
            await _supabase.from('orders').insert([{
                buyer_id:  activeUser.id,
                jasa_id:   null,
                jasa_nama: judulKerja,
                harga:     Number(budgetAmt) || 0,
                status:    'selesai'
            }]);
        }

        showToast('Pekerjaan selesai! Tercatat di riwayat pengeluaran dan pesanan.');

        // Reload lamaran & stat pencari
        loadRiwayatApply();
        loadStatPencari();

        // Refresh riwayat pesanan jika sub-panel terbuka
        var ordersPanel = document.getElementById('subPanelOrders');
        if (ordersPanel && !ordersPanel.classList.contains('hidden')) renderOrders();

        // Jika panel pengeluaran terbuka, refresh
        var pengPanel = document.getElementById('dashPengeluaran');
        if (pengPanel && !pengPanel.classList.contains('hidden')) loadPengeluaran();

    } catch(err) {
        console.error('selesaikanPekerjaan error:', err);
        alert('Gagal: ' + err.message);
    }
}

// 
// PENGELUARAN PENCARI KEBUTUHAN
// 

function togglePengeluaran() {
    var panel = document.getElementById('dashPengeluaran');
    if (!panel) return;
    var isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !isHidden);
    if (isHidden) loadPengeluaran();
}

async function loadPengeluaran() {
    var container = document.getElementById('pengeluaranContainer');
    if (!container || !activeUser) return;
    container.innerHTML = '<p class="text-slate-400 italic text-center py-4">Memuat data...</p>';

    try {
        // Ambil semua orders yang dilakukan user ini sebagai buyer
        var { data: orders, error } = await _supabase
            .from('orders')
            .select('id, jasa_id, jasa_nama, harga, status, created_at')
            .eq('buyer_id', activeUser.id)
            .order('created_at', { ascending: false });
        if (error) throw error;

        var allOrders = orders || [];
        var totalKeluar   = allOrders.filter(function(o){ return o.status === 'selesai'; }).reduce(function(s,o){ return s + Number(o.harga||0); }, 0);
        var selesai       = allOrders.filter(function(o){ return o.status === 'selesai'; }).length;
        var pending       = allOrders.filter(function(o){ return o.status === 'pending' || o.status === 'diterima'; }).length;

        var filterPeng = window._pengFilter || 'semua';

        var statsHtml =
            '<div class="grid grid-cols-3 gap-3 mb-5">' +
            '<div class="bg-gradient-to-br from-purple-500 to-purple-600 p-4 rounded-2xl text-white text-center"><p class="text-purple-100 text-[10px] font-bold uppercase mb-1">Total Keluar</p><p class="text-lg font-black">Rp ' + _fmtRp(totalKeluar) + '</p><p class="text-purple-200 text-[10px]">' + selesai + ' selesai</p></div>' +
            '<div class="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-2xl text-white text-center"><p class="text-blue-100 text-[10px] font-bold uppercase mb-1">Selesai</p><p class="text-lg font-black">' + selesai + '</p></div>' +
            '<div class="bg-gradient-to-br from-yellow-400 to-orange-500 p-4 rounded-2xl text-white text-center"><p class="text-yellow-100 text-[10px] font-bold uppercase mb-1">Berjalan</p><p class="text-lg font-black">' + pending + '</p></div>' +
            '</div>';

        var filterHtml =
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
            '<button onclick="filterPengeluaran(\'semua\')" id="pfSemua" style="padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:#7c3aed;color:white;border:none;cursor:pointer;">Semua</button>' +
            '<button onclick="filterPengeluaran(\'selesai\')" id="pfSelesai" style="padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;">Selesai</button>' +
            '<button onclick="filterPengeluaran(\'pending\')" id="pfPending" style="padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;">Pending</button>' +
            '<button onclick="filterPengeluaran(\'diterima\')" id="pfDiterima" style="padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;">Diterima</button>' +
            '<button onclick="filterPengeluaran(\'ditolak\')" id="pfDitolak" style="padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;background:#f1f5f9;color:#475569;border:none;cursor:pointer;">Ditolak</button>' +
            '</div>';

        window._pengOrders = allOrders;
        container.innerHTML = statsHtml +
            '<h4 style="font-weight:700;color:#0f172a;margin-bottom:8px;">Riwayat Pengeluaran</h4>' +
            filterHtml +
            '<div id="pengListContainer" class="space-y-2"></div>';

        renderPengList(allOrders);
        setTimeout(injectCollapseButtons, 100);

    } catch(err) {
        container.innerHTML = '<p class="text-red-400 italic text-center py-4">Gagal: ' + err.message + '</p>';
    }
}

function renderPengList(orders) {
    var container = document.getElementById('pengListContainer');
    if (!container) return;
    var statusStyle = function(s) {
        return s==='selesai' ? 'background:#f3e8ff;color:#7c3aed;' : s==='diterima' ? 'background:#dbeafe;color:#2563eb;' : s==='ditolak' ? 'background:#fee2e2;color:#dc2626;' : 'background:#fef9c3;color:#ca8a04;';
    };
    if (!orders || orders.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#94a3b8;font-style:italic;padding:16px;">Tidak ada transaksi.</p>';
        return;
    }
    container.innerHTML = orders.map(function(o) {
        var tgl = new Date(o.created_at).toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric'});
        return '<div style="background:white;border:1px solid #f1f5f9;border-radius:16px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;">' +
            '<div style="min-width:0;"><p style="font-weight:700;color:#0f172a;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (o.jasa_nama||'Jasa') + '</p><p style="font-size:11px;color:#94a3b8;">' + tgl + '</p></div>' +
            '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">' +
            (o.status==='selesai' ? '<p style="font-weight:800;color:#7c3aed;font-size:14px;">-Rp ' + Number(o.harga||0).toLocaleString('id-ID') + '</p>' : '') +
            '<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;' + statusStyle(o.status) + '">' + (o.status||'pending').toUpperCase() + '</span>' +
            '</div></div>';
    }).join('');
}

function filterPengeluaran(status) {
    window._pengFilter = status;
    ['semua','selesai','pending','diterima','ditolak'].forEach(function(k) {
        var btn = document.getElementById('pf' + k.charAt(0).toUpperCase() + k.slice(1));
        if (btn) { btn.style.background = (k === status) ? '#7c3aed' : '#f1f5f9'; btn.style.color = (k === status) ? 'white' : '#475569'; }
    });
    var all = window._pengOrders || [];
    var filtered = status === 'semua' ? all : all.filter(function(o){ return o.status === status; });
    renderPengList(filtered);
}

// 
// RIWAYAT JASA — SISI PENYEDIA
// Menampilkan semua postingan kebutuhan yang pernah di-apply
// Status terhubung langsung dengan tabel aplikasi_kebutuhan
// 

async function loadRiwayatJasa() {
    if (!activeUser) return;
    var el = document.getElementById('riwayatJasaList');
    if (!el) return;

    el.innerHTML = '<p class="text-slate-400 italic text-center py-8"><span class="inline-block animate-spin mr-1"></span>Memuat riwayat...</p>';

    var filterVal = document.getElementById('riwayatJasaFilter')?.value || 'semua';

    try {
        // Ambil semua apply milik penyedia ini
        var query = _supabase
            .from('aplikasi_kebutuhan')
            .select('*, kebutuhan(id, judul, kategori, budget, lokasi, deskripsi, status, user_id, created_at)')
            .eq('penyedia_id', activeUser.id)
            .order('created_at', { ascending: false });

        if (filterVal !== 'semua') query = query.eq('status', filterVal);

        var { data: applies, error } = await query;
        if (error) throw error;

        var applyList = applies || [];

        // Update badge di tab
        _updateRiwayatJasaBadge(applyList);

        if (applyList.length === 0) {
            el.innerHTML = '<div class="text-center py-14 text-slate-400">' +
                '<p class="text-5xl mb-3"></p>' +
                '<p class="font-semibold text-slate-600">Belum ada riwayat jasa</p>' +
                '<p class="text-sm mt-1">Kamu belum pernah apply ke postingan kebutuhan.</p>' +
                '<button onclick="showPage(\'marketplace\'); setTimeout(function(){ showMarketplaceTab(\'kebutuhan\'); }, 80);" ' +
                    'class="mt-5 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition shadow">' +
                    ' Cari Proyek Sekarang' +
                '</button>' +
            '</div>';
            return;
        }

        // Ambil profil para pencari (pemilik postingan)
        var ownerIds = [...new Set(applyList.map(function(a){ return a.kebutuhan?.user_id; }).filter(Boolean))];
        var profMap  = {};
        if (ownerIds.length > 0) {
            var rp = await _supabase.from('profiles').select('id, username, avatar_url').in('id', ownerIds);
            (rp.data || []).forEach(function(p){ profMap[p.id] = p; });
        }

        // Pisahkan berdasarkan status
        var pending  = applyList.filter(function(a){ return a.status === 'pending'; });
        var diterima = applyList.filter(function(a){ return a.status === 'diterima'; });
        var selesai  = applyList.filter(function(a){ return a.status === 'selesai'; });
        var ditolak  = applyList.filter(function(a){ return a.status === 'ditolak'; });

        // Urutkan: diterima dulu (perlu aksi), lalu pending, selesai, ditolak
        var ordered = [].concat(
            diterima.length ? [{ isHeader: true, label: 'Diterima — Sedang Berjalan (' + diterima.length + ')' }].concat(diterima) : [],
            pending.length  ? [{ isHeader: true, label: 'Menunggu Keputusan (' + pending.length + ')' }].concat(pending) : [],
            selesai.length  ? [{ isHeader: true, label: 'Selesai (' + selesai.length + ')' }].concat(selesai) : [],
            ditolak.length  ? [{ isHeader: true, label: 'Ditolak (' + ditolak.length + ')' }].concat(ditolak) : []
        );

        el.innerHTML = ordered.map(function(a) {
            if (a.isHeader) {
                return '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-wider mt-5 mb-3 px-1">' + a.label + '</p>';
            }

            var keb    = a.kebutuhan || {};
            var ownId  = keb.user_id;
            var prof   = profMap[ownId] || {};
            var nama   = prof.username || 'Pencari';
            var avatar = prof.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(nama.charAt(0)) + '&background=f0fdf4&color=16a34a&bold=true&size=64');
            var tgl    = _timeAgo(a.created_at);
            var budget = keb.budget ? 'Rp ' + Number(keb.budget).toLocaleString('id-ID') : 'Fleksibel';

            // Status badge
            var statusMap = {
                pending:  '<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200"> Menunggu</span>',
                diterima: '<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200"> Diterima</span>',
                selesai:  '<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200"> Selesai</span>',
                ditolak:  '<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200"> Ditolak</span>',
            };
            var statusBadge = statusMap[a.status] || '';

            // Action buttons berdasarkan status
            var actionBtns = '';
            if (a.status === 'pending') {
                actionBtns = '<div class="text-xs text-slate-400 italic py-2 text-center w-full">Menunggu keputusan dari pencari jasa…</div>';

            } else if (a.status === 'diterima') {
                // Penyedia bisa chat dan menandai selesai dari sisinya
                actionBtns =
                    '<button onclick="bukaChat(\'' + escHtml(ownId) + '\',\'' + escHtml(nama) + '\')" ' +
                        'class="flex-1 py-2.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white transition">Chat</button>' +
                    '<button onclick="selesaikanDariPenyedia(\'' + a.id + '\',\'' + escHtml(keb.id || '') + '\',\'' + escHtml(ownId) + '\',\'' + escHtml(keb.judul || 'Pekerjaan') + '\',' + (keb.budget || 0) + ')" ' +
                        'class="flex-1 py-2.5 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-700 text-white transition shadow-sm">TandaiSelesai</button>';

            } else if (a.status === 'selesai') {
                actionBtns =
                    '<button onclick="bukaChat(\'' + escHtml(ownId) + '\',\'' + escHtml(nama) + '\')" ' +
                        'class="flex-1 py-2.5 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 transition">Chat</button>' +
                    '<div class="flex-1 text-center text-xs font-bold text-purple-600 py-2.5 bg-purple-50 rounded-xl border border-purple-100">' +
                        (keb.budget ? '+ ' + budget : 'Selesai') +
                    '</div>';

            } else if (a.status === 'ditolak') {
                actionBtns = '<div class="w-full text-center text-xs text-slate-400 italic py-2">Lamaran ditolak oleh pencari jasa</div>';
            }

            var cardBg = a.status === 'selesai'  ? 'border-purple-100 bg-purple-50/30' :
                         a.status === 'diterima' ? 'border-green-100 bg-green-50/20'   :
                         a.status === 'ditolak'  ? 'border-red-50'                     : 'border-slate-100';

            return '<div class="bg-white rounded-2xl border shadow-sm p-4 space-y-3 ' + cardBg + '">' +
                // Header: avatar pencari + info postingan
                '<div class="flex items-start gap-3">' +
                    '<img src="' + avatar + '" class="w-12 h-12 rounded-xl object-cover border border-slate-100 flex-shrink-0" ' +
                        'onerror="this.src=\'https://ui-avatars.com/api/?name=U&background=dbeafe&color=2563eb&bold=true&size=64\'">' +
                    '<div class="flex-1 min-w-0">' +
                        '<div class="flex items-center gap-2 flex-wrap mb-0.5">' +
                            '<p class="font-bold text-slate-800 text-sm">@' + escHtml(nama) + '</p>' +
                            statusBadge +
                        '</div>' +
                        '<p class="text-sm font-semibold text-slate-700 truncate">' + escHtml(keb.judul || 'Kebutuhan') + '</p>' +
                        '<div class="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">' +
                            (keb.kategori ? '<span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">' + keb.kategori + '</span>' : '') +
                            (keb.lokasi   ? '<span>' + escHtml(keb.lokasi) + '</span>' : '') +
                            '<span>' + budget + '</span>' +
                            '<span>' + tgl + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                // Deskripsi singkat postingan
                (keb.deskripsi ? '<p class="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-xl p-3 border border-slate-100">' + escHtml(keb.deskripsi) + '</p>' : '') +
                // Action buttons
                '<div class="flex gap-2">' + actionBtns + '</div>' +
            '</div>';
        }).join('');

    } catch(err) {
        console.error('loadRiwayatJasa error:', err);
        el.innerHTML = '<p class="text-red-400 italic text-center py-6">Gagal memuat: ' + err.message + '</p>';
    }
}

// Update badge di tab Riwayat Jasa (jumlah yang diterima = perlu aksi)
function _updateRiwayatJasaBadge(applyList) {
    var badge = document.getElementById('riwayatJasaBadge');
    if (!badge) return;
    var diterima = (applyList || []).filter(function(a){ return a.status === 'diterima'; }).length;
    if (diterima > 0) {
        badge.textContent = diterima;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Load badge saat pertama buka dashboard sebagai penyedia
async function loadRiwayatJasaBadge() {
    if (!activeUser) return;
    try {
        var { data, error } = await _supabase
            .from('aplikasi_kebutuhan')
            .select('id, status')
            .eq('penyedia_id', activeUser.id)
            .eq('status', 'diterima');
        if (error) return;
        _updateRiwayatJasaBadge(data || []);
    } catch(e) {}
}

//  SELESAIKAN DARI SISI PENYEDIA 
// Ketika penyedia klik "Tandai Selesai" — sinkronisasi dengan sisi pencari
async function selesaikanDariPenyedia(applyId, kebutuhanId, ownerId, judulKerja, budgetAmt) {
    if (!activeUser) return;
    if (!confirm('Tandai pekerjaan "' + judulKerja + '" sebagai selesai?\nPencari jasa akan mendapat notifikasi dan pekerjaan akan masuk riwayat kedua pihak.')) return;

    try {
        // 1. Update status aplikasi → 'selesai' (sama dengan selesaikanPekerjaan sisi pencari)
        var { error: e1 } = await _supabase
            .from('aplikasi_kebutuhan')
            .update({ status: 'selesai' })
            .eq('id', applyId);
        if (e1) throw e1;

        // 2. Tutup postingan kebutuhan
        if (kebutuhanId) {
            await _supabase.from('kebutuhan').update({ status: 'closed' }).eq('id', kebutuhanId);
        }

        // 3. Catat ke orders sebagai pendapatan penyedia
        var amt = Number(budgetAmt) || 0;
        if (amt > 0) {
            var insertObj = {
                buyer_id:  ownerId,
                jasa_id:   null,
                jasa_nama: judulKerja,
                harga:     amt,
                status:    'selesai',
            };
            // Coba dengan seller_id dulu
            var { error: e2 } = await _supabase.from('orders').insert([Object.assign({}, insertObj, { seller_id: activeUser.id })]);
            if (e2) await _supabase.from('orders').insert([insertObj]);
        }

        showToast('Pekerjaan "' + judulKerja + '" selesai! Tercatat di riwayat kedua pihak.');

        // Reload riwayat jasa
        loadRiwayatJasa();

        // Jika tab keuangan terbuka, refresh
        var keuEl = document.getElementById('dashKeuangan');
        if (keuEl && !keuEl.classList.contains('hidden')) loadKeuangan();

    } catch(err) {
        console.error('selesaikanDariPenyedia error:', err);
        alert('Gagal menandai selesai: ' + err.message);
    }
}

// ============================================================
// COLLAPSE / EXPAND UNIVERSAL — versi mobile-friendly
// ============================================================
var _colState = {};   // { contentId: true/false }  true = collapsed

var _colSections = [
    { hdrId: 'colHdr_pesanan',     cntId: 'mitraOrderList' },
    { hdrId: 'colHdr_riwayatJasa', cntId: 'riwayatJasaList' },
    { hdrId: 'colHdr_pengList',    cntId: 'pengListContainer' },
    { hdrId: 'colHdr_wishlist',    cntId: 'wishlistContainer' },
    { hdrId: 'colHdr_apply',       cntId: 'riwayatApplyList' },
];

function _colBtn(cntId) {
    return document.getElementById(
        (_colSections.find(function(s){ return s.cntId === cntId; }) || {}).hdrId || ''
    );
}

function toggleCollapse(cntId) {
    var el = document.getElementById(cntId);
    if (!el) return;

    var collapsed = !_colState[cntId];   // toggle
    _colState[cntId] = collapsed;

    if (collapsed) {
        // Simpan tinggi asli dulu, lalu tutup
        el.style.maxHeight  = el.scrollHeight + 'px';
        el.style.overflow   = 'hidden';
        el.style.transition = 'max-height 0.3s ease, opacity 0.25s ease';
        // Paksa reflow agar transisi jalan
        void el.offsetHeight;
        el.style.maxHeight = '0px';
        el.style.opacity   = '0';
    } else {
        // Hitung ulang scrollHeight karena konten bisa berubah
        el.style.overflow   = 'hidden';
        el.style.transition = 'max-height 0.4s ease, opacity 0.3s ease';
        el.style.maxHeight  = el.scrollHeight + 'px';
        el.style.opacity    = '1';
        setTimeout(function() {
            // Setelah animasi, biarkan konten bebas
            if (!_colState[cntId]) {   // masih expanded
                el.style.maxHeight = 'none';
                el.style.overflow  = '';
            }
        }, 420);
    }

    // Update tombol
    var btn = _colBtn(cntId);
    if (!btn) return;
    var lbl     = btn.querySelector('.col-lbl');
    var chevron = btn.querySelector('.col-chv');
    if (lbl)     lbl.textContent          = collapsed ? 'Buka' : 'Tutup';
    if (chevron) chevron.style.transform  = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
}

function _makeColBtn(cfg) {
    var btn      = document.createElement('button');
    btn.id       = cfg.hdrId;
    btn.type     = 'button';
    // inline onclick agar kerja di semua mobile browser
    btn.setAttribute('onclick', 'toggleCollapse("' + cfg.cntId + '")');
    btn.style.cssText = [
        'display:inline-flex', 'align-items:center', 'gap:4px',
        'background:#f1f5f9', 'border:1px solid #e2e8f0', 'border-radius:999px',
        'padding:4px 12px', 'font-size:12px', 'font-weight:700',
        'color:#64748b', 'cursor:pointer', 'flex-shrink:0',
        'touch-action:manipulation',          /* mobile tap fix */
        '-webkit-tap-highlight-color:transparent',
        'transition:background 0.15s',
        'margin-left:8px'
    ].join(';');
    btn.innerHTML =
        '<span class="col-lbl">Tutup</span>' +
        '<svg class="col-chv" width="11" height="11" fill="none" stroke="currentColor" ' +
            'viewBox="0 0 24 24" style="transition:transform 0.3s;pointer-events:none;">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"/>' +
        '</svg>';
    return btn;
}

function injectCollapseButtons() {
    _colSections.forEach(function(cfg) {
        // Skip jika konten tidak ada di DOM
        var cnt = document.getElementById(cfg.cntId);
        if (!cnt) return;

        // Skip jika tombol sudah ada
        if (document.getElementById(cfg.hdrId)) return;

        var parent  = cnt.parentElement;
        if (!parent) return;

        var heading = parent.querySelector('h3, h4');
        if (!heading) return;

        var btn = _makeColBtn(cfg);

        // Jadikan baris heading flex agar tombol sejajar
        var row = heading.parentElement;
        if (row) {
            row.style.display    = 'flex';
            row.style.alignItems = 'center';
            row.style.flexWrap   = 'wrap';
            row.style.gap        = '6px';
        }
        heading.insertAdjacentElement('afterend', btn);
    });
}

// ── Panggil inject setiap kali konten mungkin berubah ──
// Tidak override fungsi global — pakai MutationObserver sebagai gantinya
(function() {
    // Inject awal setelah DOM siap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(injectCollapseButtons, 600);
        });
    } else {
        setTimeout(injectCollapseButtons, 300);
    }

    // Observe perubahan di body (tiap kali section tampil/disembunyikan)
    var _timer = null;
    var obs = new MutationObserver(function() {
        clearTimeout(_timer);
        _timer = setTimeout(injectCollapseButtons, 250);
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
})();
