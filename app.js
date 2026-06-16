// =================== SUPABASE CONFIG ===================
// REPLACE with your Supabase project details
const SUPABASE_URL = 'https://mhjqzdjikjhrdzretres.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oanF6ZGppa2pocmR6cmV0cmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MTYyMDEsImV4cCI6MjA5NzE5MjIwMX0.Xo5hg_MU_TwIzU0stWvqLE0LQbXefZw_0RdEUCc8q6E';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =================== USERS ===================
const USERS = {
    'מאיר': { password: '037310851', role: 'viewer' },
    'ישי': { password: '326075868', role: 'admin' }
};

const DEFAULT_LOAN = 125000;

// =================== STATE ===================
let currentUser = null;
let payments = [];
let loanAmount = DEFAULT_LOAN;
let deleteTargetId = null;
let currentImageData = null;
let editingImageUrl = null;

// =================== DOM ===================
const $ = id => document.getElementById(id);

const loginScreen = $('loginScreen');
const appScreen = $('appScreen');
const loginForm = $('loginForm');
const loginError = $('loginError');
const currentUserEl = $('currentUser');
const logoutBtn = $('logoutBtn');
const addPaymentBtn = $('addPaymentBtn');
const editLoanBtn = $('editLoanBtn');
const paymentsList = $('paymentsList');
const paymentModal = $('paymentModal');
const paymentForm = $('paymentForm');
const loanModal = $('loanModal');
const loanForm = $('loanForm');
const imageModal = $('imageModal');
const deleteModal = $('deleteModal');
const toast = $('toast');

// =================== AUTH ===================
function login(username, password) {
    const user = USERS[username];
    if (user && user.password === password) {
        currentUser = { name: username, role: user.role };
        sessionStorage.setItem('user', JSON.stringify(currentUser));
        return true;
    }
    return false;
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('user');
    showScreen('login');
}

function checkAuth() {
    const saved = sessionStorage.getItem('user');
    if (saved) {
        currentUser = JSON.parse(saved);
        showScreen('app');
    }
}

function isAdmin() {
    return currentUser && currentUser.role === 'admin';
}

// =================== SCREENS ===================
function showScreen(screen) {
    loginScreen.classList.remove('active');
    appScreen.classList.remove('active');
    if (screen === 'login') {
        loginScreen.classList.add('active');
    } else {
        appScreen.classList.add('active');
        currentUserEl.textContent = currentUser.name;
        addPaymentBtn.style.display = isAdmin() ? 'inline-flex' : 'none';
        editLoanBtn.style.display = isAdmin() ? 'block' : 'none';
        loadData();
    }
}

// =================== SUPABASE DATA ===================
let realtimeSetup = false;

async function loadData() {
    // Load loan settings
    const { data: settings } = await sb
        .from('settings')
        .select('*')
        .eq('id', 'loan')
        .single();

    if (settings) {
        loanAmount = settings.amount;
    } else {
        await sb.from('settings').insert({ id: 'loan', amount: DEFAULT_LOAN });
        loanAmount = DEFAULT_LOAN;
    }

    // Load payments
    const { data: paymentData } = await sb
        .from('payments')
        .select('*')
        .order('date', { ascending: false });

    payments = paymentData || [];
    renderPayments();
    updateStats();

    if (!realtimeSetup) {
        realtimeSetup = true;
        sb
            .channel('payments-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
                refreshPayments();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => {
                refreshSettings();
            })
            .subscribe();
    }
}

async function refreshPayments() {
    const { data } = await sb
        .from('payments')
        .select('*')
        .order('date', { ascending: false });
    payments = data || [];
    renderPayments();
    updateStats();
}

async function refreshSettings() {
    const { data } = await sb
        .from('settings')
        .select('*')
        .eq('id', 'loan')
        .single();
    if (data) {
        loanAmount = data.amount;
        updateStats();
    }
}

async function savePayment(data) {
    if (data.id) {
        const { id, ...updateData } = data;
        await sb.from('payments').update(updateData).eq('id', id);
    } else {
        await sb.from('payments').insert(data);
    }
    await refreshPayments();
}

async function deletePayment(id) {
    const payment = payments.find(p => p.id === id);
    if (payment && payment.image_url) {
        const path = payment.image_url.split('/receipts/')[1];
        if (path) {
            await sb.storage.from('receipts').remove([path]);
        }
    }
    await sb.from('payments').delete().eq('id', id);
    await refreshPayments();
}

async function updateLoanAmount(amount) {
    await sb.from('settings').upsert({ id: 'loan', amount });
}

async function uploadImage(file) {
    const ext = file.name.split('.').pop();
    const name = `${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('receipts').upload(name, file);
    if (error) throw error;
    const { data } = sb.storage.from('receipts').getPublicUrl(name);
    return data.publicUrl;
}

// =================== RENDER ===================
function formatCurrency(num) {
    return '₪' + num.toLocaleString('he-IL');
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
}

function updateStats() {
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const remaining = Math.max(0, loanAmount - totalPaid);
    const percent = loanAmount > 0 ? Math.min(100, (totalPaid / loanAmount) * 100) : 0;

    $('statTotal').textContent = formatCurrency(loanAmount);
    $('statPaid').textContent = formatCurrency(totalPaid);
    $('statRemaining').textContent = formatCurrency(remaining);
    $('statCount').textContent = payments.length;
    $('progressFill').style.width = percent.toFixed(1) + '%';
    $('progressText').textContent = percent.toFixed(1) + '%';

    if (payments.length > 0) {
        const sorted = [...payments].sort((a, b) => b.date.localeCompare(a.date));
        $('statLast').textContent = formatDate(sorted[0].date);
    } else {
        $('statLast').textContent = '-';
    }
}

function renderPayments() {
    if (payments.length === 0) {
        paymentsList.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <rect x="2" y="5" width="20" height="14" rx="2"/>
                    <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <p>אין תשלומים עדיין</p>
            </div>`;
        return;
    }

    paymentsList.innerHTML = payments.map(p => `
        <div class="payment-card" data-id="${p.id}">
            <div class="payment-top">
                <div>
                    <div class="payment-amount">${formatCurrency(p.amount)}</div>
                    <div class="payment-date">${formatDate(p.date)}</div>
                </div>
                ${isAdmin() ? `
                <div class="payment-actions">
                    <button class="btn-icon" onclick="openEditPayment('${p.id}')" title="עריכה">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="confirmDelete('${p.id}')" title="מחיקה">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>` : ''}
            </div>
            ${p.note ? `<div class="payment-note">${escapeHtml(p.note)}</div>` : ''}
            ${p.image_url ? `
                <button class="payment-image-badge" onclick="viewImage('${p.image_url}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    צפה באישור
                </button>` : ''}
        </div>
    `).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// =================== MODALS ===================
function openModal(modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function openAddPayment() {
    $('modalTitle').textContent = 'תשלום חדש';
    $('paymentId').value = '';
    $('paymentAmount').value = '';
    $('paymentDate').value = new Date().toISOString().split('T')[0];
    $('paymentNote').value = '';
    resetImageUpload();
    currentImageData = null;
    editingImageUrl = null;
    openModal(paymentModal);
}

function openEditPayment(id) {
    const p = payments.find(x => x.id === id);
    if (!p) return;
    $('modalTitle').textContent = 'עריכת תשלום';
    $('paymentId').value = p.id;
    $('paymentAmount').value = p.amount;
    $('paymentDate').value = p.date;
    $('paymentNote').value = p.note || '';
    currentImageData = null;
    editingImageUrl = p.image_url || null;

    if (p.image_url) {
        $('previewImg').src = p.image_url;
        $('filePreview').classList.remove('hidden');
        $('fileUploadContent').classList.add('hidden');
    } else {
        resetImageUpload();
    }

    openModal(paymentModal);
}

function resetImageUpload() {
    $('paymentImage').value = '';
    $('filePreview').classList.add('hidden');
    $('fileUploadContent').classList.remove('hidden');
    $('previewImg').src = '';
}

function confirmDelete(id) {
    deleteTargetId = id;
    openModal(deleteModal);
}

function viewImage(url) {
    $('imageViewerImg').src = url;
    openModal(imageModal);
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// =================== EVENT LISTENERS ===================
loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const username = $('username').value.trim();
    const password = $('password').value.trim();
    if (login(username, password)) {
        loginError.classList.add('hidden');
        loginForm.reset();
        showScreen('app');
    } else {
        loginError.textContent = 'שם משתמש או סיסמה שגויים';
        loginError.classList.remove('hidden');
    }
});

logoutBtn.addEventListener('click', logout);
addPaymentBtn.addEventListener('click', openAddPayment);

// Payment modal close
$('modalCloseBtn').addEventListener('click', () => closeModal(paymentModal));
$('modalCancelBtn').addEventListener('click', () => closeModal(paymentModal));
paymentModal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(paymentModal));

// Image upload
$('paymentImage').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) {
        currentImageData = file;
        const reader = new FileReader();
        reader.onload = ev => {
            $('previewImg').src = ev.target.result;
            $('filePreview').classList.remove('hidden');
            $('fileUploadContent').classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
});

$('removeImgBtn').addEventListener('click', e => {
    e.stopPropagation();
    currentImageData = null;
    editingImageUrl = null;
    resetImageUpload();
});

// Payment form submit
paymentForm.addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('paymentId').value;
    const amount = parseFloat($('paymentAmount').value);
    const date = $('paymentDate').value;
    const note = $('paymentNote').value.trim();

    let image_url = editingImageUrl || null;
    if (currentImageData) {
        try {
            image_url = await uploadImage(currentImageData);
        } catch (err) {
            showToast('שגיאה בהעלאת תמונה');
            return;
        }
    }

    const data = {
        amount,
        date,
        note: note || null,
        image_url
    };

    if (!id) {
        data.created_by = currentUser.name;
    }

    try {
        await savePayment(id ? { id, ...data } : data);
        closeModal(paymentModal);
        showToast(id ? 'התשלום עודכן' : 'התשלום נוסף');
    } catch (err) {
        showToast('שגיאה בשמירה');
    }
});

// Loan modal
editLoanBtn.addEventListener('click', () => {
    $('loanAmount').value = loanAmount;
    openModal(loanModal);
});

$('loanModalCloseBtn').addEventListener('click', () => closeModal(loanModal));
$('loanCancelBtn').addEventListener('click', () => closeModal(loanModal));
loanModal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(loanModal));

loanForm.addEventListener('submit', async e => {
    e.preventDefault();
    const amount = parseFloat($('loanAmount').value);
    if (amount > 0) {
        await updateLoanAmount(amount);
        closeModal(loanModal);
        showToast('סכום ההלוואה עודכן');
    }
});

// Delete modal
$('deleteCancelBtn').addEventListener('click', () => closeModal(deleteModal));
deleteModal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(deleteModal));
$('deleteConfirmBtn').addEventListener('click', async () => {
    if (deleteTargetId) {
        await deletePayment(deleteTargetId);
        deleteTargetId = null;
        closeModal(deleteModal);
        showToast('התשלום נמחק');
    }
});

// Image modal
$('imageCloseBtn').addEventListener('click', () => closeModal(imageModal));
imageModal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(imageModal));

// =================== PWA ===================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

// =================== INIT ===================
checkAuth();
