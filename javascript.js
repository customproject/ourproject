// GANTI DENGAN URL DEPLOYMENT BARU ANDA YANG TELAH DI-UPDATE!
const API_URL = "https://script.google.com/macros/s/AKfycbxgmeIMnF4FA1u8yJ0sWKptJJS_RWx41lOCHp4kzoZI9vsCkI6r94Q8-LOcuGfTthQ/exec";
let activeApiRequests = 0;

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>\"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
    }[char]));
}

function safeJsonParse(value, fallback = {}) {
    try { return JSON.parse(value || 'null') || fallback; }
    catch (error) { console.error('Invalid stored JSON:', error); return fallback; }
}

function safeHttpUrl(value) {
    try {
        const parsed = new URL(String(value || ''), window.location.href);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (error) { return ''; }
}

function copyInvoiceLink(url) {
    const safeUrl = safeHttpUrl(url);
    if (!safeUrl) return alert('Link invoice tidak valid.');
    navigator.clipboard.writeText(safeUrl)
        .then(() => alert('Link disalin!'))
        .catch(() => alert('Tidak dapat menyalin link. Silakan salin secara manual: ' + safeUrl));
}

let masterItems = [];
let bankAccounts = [];
let quoteItems = [];
let invoiceItems = []; 
let historyQuotes = [];
let historyInvoices = [];
let historyUploads = []; 
let activeSenderInfo = null;

let invSubTotal = 0;
let invTaxPPN = 0;
let invTaxPPh = 0;
let invGrandTotal = 0;

const urlParams = new URLSearchParams(window.location.search);
const viewDocId = urlParams.get('doc');

if (viewDocId) {
    document.getElementById('publicViewArea').classList.remove('hidden');
} else {
    document.getElementById('adminArea').classList.remove('hidden');
    if(localStorage.getItem('token')) {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('dashboardScreen').classList.remove('hidden');
        showPage('quote');
    }
}

// Helper untuk mendapatkan tanggal lokal YYYY-MM-DD anti-mundur
function getLocalDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().substring(0, 10);
}

// Helper Penangkal Timezone untuk data dari History
function formatTgl(dateStr) {
    if (!dateStr) return "-";
    
    // Jika format sudah murni Teks (YYYY-MM-DD) dari perbaikan backend sebelumnya
    if (dateStr.length === 10) return dateStr;
    
    // Jika data berupa format UTC ISO (mengandung 'T' dan 'Z')
    // Kita panggil ulang dengan new Date() agar browser otomatis menggesernya ke GMT+7
    if (dateStr.includes('T')) {
        const d = new Date(dateStr);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    
    return String(dateStr).substring(0, 10);
}

function callAPI(action, data) {
    const loading = document.getElementById('loading');
    activeApiRequests += 1;
    if (loading) loading.classList.remove('hidden');

    return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, data: data || {}, token: localStorage.getItem('token') })
    })
    .then(response => {
        if (!response.ok) throw new Error('Server returned HTTP ' + response.status);
        return response.json();
    })
    .then(result => {
        if (result && result.status === 'error' && /Unauthorized/i.test(result.message || '') && action !== 'logout') {
            alert('Sesi Anda telah habis atau tidak valid. Silakan login kembali.');
            logout();
        }
        return result;
    })
    .catch(error => {
        console.error('API request failed (' + action + '):', error);
        return { status: 'error', message: error.message || 'Tidak dapat terhubung ke server.' };
    })
    .finally(() => {
        activeApiRequests = Math.max(0, activeApiRequests - 1);
        if (loading && activeApiRequests === 0) loading.classList.add('hidden');
    });
}

function login() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    callAPI('login', {username: u, password: p}).then(res => {
        if(res.status === 'success') {
            localStorage.setItem('token', res.data.token);
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('dashboardScreen').classList.remove('hidden');
            showPage('quote');
        } else alert('Login Gagal! Username/Password salah.');
    });
}

async function logout() {
    const token = localStorage.getItem('token');
    if (token) await callAPI('logout', {});
    localStorage.removeItem('token');
    location.reload();
}

function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('page-' + pageId).classList.remove('hidden');
    
    if (pageId === 'quote') {
        fetchHistory('quote');
    }
    if (pageId === 'invoice') {
        fetchHistory('quote'); 
        fetchHistory('invoice');
        fetchBanks(); 
        // FIX: Gunakan helper lokal, BUKAN new Date().toISOString()
        document.getElementById('i_date').value = getLocalDate();
    }
}

function formatRupiah(angka) {
    if(!angka || isNaN(angka)) return "0";
    return parseInt(angka).toLocaleString('id-ID');
}

function saveMasterItem() {
    const data = {
        mainCat: document.getElementById('m_mainCat').value,
        subCat: document.getElementById('m_subCat').value,
        name: document.getElementById('m_name').value,
        price: document.getElementById('m_price').value
    };
    if(!data.name || !data.price) return alert("Nama dan Harga wajib diisi!");
    
    callAPI('saveItem', data).then(res => {
        if(res.status === 'error') return alert("Error: " + res.message);
        alert('Item tersimpan dengan ID: ' + res.data.id);
        document.querySelectorAll('#page-master input').forEach(i => i.value='');
    });
}

function fetchMasterItems() {
    callAPI('getItems', {}).then(res => {
        if(res.status === 'success') {
            masterItems = res.data;
            const sel = document.getElementById('q_itemSelect');
            sel.innerHTML = '';
            masterItems.forEach(item => {
                sel.innerHTML += `<option value="${escapeHtml(item.ItemID)}">${escapeHtml(item.Name)} - Rp ${formatRupiah(item.Price)}</option>`;
            });
        }
    });
}

function fetchBanks() {
    callAPI('getBanks', {}).then(res => {
        if(res.status === 'success') {
            bankAccounts = res.data;
            const sel = document.getElementById('i_bank');
            sel.innerHTML = '<option value="">-- Pilih Rekening Pembayaran --</option>'; 
            bankAccounts.forEach(bank => {
                const bankInfo = `${bank.BankName} - ${bank.AccountNo} a/n ${bank.AccountName}`;
                sel.innerHTML += `<option value="${escapeHtml(bankInfo)}">${escapeHtml(bankInfo)}</option>`;
            });
        }
    });
}

function addQuoteItem() {
    const itemId = document.getElementById('q_itemSelect').value;
    const qty = parseFloat(document.getElementById('q_qty').value) || 1;
    const ket = document.getElementById('q_ket').value || '';
    const item = masterItems.find(i => i.ItemID === itemId);
    
    if(item) {
        const newItem = { 
            ...item, 
            Qty: qty, 
            Keterangan: ket, 
            Total: Math.round(parseFloat(item.Price) * qty) 
        };
        quoteItems.push(newItem);
        renderQuoteTable();
        
        document.getElementById('q_qty').value = 1;
        document.getElementById('q_ket').value = '';
    }
}

function renderQuoteTable() {
    const tbody = document.getElementById('q_tableBody');
    tbody.innerHTML = '';
    let grandTotal = 0;
    
    quoteItems.forEach((itm, index) => {
        const itemTotal = itm.Total ? parseInt(itm.Total) : Math.round(parseFloat(itm.Price) * (itm.Qty || 1));
        grandTotal += itemTotal;
        tbody.innerHTML += `<tr>
            <td class="p-2 border-b text-center">${index + 1}</td>
            <td class="p-2 border-b">${escapeHtml(itm.Name)}</td>
            <td class="p-2 border-b text-center">${escapeHtml(itm.Qty || 1)}</td>
            <td class="p-2 border-b text-right font-mono">Rp ${formatRupiah(itm.Price)}</td>
            <td class="p-2 border-b text-right font-mono text-blue-700 font-bold">Rp ${formatRupiah(itemTotal)}</td>
            <td class="p-2 border-b text-xs">${escapeHtml(itm.Keterangan || '-')}</td>
            <td class="p-2 border-b text-center"><button onclick="quoteItems.splice(${index},1); renderQuoteTable()" class="text-red-600 font-bold hover:underline">Hapus</button></td>
        </tr>`;
    });
    document.getElementById('q_total').innerText = formatRupiah(grandTotal);
}

function generateQuotation() {
    const toName = document.getElementById('q_to').value;
    if(!toName || quoteItems.length === 0) return alert('Data klien & Item tidak boleh kosong!');

    let total = quoteItems.reduce((sum, itm) => sum + (itm.Total ? parseInt(itm.Total) : Math.round(parseFloat(itm.Price) * (itm.Qty || 1))), 0);
    
    const senderData = {
        name: document.getElementById('q_sender_name').value || 'Fiky Alannuari',
        phone: document.getElementById('q_sender_phone').value || '',
        address: document.getElementById('q_sender_address').value || ''
    };

    const data = {
        toName: toName,
        phone: document.getElementById('q_phone').value,
        address: document.getElementById('q_address').value,
        desc: document.getElementById('q_desc').value,
        items: { itemsList: quoteItems, senderInfo: senderData },
        total: total
    };

    callAPI('saveQuotation', data).then(res => {
        if(res.status === 'error') return alert("Gagal menyimpan Quotation: " + res.message);
        alert('Quotation Sukses dibuat! ID: ' + res.data.id);
        
        quoteItems = []; renderQuoteTable(); 
        document.getElementById('q_to').value = '';
        document.getElementById('q_phone').value = '';
        document.getElementById('q_address').value = '';
        document.getElementById('q_desc').value = '';
        
        // FIX: Gunakan helper tanggal lokal
        const localDate = getLocalDate();

        const previewData = { ...data, QuoteID: res.data.id, Date: localDate };
        previewData.ItemsJSON = JSON.stringify(data.items); 
        
        fetchHistory('quote'); 
        buildQuotePDF(previewData, data.items.itemsList, senderData); 
    });
}

function populateQuoteDropdown() {
    const select = document.getElementById('i_quoteRef');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih Quotation ID --</option>';
    historyQuotes.forEach(q => {
        select.innerHTML += `<option value="${escapeHtml(q.QuoteID)}">${escapeHtml(q.QuoteID)} | ${escapeHtml(q.ToName)} | Rp ${formatRupiah(q.Total)}</option>`;
    });
}

function loadQuoteIntoInvoice() {
    const qID = document.getElementById('i_quoteRef').value;
    if(!qID) return; 
    
    const quote = historyQuotes.find(q => q.QuoteID === qID);
    if(quote) {
        let parsed = safeJsonParse(quote.ItemsJSON, []);
        if (Array.isArray(parsed)) {
            invoiceItems = parsed;
            activeSenderInfo = { name: 'Fiky Alannuari', phone: '0813-8792-6814', address: 'Cengkareng, Jakarta Barat 11730' };
        } else {
            invoiceItems = parsed.itemsList || [];
            activeSenderInfo = parsed.senderInfo || { name: 'Fiky Alannuari', phone: '', address: '' };
        }
        renderInvoiceTable();
    } else {
        alert(`Quotation ${qID} tidak ditemukan di sistem.`);
    }
}

function renderInvoiceTable() {
    const tbody = document.getElementById('i_tableBody');
    tbody.innerHTML = '';
    invSubTotal = 0;

    if(invoiceItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-2 text-center text-gray-400">Belum ada item ditarik</td></tr>`;
        calculateInvoice();
        return;
    }

    invoiceItems.forEach((itm, index) => {
        const itemTotal = itm.Total ? parseInt(itm.Total) : Math.round(parseFloat(itm.Price) * (itm.Qty || 1));
        invSubTotal += itemTotal;
        tbody.innerHTML += `<tr>
            <td class="p-2 border-b text-center">${index + 1}</td>
            <td class="p-2 border-b text-sm">${escapeHtml(itm.Name)}</td>
            <td class="p-2 border-b text-center">${escapeHtml(itm.Qty || 1)}</td>
            <td class="p-2 border-b text-right font-mono">Rp ${formatRupiah(itm.Price)}</td>
            <td class="p-2 border-b text-right font-mono font-bold text-indigo-700">Rp ${formatRupiah(itemTotal)}</td>
            <td class="p-2 border-b text-xs">${escapeHtml(itm.Keterangan || '-')}</td>
        </tr>`;
    });
    
    document.getElementById('i_subTotal').innerText = formatRupiah(invSubTotal);
    calculateInvoice();
}

function calculateInvoice() {
    const isPPN = document.getElementById('i_ppn').checked;
    const pphStatus = document.getElementById('i_pph_status').value;
    
    invTaxPPN = isPPN ? Math.round(invSubTotal * 0.11) : 0;
    
    if (pphStatus === 'dipotong_2') {
        invTaxPPh = Math.round(invSubTotal * 0.02);
        invGrandTotal = invSubTotal + invTaxPPN - invTaxPPh;
    } else if (pphStatus === 'ditanggung_2') {
        const gross = invSubTotal / 0.98;
        invTaxPPh = Math.round(gross - invSubTotal);
        invGrandTotal = invSubTotal + invTaxPPN + invTaxPPh;
    } else if (pphStatus === 'dipotong_25') {
        invTaxPPh = Math.round(invSubTotal * 0.025);
        invGrandTotal = invSubTotal + invTaxPPN - invTaxPPh;
    } else if (pphStatus === 'ditanggung_25') {
        const gross = invSubTotal / 0.975;
        invTaxPPh = Math.round(gross - invSubTotal);
        invGrandTotal = invSubTotal + invTaxPPN + invTaxPPh;
    } else {
        invTaxPPh = 0;
        invGrandTotal = invSubTotal + invTaxPPN;
    }
    
    document.getElementById('i_grandTotal').innerText = formatRupiah(invGrandTotal);
}

function getBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('File tidak ditemukan.'));
        if (file.size > 5 * 1024 * 1024) return reject(new Error('Ukuran file maksimal 5 MB.'));
        if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
            return reject(new Error('Format file yang diizinkan: PDF, JPG, PNG.'));
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = String(reader.result || '');
            if (!result.includes(',')) return reject(new Error('Gagal membaca file.'));
            resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(new Error('Gagal membaca file.'));
    });
}

async function generateInvoice() {
    try {
        const quoteRef = document.getElementById('i_quoteRef').value;
        if(invoiceItems.length === 0) return alert('Pilih dan tarik data dari Quotation terlebih dahulu!');
        
        const bank = document.getElementById('i_bank').value;
        if(!bank) return alert('Silakan pilih rekening pembayaran terlebih dahulu!');

        const notes = document.getElementById('i_notes').value;
        const invDate = document.getElementById('i_date').value; // Tarik Data Tanggal Manual
        
        const fileElement = document.getElementById('i_file');
        const fileInput = (fileElement && fileElement.files) ? fileElement.files[0] : null;

        const data = {
            quoteId: quoteRef, 
            date: invDate, // Kirim ke Backend
            items: { itemsList: invoiceItems, senderInfo: activeSenderInfo }, 
            ppnEnabled: document.getElementById('i_ppn').checked,
            pphStatus: document.getElementById('i_pph_status').value,
            bankId: bank,
            notes: notes
        };

        const res = await callAPI('saveInvoice', data);
        if(res.status === 'error') throw new Error(res.message); 
        
        let uploadedFileUrl = null;
        let uploadWarning = '';
        if(fileInput) {
            try {
                const b64 = await getBase64(fileInput);
                const uploadRes = await callAPI('uploadFile', {
                    refId: res.data.id, filename: fileInput.name, mimeType: fileInput.type, base64: b64
                });
                if(uploadRes.status === 'success') uploadedFileUrl = uploadRes.data.fileUrl;
                else uploadWarning = uploadRes.message || 'Lampiran belum berhasil diunggah.';
            } catch(uploadError) {
                uploadWarning = uploadError.message || 'Lampiran belum berhasil diunggah.';
            }
        }

        alert('Invoice berhasil dibuat. PIN akses: ' + res.data.pin +
            (uploadWarning ? '\n\nPERHATIAN: Invoice tersimpan, tetapi lampiran gagal diunggah: ' + uploadWarning : ''));
        fetchHistory('invoice');

        const previewData = {
            InvID: res.data.id, Date: invDate, ViewCode: res.data.pin,
            SubTotal: res.data.subTotal, TaxPPN: res.data.taxPPN, TaxPPh: res.data.taxPPh, Total: res.data.total,
            Notes: notes, BankID: bank, UploadedFileURL: uploadedFileUrl
        };
        buildInvoicePDF(previewData, invoiceItems, activeSenderInfo);
        
        document.getElementById('i_quoteRef').value = '';
        invoiceItems = []; renderInvoiceTable();
        document.getElementById('i_notes').value = '';
        if(fileElement) fileElement.value = '';
        document.getElementById('i_pph_status').value = 'none';

    } catch (error) {
        console.error("Invoice Error: ", error);
        alert("Terjadi kesalahan saat memproses data: " + error.message);
    }
}

function fetchHistory(type) {
    if(type === 'quote') {
        document.getElementById('history_quoteBody').innerHTML = '<tr><td colspan="6" class="text-center p-4">Sedang memuat data...</td></tr>';
        callAPI('getQuotations', {}).then(res => {
            if(res.status === 'success') {
                historyQuotes = res.data.slice().reverse(); 
                const tbody = document.getElementById('history_quoteBody');
                tbody.innerHTML = historyQuotes.length ? '' : '<tr><td colspan="6" class="text-center p-4">Tidak ada data</td></tr>';
                
                historyQuotes.forEach((q, idx) => {
                    tbody.innerHTML += `<tr class="border-b hover:bg-blue-50">
                        <td class="p-2 font-bold">${escapeHtml(q.QuoteID)}</td>
                        <td class="p-2 text-sm">${escapeHtml(q.ToName)}</td>
                        <td class="p-2 text-xs truncate max-w-xs">${escapeHtml(q.Description || '-')}</td>
                        <td class="p-2 text-sm">${escapeHtml(formatTgl(q.Date))}</td>
                        <td class="p-2 text-right font-bold text-blue-700 font-mono">Rp ${formatRupiah(q.Total)}</td>
                        <td class="p-2 text-center">
                            <button onclick="previewHistoryQuote(${idx})" class="bg-gray-700 text-white px-3 py-1 rounded text-xs hover:bg-black">Lihat PDF</button>
                        </td>
                    </tr>`;
                });
                populateQuoteDropdown();
            }
        });
    }

    if(type === 'invoice') {
        document.getElementById('history_invoiceBody').innerHTML = '<tr><td colspan="6" class="text-center p-4">Sedang memuat data...</td></tr>';
        
        // Perbaikan Race Condition: Request berjalan paralel dan diproses bersamaan
        Promise.all([
            callAPI('getUploads', {}),
            callAPI('getInvoices', {})
        ]).then(([resUp, resInv]) => {
            if(resUp && resUp.status === 'success') {
                historyUploads = resUp.data;
            }
            if(resInv && resInv.status === 'success') {
                historyInvoices = resInv.data.slice().reverse();
                const tbody = document.getElementById('history_invoiceBody');
                tbody.innerHTML = historyInvoices.length ? '' : '<tr><td colspan="6" class="text-center p-4">Tidak ada data</td></tr>';
                
                historyInvoices.forEach((inv, idx) => {
                    const pubUrl = window.location.origin + window.location.pathname + "?doc=" + encodeURIComponent(inv.InvID);
                    tbody.innerHTML += `<tr class="border-b hover:bg-indigo-50">
                        <td class="p-2 font-bold">${escapeHtml(inv.InvID)}</td>
                        <td class="p-2 text-xs text-gray-500">${escapeHtml(inv.QuoteID || '-')}</td>
                        <td class="p-2 text-sm">${escapeHtml(formatTgl(inv.Date))}</td>
                        <td class="p-2 text-right font-bold text-indigo-700 font-mono">Rp ${formatRupiah(inv.Total)}</td>
                        <td class="p-2 text-center">
                            <div class="text-xs mb-1 font-bold text-green-700 border bg-green-50 rounded p-1 inline-block">PIN: ${escapeHtml(inv.ViewCode)}</div><br>
                            <button data-copy-url="${escapeHtml(pubUrl)}" onclick="copyInvoiceLink(this.dataset.copyUrl)" class="text-xs bg-gray-200 border px-2 py-1 rounded hover:bg-gray-300">Copy Link</button>
                        </td>
                        <td class="p-2 text-center">
                            <button onclick="previewHistoryInvoice(${idx})" class="bg-gray-700 text-white px-3 py-1 rounded text-xs hover:bg-black">Lihat PDF</button>
                        </td>
                    </tr>`;
                });
            }
        });
    }
}

function previewHistoryQuote(index) {
    const q = historyQuotes[index];
    let parsed = safeJsonParse(q.ItemsJSON, []);
    let items = Array.isArray(parsed) ? parsed : (parsed.itemsList || []);
    let sender = Array.isArray(parsed) ? { name: 'Fiky Alannuari', phone: '0813-8792-6814', address: 'Cengkareng, Jakarta Barat 11730' } : (parsed.senderInfo || {});
    buildQuotePDF(q, items, sender);
}

function previewHistoryInvoice(index) {
    const inv = historyInvoices[index];
    let parsed = safeJsonParse(inv.ItemsJSON, []);
    let items = Array.isArray(parsed) ? parsed : (parsed.itemsList || []);
    let sender = Array.isArray(parsed) ? { name: 'Fiky Alannuari', phone: '0813-8792-6814', address: 'Cengkareng, Jakarta Barat 11730' } : (parsed.senderInfo || {});
    buildInvoicePDF(inv, items, sender);
}

let activeDocName = "Dokumen";

function buildQuotePDF(qData, items, sender) {
    activeDocName = `Quotation_${qData.QuoteID}`;
    const html = `
        <div class="flex justify-between items-start mb-8 border-b-4 border-blue-800 pb-4">
            <div>
                <h1 class="text-4xl font-extrabold text-blue-800 tracking-wider">QUOTATION</h1>
                <p class="text-gray-600 mt-2 text-lg font-bold">${escapeHtml(qData.QuoteID)}</p>
            </div>
            <div class="text-right">
                <h2 class="font-bold text-xl">${escapeHtml(sender.name)}</h2>
                <p class="text-sm whitespace-pre-line">${escapeHtml(sender.address)}</p>
                <p class="text-sm">Telp: ${escapeHtml(sender.phone)}</p>
                <p class="text-sm mt-4 text-gray-600">Tgl Terbit: ${escapeHtml(formatTgl(qData.Date))}</p>
            </div>
        </div>

        <div class="mb-8">
            <h3 class="font-bold text-gray-700 border-b mb-2">Ditujukan Kepada:</h3>
            <p class="font-bold text-xl">${escapeHtml(qData.ToName)}</p>
            <p class="text-sm">${escapeHtml(qData.Phone || '')}</p>
            <p class="text-sm whitespace-pre-line max-w-sm">${escapeHtml(qData.Address || '')}</p>
            ${qData.Description ? `<div class="mt-4 p-3 bg-blue-50 border-l-4 border-blue-500 text-sm"><b>Perihal/Tujuan:</b><br>${escapeHtml(qData.Description)}</div>` : ''}
        </div>
        
        <table class="w-full text-left mb-6 border-collapse text-sm border border-gray-400">
            <tr class="bg-blue-100 text-blue-900">
                <th class="p-2 border border-gray-400 font-bold text-center w-8">No</th>
                <th class="p-2 border border-gray-400 font-bold">Deskripsi</th>
                <th class="p-2 border border-gray-400 font-bold text-center w-12">Qty</th>
                <th class="p-2 border border-gray-400 font-bold text-right w-28">Harga Satuan<br>(Rp)</th>
                <th class="p-2 border border-gray-400 font-bold text-right w-28">Total Harga<br>(Rp)</th>
                <th class="p-2 border border-gray-400 font-bold w-40">Keterangan</th>
            </tr>
            ${items.map((i, idx) => `
            <tr>
                <td class="p-2 border border-gray-400 text-center">${idx + 1}</td>
                <td class="p-2 border border-gray-400">${escapeHtml(i.Name)}</td>
                <td class="p-2 border border-gray-400 text-center">${escapeHtml(i.Qty || 1)}</td>
                <td class="p-2 border border-gray-400 text-right font-mono">${formatRupiah(i.Price)}</td>
                <td class="p-2 border border-gray-400 text-right font-mono">${formatRupiah(i.Total || Math.round(parseFloat(i.Price)*(i.Qty||1)))}</td>
                <td class="p-2 border border-gray-400 text-xs">${escapeHtml(i.Keterangan || '')}</td>
            </tr>
            `).join('')}
        </table>
        
        <div class="flex flex-col items-end mt-4">
            <div class="bg-blue-800 text-white p-4 rounded min-w-[300px] mb-4">
                <div class="flex justify-between font-bold text-xl"><span>GRAND TOTAL:</span> <span>Rp ${formatRupiah(qData.Total)}</span></div>
            </div>
        </div>
        
        <div class="mt-4 text-xs text-gray-700 bg-gray-100 p-3 rounded">
            - Harga sudah termasuk diskon promo dan biaya kirim.<br>
            - Penawaran berlaku selama 14 hari.<br>
            - Harga perseorangan (belum termasuk PPh23).<br>
            - Pembayaran minimal DP 70% dari total biaya pesanan.<br>
            Harap ditransfer ke <strong class="text-blue-900">BCA - 6470598008 - Fiky Alannuari</strong> sebesar Rp ${formatRupiah(Math.round(parseFloat(qData.Total * 0.7)))}
        </div>
        
        <div class="mt-6 pt-4 text-center text-sm text-gray-800">
            <p>Demikian penawaran harga ini disampaikan. Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.</p>
        </div>
        <div class="mt-12 pt-4 text-right text-sm text-gray-800">
            <p class="mt-6 mb-16">Hormat Saya,         </p>
            <p class="font-bold border-t border-gray-400 inline-block px-8 pt-2">Fiky Alannuari</p>
        </div>
        
    `;
    openPDFModal(html);
}

function buildInvoicePDF(invData, items, sender) {
    activeDocName = `Invoice_${invData.InvID}`;
    const pubUrl = window.location.origin + window.location.pathname + "?doc=" + encodeURIComponent(invData.InvID);
    
    let taxHTML = '';
    if(parseInt(invData.TaxPPN) > 0) {
        taxHTML += `<div class="flex justify-between mb-2"><span>PPN (11%):</span> <span>Rp ${formatRupiah(invData.TaxPPN)}</span></div>`;
    }
    
    if(parseInt(invData.TaxPPh) > 0) {
        const sub = parseInt(invData.SubTotal);
        const ppn = parseInt(invData.TaxPPN);
        const pph = parseInt(invData.TaxPPh);
        const tot = parseInt(invData.Total);

        const isDipotong = (tot === (sub + ppn - pph));
        const isDitanggung = (tot === (sub + ppn + pph));

        let rateStr = "2%";
        let impliedRate = 0;
        if (isDipotong) impliedRate = (pph / sub) * 100;
        if (isDitanggung) impliedRate = (pph / (sub + pph)) * 100;
        
        if (Math.abs(impliedRate - 2.5) < 0.1) rateStr = "2.5%";

        if (isDipotong) {
            taxHTML += `<div class="flex justify-between mb-2 text-red-600 border-b border-gray-300 pb-2"><span>Dipotong PPh (${rateStr}):</span><span>(Rp ${formatRupiah(pph)})</span></div>`;
        } else if (isDitanggung) {
            taxHTML += `<div class="flex justify-between mb-2 text-green-700 border-b border-gray-300 pb-2"><span>Ditanggung PPh (${rateStr}) Gross Up:</span><span>Rp ${formatRupiah(pph)}</span></div>`;
        } else {
            taxHTML += `<div class="flex justify-between mb-2 text-gray-600 border-b border-gray-300 pb-2"><span>PPh:</span><span>Rp ${formatRupiah(pph)}</span></div>`;
        }
    }

    const uploadRec = historyUploads.find(u => u.RefID === invData.InvID);
    const finalFileUrl = safeHttpUrl(uploadRec ? uploadRec.FileURL : (invData.UploadedFileURL || '')) || null;
    const uploadHTML = finalFileUrl ? `<p class="text-sm mt-3 pt-3 border-t border-gray-200"><b>Lampiran Bukti Pekerjaan:</b><br><a href="${escapeHtml(finalFileUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline break-all">${escapeHtml(finalFileUrl)}</a></p>` : '';

    const notesStr = (invData.Notes || '').trim();
    const notesHTML = (notesStr !== '' && notesStr !== '-') ? `<p class="text-sm mt-3 whitespace-pre-line">Catatan:<br>${escapeHtml(notesStr)}</p>` : '';

    const html = `
        <div class="flex justify-between items-start mb-8 border-b-4 border-indigo-800 pb-4">
            <div>
                <h1 class="text-4xl font-extrabold text-indigo-800 tracking-wider">INVOICE</h1>
                <p class="text-gray-600 mt-2 text-lg font-bold">${escapeHtml(invData.InvID)}</p>
                
                <!-- PERBAIKAN: Menggunakan div, melimitasi width, dan memaksa word-break pada URL -->
                <div style="margin-top: 15px; background-color: #eef2ff; border: 1px solid #c7d2fe; padding: 12px; border-radius: 6px; width: 340px; max-width: 100%;">
                    <div style="font-weight: bold; font-size: 12px; color: #312e81; margin-bottom: 6px;">Link Akses E-Invoice Klien:</div>
                    <div style="font-family: monospace; color: #2563eb; font-size: 11px; margin-bottom: 10px; word-break: break-all; line-height: 1.4;">${escapeHtml(pubUrl)}</div>
                    <div style="font-size: 12px; color: #1e1b4b; font-weight: bold;">PIN AKSES: <span style="font-size: 18px; color: #4338ca; letter-spacing: 2px;">${escapeHtml(invData.ViewCode)}</span></div>
                </div>

            </div>
            <div class="text-right">
                <h2 class="font-bold text-xl">${escapeHtml(sender.name)}</h2>
                <p class="text-sm whitespace-pre-line">${escapeHtml(sender.address)}</p>
                <p class="text-sm">Telp: ${escapeHtml(sender.phone)}</p>
                <p class="text-sm mt-4 text-gray-600">Tgl Terbit: ${escapeHtml(formatTgl(invData.Date))}</p>
            </div>
        </div>
        
        <table class="w-full text-left mt-6 mb-6 border-collapse text-sm border border-gray-400">
            <tr class="bg-indigo-100 text-indigo-900">
                <th class="p-2 border border-gray-400 font-bold text-center w-8">No</th>
                <th class="p-2 border border-gray-400 font-bold">Deskripsi Penagihan</th>
                <th class="p-2 border border-gray-400 font-bold text-center w-12">Qty</th>
                <th class="p-2 border border-gray-400 font-bold text-right w-28">Harga Satuan<br>(Rp)</th>
                <th class="p-2 border border-gray-400 font-bold text-right w-28">Jumlah<br>(Rp)</th>
                <th class="p-2 border border-gray-400 font-bold w-40">Keterangan</th>
            </tr>
            ${items.map((i, idx) => `
            <tr>
                <td class="p-2 border border-gray-400 text-center">${idx + 1}</td>
                <td class="p-2 border border-gray-400">${escapeHtml(i.Name)}</td>
                <td class="p-2 border border-gray-400 text-center">${i.Qty || 1}</td>
                <td class="p-2 border border-gray-400 text-right font-mono">${formatRupiah(i.Price)}</td>
                <td class="p-2 border border-gray-400 text-right font-mono">${formatRupiah(i.Total || Math.round(parseFloat(i.Price)*(i.Qty||1)))}</td>
                <td class="p-2 border border-gray-400 text-xs">${escapeHtml(i.Keterangan || '')}</td>
            </tr>
            `).join('')}
        </table>
        
        <div class="flex flex-col items-end mt-4">
            <div class="w-80 text-right">
                <div class="flex justify-between mb-2"><span>SubTotal:</span> <span>Rp ${formatRupiah(invData.SubTotal)}</span></div>
                ${taxHTML}
                <div class="flex justify-between mt-2 pt-2 border-t-2 border-gray-800 font-bold text-2xl text-indigo-800"><span>TOTAL:</span> <span>Rp ${formatRupiah(invData.Total)}</span></div>
            </div>
        </div>
        
        <div class="mt-12 border-2 border-gray-300 p-4 bg-gray-50 rounded">
            <p class="font-bold text-gray-800 mb-2">Informasi Pembayaran:</p>
            <p class="font-mono text-xl text-indigo-700 font-bold">${escapeHtml(invData.BankID)} (Rp ${formatRupiah(Math.round(parseFloat(invData.Total - (invData.SubTotal * 0.7))))})</p>
            ${notesHTML}
            ${uploadHTML}
        </div>
        
        <div class="mt-12 text-center text-sm text-gray-500">Terima kasih atas kepercayaan Anda bekerja sama dengan kami.</div>
    `;
    openPDFModal(html);
}

function openPDFModal(htmlContent) {
    document.getElementById('pdfRenderArea').innerHTML = htmlContent;
    document.getElementById('pdfModal').classList.remove('hidden');
}

function closePDFModal() {
    document.getElementById('pdfModal').classList.add('hidden');
}

function downloadPDF(elementId, fileName) {
    const element = document.getElementById(elementId);
    const opt = {
        margin:       [5, 0, 10, 0],
        filename:     fileName + '.pdf',
        image:        { type: 'jpeg', quality: 1 },
        // KUNCI FIX: Hapus windowWidth, lalu tambahkan scrollX: 0 dan scrollY: 0 
        // agar mesin selalu menangkap pas dari ujung kiri atas elemen PDF.
        html2canvas:  { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}

function downloadActivePDF() {
    downloadPDF('pdfRenderArea', activeDocName);
}

function unlockPublicDoc() {
    const pin = document.getElementById('publicPin').value;
    callAPI('publicView', { docId: viewDocId, pin: pin }).then(res => {
        if(res.status === 'success') {
            document.getElementById('pinForm').classList.add('hidden');
            document.getElementById('publicDocContent').classList.remove('hidden');
            
            const data = res.data;
            let parsed = safeJsonParse(data.ItemsJSON, []);
            let items = Array.isArray(parsed) ? parsed : (parsed.itemsList || []);
            let sender = Array.isArray(parsed) ? { name: 'Fiky Alannuari', phone: '0813-8792-6814', address: 'Cengkareng, Jakarta Barat 11730' } : (parsed.senderInfo || {});
            
            buildInvoicePDF(data, items, sender);
            document.getElementById('renderedPublicDoc').innerHTML = document.getElementById('pdfRenderArea').innerHTML;
            closePDFModal(); 
        } else {
            alert('PIN Salah atau Dokumen tidak ditemukan!');
        }
    });
}