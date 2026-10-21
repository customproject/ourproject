// ==========================================
// KONFIGURASI FRONTEND
// ==========================================
// PASTE URL DEPLOYMENT APPS SCRIPT ANDA DI SINI:
const API_URL = "https://script.google.com/macros/s/AKfycbwkXo-QvX9KU-LPBXU6bbBukUdKMHycrWy0CI9K-Hkl6lxbQs2nN-OE5h9n4GFirimF/exec"; 

// State Application
let masterItems = [];
let bankAccounts = [];
let quoteItems = [];
let invoiceItems = []; 
let historyQuotes = [];
let historyInvoices = [];

// Variabel untuk menyimpan State Kalkulasi Invoice
let invSubTotal = 0;
let invTaxPPN = 0;
let invTaxPPh = 0;
let invGrandTotal = 0;

// Cek Mode Public View saat halaman dimuat
const urlParams = new URLSearchParams(window.location.search);
const viewDocId = urlParams.get('doc');

if (viewDocId) {
    document.getElementById('publicViewArea').classList.remove('hidden');
} else {
    document.getElementById('adminArea').classList.remove('hidden');
    if(localStorage.getItem('token')) {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('dashboardScreen').classList.remove('hidden');
        showPage('quote'); // Default page saat login
    }
}

// --- CORE SYSTEM ---

function callAPI(action, data) {
    document.getElementById('loading').classList.remove('hidden');
    return fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: action, data: data }),
    }).then(res => res.json())
      .finally(() => document.getElementById('loading').classList.add('hidden'));
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

function logout() {
    localStorage.removeItem('token');
    location.reload();
}

function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('page-' + pageId).classList.remove('hidden');
    
    // Auto load data history & banks saat navigasi halaman
    if (pageId === 'quote') fetchHistory('quote');
    if (pageId === 'invoice') {
        fetchHistory('invoice');
        fetchBanks(); // Load bank rekening dari database spreadsheet
    }
}

// --- MASTER DATA & HELPER FORMATTER ---

function formatRupiah(angka) {
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
        alert('Item tersimpan dengan ID: ' + res.data.id);
        document.querySelectorAll('#page-master input').forEach(i => i.value='');
    });
}

function fetchMasterItems() {
    callAPI('getItems', {}).then(res => {
        masterItems = res.data;
        const sel = document.getElementById('q_itemSelect');
        sel.innerHTML = '';
        masterItems.forEach(item => {
            sel.innerHTML += `<option value="${item.ItemID}">${item.Name} - Rp ${formatRupiah(item.Price)}</option>`;
        });
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
                sel.innerHTML += `<option value="${bankInfo}">${bankInfo}</option>`;
            });
        }
    });
}

// --- QUOTATION LOGIC ---

function addQuoteItem() {
    const itemId = document.getElementById('q_itemSelect').value;
    const item = masterItems.find(i => i.ItemID === itemId);
    if(item) {
        quoteItems.push(item);
        renderQuoteTable();
    }
}

function renderQuoteTable() {
    const tbody = document.getElementById('q_tableBody');
    tbody.innerHTML = '';
    let total = 0;
    quoteItems.forEach((itm, index) => {
        total += parseInt(itm.Price);
        tbody.innerHTML += `<tr>
            <td class="p-2 border-b">${itm.Name}</td>
            <td class="p-2 border-b text-right font-mono">Rp ${formatRupiah(itm.Price)}</td>
            <td class="p-2 border-b text-center"><button onclick="quoteItems.splice(${index},1); renderQuoteTable()" class="text-red-600 font-bold hover:underline">Hapus</button></td>
        </tr>`;
    });
    document.getElementById('q_total').innerText = formatRupiah(total);
}

function generateQuotation() {
    const toName = document.getElementById('q_to').value;
    if(!toName || quoteItems.length === 0) return alert('Data klien & Item tidak boleh kosong!');

    let total = quoteItems.reduce((sum, item) => sum + parseInt(item.Price), 0);
    const data = {
        toName: toName,
        phone: document.getElementById('q_phone').value,
        address: document.getElementById('q_address').value,
        desc: document.getElementById('q_desc').value,
        items: quoteItems,
        total: total
    };

    callAPI('saveQuotation', data).then(res => {
        alert('Quotation Sukses dibuat! ID: ' + res.data.id);
        
        // Reset form
        quoteItems = []; 
        renderQuoteTable(); 
        document.getElementById('q_to').value = '';
        document.getElementById('q_phone').value = '';
        document.getElementById('q_address').value = '';
        document.getElementById('q_desc').value = '';
        
        // Construct temporary object to preview PDF immediately
        const previewData = { ...data, QuoteID: res.data.id, Date: new Date().toISOString() };
        previewData.ItemsJSON = JSON.stringify(data.items); 
        
        fetchHistory('quote'); 
        buildQuotePDF(previewData, data.items); 
    });
}

// --- INVOICE LOGIC ---

function loadQuoteIntoInvoice() {
    const qID = document.getElementById('i_quoteRef').value.trim();
    if(!qID) return alert("Masukkan ID Quotation terlebih dahulu.");
    
    // Cari di dalam state historyQuotes (pastikan sudah diload dari Spreadsheet)
    const quote = historyQuotes.find(q => q.QuoteID === qID);
    if(quote) {
        invoiceItems = JSON.parse(quote.ItemsJSON || '[]');
        renderInvoiceTable();
        alert(`Data item dari ${qID} berhasil ditarik.`);
    } else {
        alert(`Quotation ${qID} tidak ditemukan. Harap pastikan ID ditulis dengan benar dan sudah direfresh.`);
    }
}

function renderInvoiceTable() {
    const tbody = document.getElementById('i_tableBody');
    tbody.innerHTML = '';
    invSubTotal = 0;

    if(invoiceItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="p-2 text-center text-gray-400">Belum ada item ditarik</td></tr>`;
        calculateInvoice();
        return;
    }

    invoiceItems.forEach(itm => {
        invSubTotal += parseInt(itm.Price);
        tbody.innerHTML += `<tr>
            <td class="p-2 border-b text-sm">${itm.Name}</td>
            <td class="p-2 border-b text-right font-mono">Rp ${formatRupiah(itm.Price)}</td>
        </tr>`;
    });
    
    document.getElementById('i_subTotal').innerText = formatRupiah(invSubTotal);
    calculateInvoice();
}

function calculateInvoice() {
    const isPPN = document.getElementById('i_ppn').checked;
    const isPPh = document.getElementById('i_pph23').checked;
    
    // Menggunakan Math.round agar tidak ada bilangan desimal pada hasil persentase pajak
    invTaxPPN = isPPN ? Math.round(invSubTotal * 0.11) : 0;
    invTaxPPh = isPPh ? Math.round(invSubTotal * 0.02) : 0;
    invGrandTotal = invSubTotal + invTaxPPN - invTaxPPh;
    
    document.getElementById('i_grandTotal').innerText = formatRupiah(invGrandTotal);
}

// Helper: Convert File to Base64 untuk Upload Drive
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); 
        reader.onerror = error => reject(error);
    });
}

async function generateInvoice() {
    const quoteRef = document.getElementById('i_quoteRef').value;
    if(invoiceItems.length === 0) return alert('Tarik data dari Quotation terlebih dahulu agar ada item yang ditagihkan!');
    
    const bank = document.getElementById('i_bank').value;
    if(!bank) return alert('Silakan pilih rekening pembayaran terlebih dahulu!');

    const notes = document.getElementById('i_notes').value;
    const fileInput = document.getElementById('i_file').files[0];

    const data = {
        quoteId: quoteRef, items: invoiceItems, 
        subTotal: invSubTotal, taxPPN: invTaxPPN, taxPPh: invTaxPPh, total: invGrandTotal, 
        bankId: bank, notes: notes
    };

    const res = await callAPI('saveInvoice', data);
    
    if(fileInput) {
        const b64 = await getBase64(fileInput);
        await callAPI('uploadFile', {
            refId: res.data.id, filename: fileInput.name, mimeType: fileInput.type, base64: b64
        });
    }

    alert('Invoice Sukses Dibuat! PIN Akses: ' + res.data.pin);
    fetchHistory('invoice'); 
    
    // Construct preview object
    const previewData = {
        InvID: res.data.id, Date: new Date().toISOString(), ViewCode: res.data.pin,
        SubTotal: invSubTotal, TaxPPN: invTaxPPN, TaxPPh: invTaxPPh, Total: invGrandTotal,
        Notes: notes, BankID: bank
    };
    buildInvoicePDF(previewData, invoiceItems);
    
    // Reset Form Invoice
    document.getElementById('i_quoteRef').value = '';
    invoiceItems = []; renderInvoiceTable();
    document.getElementById('i_notes').value = '';
    document.getElementById('i_file').value = '';
}


// --- HISTORY FETCHING & RENDERING ---

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
                        <td class="p-2 font-bold">${q.QuoteID}</td>
                        <td class="p-2 text-sm">${q.ToName}</td>
                        <td class="p-2 text-xs truncate max-w-xs">${q.Description || '-'}</td>
                        <td class="p-2 text-sm">${q.Date.substring(0,10)}</td>
                        <td class="p-2 text-right font-bold text-blue-700 font-mono">Rp ${formatRupiah(q.Total)}</td>
                        <td class="p-2 text-center">
                            <button onclick="previewHistoryQuote(${idx})" class="bg-gray-700 text-white px-3 py-1 rounded text-xs hover:bg-black">Lihat PDF</button>
                        </td>
                    </tr>`;
                });
            }
        });
    }

    if(type === 'invoice') {
        document.getElementById('history_invoiceBody').innerHTML = '<tr><td colspan="6" class="text-center p-4">Sedang memuat data...</td></tr>';
        callAPI('getInvoices', {}).then(res => {
            if(res.status === 'success') {
                historyInvoices = res.data.slice().reverse();
                const tbody = document.getElementById('history_invoiceBody');
                tbody.innerHTML = historyInvoices.length ? '' : '<tr><td colspan="6" class="text-center p-4">Tidak ada data</td></tr>';
                
                historyInvoices.forEach((inv, idx) => {
                    const pubUrl = window.location.origin + window.location.pathname + "?doc=" + inv.InvID;
                    tbody.innerHTML += `<tr class="border-b hover:bg-indigo-50">
                        <td class="p-2 font-bold">${inv.InvID}</td>
                        <td class="p-2 text-xs text-gray-500">${inv.QuoteID || '-'}</td>
                        <td class="p-2 text-sm">${inv.Date.substring(0,10)}</td>
                        <td class="p-2 text-right font-bold text-indigo-700 font-mono">Rp ${formatRupiah(inv.Total)}</td>
                        <td class="p-2 text-center">
                            <div class="text-xs mb-1 font-bold text-green-700 border bg-green-50 rounded p-1 inline-block">PIN: ${inv.ViewCode}</div><br>
                            <button onclick="navigator.clipboard.writeText('${pubUrl}'); alert('Link disalin!')" class="text-xs bg-gray-200 border px-2 py-1 rounded hover:bg-gray-300">Copy Link</button>
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
    const items = JSON.parse(q.ItemsJSON || '[]');
    buildQuotePDF(q, items);
}

function previewHistoryInvoice(index) {
    const inv = historyInvoices[index];
    const items = JSON.parse(inv.ItemsJSON || '[]');
    buildInvoicePDF(inv, items);
}


// --- PDF RENDERER & MODAL HANDLER ---
let activeDocName = "Dokumen";

function buildQuotePDF(qData, items) {
    activeDocName = `Quotation_${qData.QuoteID}`;
    const html = `
        <div class="flex justify-between items-start mb-8 border-b-4 border-blue-800 pb-4">
            <div>
                <h1 class="text-4xl font-extrabold text-blue-800 tracking-wider">QUOTATION</h1>
                <p class="text-gray-600 mt-2 text-lg font-bold">${qData.QuoteID}</p>
            </div>
            <div class="text-right">
                <h2 class="font-bold text-xl">PT NAMA BISNIS ANDA</h2>
                <p class="text-sm">Jl. Pusat Bisnis No. 1, Jakarta 12345<br>Telp: 0812-XXXX-XXXX</p>
                <p class="text-sm mt-4 text-gray-600">Tgl Terbit: ${qData.Date.substring(0,10)}</p>
            </div>
        </div>

        <div class="mb-8">
            <h3 class="font-bold text-gray-700 border-b mb-2">Penawaran Ditujukan Kepada:</h3>
            <p class="font-bold text-xl">${qData.ToName}</p>
            <p class="text-sm">${qData.Phone || ''}</p>
            <p class="text-sm whitespace-pre-line max-w-sm">${qData.Address || ''}</p>
            ${qData.Description ? `<div class="mt-4 p-3 bg-blue-50 border-l-4 border-blue-500 text-sm"><b>Deskripsi Pekerjaan:</b><br>${qData.Description}</div>` : ''}
        </div>
        
        <table class="w-full text-left mb-6 border">
            <tr class="bg-blue-100 text-blue-900"><th class="p-3 border font-bold">Deskripsi Jasa / Barang</th><th class="p-3 border text-right w-48 font-bold">Harga</th></tr>
            ${items.map(i => `<tr><td class="p-3 border-b border-x">${i.Name}</td><td class="p-3 border-b border-x text-right font-mono">Rp ${formatRupiah(i.Price)}</td></tr>`).join('')}
        </table>
        
        <div class="flex justify-end mt-4">
            <div class="bg-blue-800 text-white p-4 rounded min-w-[300px]">
                <div class="flex justify-between font-bold text-xl"><span>TOTAL BIAYA:</span> <span>Rp ${formatRupiah(qData.Total)}</span></div>
            </div>
        </div>
        
        <div class="mt-16 pt-8 text-center text-sm text-gray-500">
            <p>Hormat Kami,</p>
            <br><br><br>
            <p class="font-bold border-t border-gray-400 inline-block px-8 pt-2">Manajemen</p>
        </div>
    `;
    openPDFModal(html);
}

function buildInvoicePDF(invData, items) {
    activeDocName = `Invoice_${invData.InvID}`;
    const pubUrl = window.location.origin + window.location.pathname + "?doc=" + invData.InvID;
    
    let taxHTML = '';
    if(parseInt(invData.TaxPPN) > 0) taxHTML += `<div class="flex justify-between mb-2"><span>PPN (11%):</span> <span>Rp ${formatRupiah(invData.TaxPPN)}</span></div>`;
    if(parseInt(invData.TaxPPh) > 0) taxHTML += `<div class="flex justify-between mb-2 text-red-600"><span>PPh23 (2%):</span> <span>(Rp ${formatRupiah(invData.TaxPPh)})</span></div>`;

    const html = `
        <div class="flex justify-between items-start mb-8 border-b-4 border-indigo-800 pb-4">
            <div>
                <h1 class="text-4xl font-extrabold text-indigo-800 tracking-wider">INVOICE</h1>
                <p class="text-gray-600 mt-2 text-lg font-bold">${invData.InvID}</p>
                <div class="mt-2 text-xs bg-indigo-50 border p-2 rounded inline-block">
                    <p class="font-bold">Link Akses E-Invoice Klien:</p>
                    <p class="font-mono text-blue-600">${pubUrl}</p>
                    <p class="mt-1">PIN AKSES: <span class="font-bold text-lg text-indigo-700 tracking-widest">${invData.ViewCode}</span></p>
                </div>
            </div>
            <div class="text-right">
                <h2 class="font-bold text-xl">PT NAMA BISNIS ANDA</h2>
                <p class="text-sm">Jl. Pusat Bisnis No. 1, Jakarta 12345</p>
                <p class="text-sm mt-4 text-gray-600">Tgl Terbit: ${invData.Date.substring(0,10)}</p>
            </div>
        </div>
        
        <table class="w-full text-left mt-6 mb-6 border">
            <tr class="bg-indigo-100 text-indigo-900"><th class="p-3 border font-bold">Deskripsi Penagihan</th><th class="p-3 border text-right w-48 font-bold">Jumlah</th></tr>
            ${items.map(i => `<tr><td class="p-3 border-b border-x">${i.Name}</td><td class="p-3 border-b border-x text-right font-mono">Rp ${formatRupiah(i.Price)}</td></tr>`).join('')}
        </table>
        
        <div class="flex flex-col items-end mt-4">
            <div class="w-80 text-right">
                <div class="flex justify-between mb-2"><span>SubTotal:</span> <span>Rp ${formatRupiah(invData.SubTotal)}</span></div>
                ${taxHTML}
                <div class="flex justify-between mt-4 pt-4 border-t-2 border-gray-800 font-bold text-2xl text-indigo-800"><span>TOTAL:</span> <span>Rp ${formatRupiah(invData.Total)}</span></div>
            </div>
        </div>
        
        <div class="mt-12 border-2 border-gray-300 p-4 bg-gray-50 rounded">
            <p class="font-bold text-gray-800 mb-2">Informasi Pembayaran:</p>
            <p class="font-mono text-xl text-indigo-700 font-bold">${invData.BankID}</p>
            <p class="text-sm mt-3 whitespace-pre-line">Catatan: ${invData.Notes || '-'}</p>
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

// Fungsi untuk download PDF ditambahkan di sini (Perbaikan BUG FATAL)
function downloadPDF(elementId, fileName) {
    const element = document.getElementById(elementId);
    const opt = {
        margin:       0,
        filename:     fileName + '.pdf',
        image:        { type: 'jpeg', quality: 1 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}

function downloadActivePDF() {
    downloadPDF('pdfRenderArea', activeDocName);
}

// --- PUBLIC VIEW (KLIEN) LOGIC ---
function unlockPublicDoc() {
    const pin = document.getElementById('publicPin').value;
    callAPI('publicView', { docId: viewDocId, pin: pin }).then(res => {
        if(res.status === 'success') {
            document.getElementById('pinForm').classList.add('hidden');
            document.getElementById('publicDocContent').classList.remove('hidden');
            
            const data = res.data;
            const items = JSON.parse(data.ItemsJSON);
            
            buildInvoicePDF(data, items);
            document.getElementById('renderedPublicDoc').innerHTML = document.getElementById('pdfRenderArea').innerHTML;
            closePDFModal(); 
        } else {
            alert('PIN Salah atau Dokumen tidak ditemukan!');
        }
    });
}