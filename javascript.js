// GANTI DENGAN URL DEPLOYMENT BARU ANDA YANG TELAH DI-UPDATE!
const API_URL = "https://script.google.com/macros/s/AKfycbztDUbiPpCZ0x-dndTlTk1mn-EdPaTdfp48IFoeiR18_O3IHe-a5rGPYME-LGqHQWE9/exec"; 

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

function callAPI(action, data) {
    document.getElementById('loading').classList.remove('hidden');
    const token = localStorage.getItem('token'); // Tarik Token
    
    return fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: action, data: data, token: token }), // Kirim Token ke Backend
    }).then(res => res.json())
      .then(res => {
          if (res.status === 'error' && res.message.includes('Unauthorized')) {
              alert('Sesi Anda telah habis atau tidak valid. Silakan login kembali.');
              logout();
          }
          return res;
      })
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
    
    if (pageId === 'quote') fetchHistory('quote');
    if (pageId === 'invoice') {
        fetchHistory('quote'); 
        fetchHistory('invoice');
        fetchBanks(); 
        // Set tanggal default hari ini ke form input
        document.getElementById('i_date').value = new Date().toISOString().substring(0, 10);
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
                sel.innerHTML += `<option value="${item.ItemID}">${item.Name} - Rp ${formatRupiah(item.Price)}</option>`;
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
                sel.innerHTML += `<option value="${bankInfo}">${bankInfo}</option>`;
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
            <td class="p-2 border-b">${itm.Name}</td>
            <td class="p-2 border-b text-center">${itm.Qty || 1}</td>
            <td class="p-2 border-b text-right font-mono">Rp ${formatRupiah(itm.Price)}</td>
            <td class="p-2 border-b text-right font-mono text-blue-700 font-bold">Rp ${formatRupiah(itemTotal)}</td>
            <td class="p-2 border-b text-xs">${itm.Keterangan || '-'}</td>
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
        name: document.getElementById('q_sender_name').value || 'PT NAMA BISNIS ANDA',
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
        
        const previewData = { ...data, QuoteID: res.data.id, Date: new Date().toISOString() };
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
        select.innerHTML += `<option value="${q.QuoteID}">${q.QuoteID} | ${q.ToName} | Rp ${formatRupiah(q.Total)}</option>`;
    });
}

function loadQuoteIntoInvoice() {
    const qID = document.getElementById('i_quoteRef').value;
    if(!qID) return; 
    
    const quote = historyQuotes.find(q => q.QuoteID === qID);
    if(quote) {
        let parsed = JSON.parse(quote.ItemsJSON || '[]');
        if (Array.isArray(parsed)) {
            invoiceItems = parsed;
            activeSenderInfo = { name: 'PT NAMA BISNIS ANDA', phone: '0812-XXXX-XXXX', address: 'Jl. Pusat Bisnis No. 1, Jakarta 12345' };
        } else {
            invoiceItems = parsed.itemsList || [];
            activeSenderInfo = parsed.senderInfo || { name: 'PT NAMA BISNIS ANDA', phone: '', address: '' };
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
            <td class="p-2 border-b text-sm">${itm.Name}</td>
            <td class="p-2 border-b text-center">${itm.Qty || 1}</td>
            <td class="p-2 border-b text-right font-mono">Rp ${formatRupiah(itm.Price)}</td>
            <td class="p-2 border-b text-right font-mono font-bold text-indigo-700">Rp ${formatRupiah(itemTotal)}</td>
            <td class="p-2 border-b text-xs">${itm.Keterangan || '-'}</td>
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
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); 
        reader.onerror = error => reject(error);
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
            subTotal: invSubTotal, taxPPN: invTaxPPN, taxPPh: invTaxPPh, total: invGrandTotal, 
            bankId: bank, notes: notes
        };

        const res = await callAPI('saveInvoice', data);
        if(res.status === 'error') throw new Error(res.message); 
        
        let uploadedFileUrl = null;
        if(fileInput) {
            const b64 = await getBase64(fileInput);
            const uploadRes = await callAPI('uploadFile', {
                refId: res.data.id, filename: fileInput.name, mimeType: fileInput.type, base64: b64
            });
            if(uploadRes.status === 'success') {
                uploadedFileUrl = uploadRes.data.fileUrl;
            }
        }

        alert('Invoice Sukses Dibuat! PIN Akses: ' + res.data.pin);
        fetchHistory('invoice'); 
        
        const previewData = {
            InvID: res.data.id, Date: invDate, ViewCode: res.data.pin,
            SubTotal: invSubTotal, TaxPPN: invTaxPPN, TaxPPh: invTaxPPh, Total: invGrandTotal,
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
    let parsed = JSON.parse(q.ItemsJSON || '[]');
    let items = Array.isArray(parsed) ? parsed : (parsed.itemsList || []);
    let sender = Array.isArray(parsed) ? { name: 'PT NAMA BISNIS ANDA', phone: '0812-XXXX-XXXX', address: 'Jl. Pusat Bisnis No. 1, Jakarta 12345' } : (parsed.senderInfo || {});
    buildQuotePDF(q, items, sender);
}

function previewHistoryInvoice(index) {
    const inv = historyInvoices[index];
    let parsed = JSON.parse(inv.ItemsJSON || '[]');
    let items = Array.isArray(parsed) ? parsed : (parsed.itemsList || []);
    let sender = Array.isArray(parsed) ? { name: 'PT NAMA BISNIS ANDA', phone: '0812-XXXX-XXXX', address: 'Jl. Pusat Bisnis No. 1, Jakarta 12345' } : (parsed.senderInfo || {});
    buildInvoicePDF(inv, items, sender);
}

let activeDocName = "Dokumen";

function buildQuotePDF(qData, items, sender) {
    activeDocName = `Quotation_${qData.QuoteID}`;
    const html = `
        <div class="flex justify-between items-start mb-8 border-b-4 border-blue-800 pb-4">
            <div>
                <h1 class="text-4xl font-extrabold text-blue-800 tracking-wider">QUOTATION</h1>
                <p class="text-gray-600 mt-2 text-lg font-bold">${qData.QuoteID}</p>
            </div>
            <div class="text-right">
                <h2 class="font-bold text-xl">${sender.name}</h2>
                <p class="text-sm whitespace-pre-line">${sender.address}</p>
                <p class="text-sm">Telp: ${sender.phone}</p>
                <p class="text-sm mt-4 text-gray-600">Tgl Terbit: ${qData.Date.substring(0,10)}</p>
            </div>
        </div>

        <div class="mb-8">
            <h3 class="font-bold text-gray-700 border-b mb-2">Penawaran Ditujukan Kepada:</h3>
            <p class="font-bold text-xl">${qData.ToName}</p>
            <p class="text-sm">${qData.Phone || ''}</p>
            <p class="text-sm whitespace-pre-line max-w-sm">${qData.Address || ''}</p>
            ${qData.Description ? `<div class="mt-4 p-3 bg-blue-50 border-l-4 border-blue-500 text-sm"><b>Perihal/Tujuan:</b><br>${qData.Description}</div>` : ''}
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
                <td class="p-2 border border-gray-400">${i.Name}</td>
                <td class="p-2 border border-gray-400 text-center">${i.Qty || 1}</td>
                <td class="p-2 border border-gray-400 text-right font-mono">${formatRupiah(i.Price)}</td>
                <td class="p-2 border border-gray-400 text-right font-mono">${formatRupiah(i.Total || Math.round(parseFloat(i.Price)*(i.Qty||1)))}</td>
                <td class="p-2 border border-gray-400 text-xs">${i.Keterangan || ''}</td>
            </tr>
            `).join('')}
        </table>
        
        <div class="flex flex-col items-end mt-4">
            <div class="bg-blue-800 text-white p-4 rounded min-w-[300px] mb-4">
                <div class="flex justify-between font-bold text-xl"><span>GRAND TOTAL:</span> <span>Rp ${formatRupiah(qData.Total)}</span></div>
            </div>
        </div>
        
        <div class="mt-4 text-xs text-gray-700 bg-gray-100 p-3 rounded">
            <strong>Catatan Khusus:</strong><br>
            *Biaya jasa perseorangan, belum termasuk pajak. Bila dikenakan pajak, maka harga di atas merupakan angka bersih yang harus diterima penyedia jasa.
        </div>
        
        <div class="mt-12 pt-4 text-center text-sm text-gray-800">
            <p>Demikian penawaran harga ini disampaikan. Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.</p>
            <p class="mt-6 mb-16">Hormat Kami,</p>
            <p class="font-bold border-t border-gray-400 inline-block px-8 pt-2">Manajemen</p>
        </div>
    `;
    openPDFModal(html);
}

function buildInvoicePDF(invData, items, sender) {
    activeDocName = `Invoice_${invData.InvID}`;
    const pubUrl = window.location.origin + window.location.pathname + "?doc=" + invData.InvID;
    
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

        if(isDipotong) {
            taxHTML += `<div class="flex justify-between mb-2 text-red-600 border-b border-gray-300 pb-2"><span>Dipotong PPh (${rateStr}):</span> <span>(Rp ${formatRupiah(pph)})</span></div>`;
        } else if(isDitanggung) {
            taxHTML += `<div class="flex justify-between mb-2 text-green-700 border-b border-gray-300 pb-2"><span>Ditambah PPh (${rateStr}) Gross Up:</span> <span>Rp ${formatRupiah(pph)}</span></div>`;
        } else {
            taxHTML += `<div class="flex justify-between mb-2 text-gray-600 border-b border-gray-300 pb-2"><span>Info PPh (${rateStr}):</span> <span>(Rp ${formatRupiah(pph)})</span></div>`;
        }
    }

    const uploadRec = historyUploads.find(u => u.RefID === invData.InvID);
    const finalFileUrl = uploadRec ? uploadRec.FileURL : (invData.UploadedFileURL || null);
    const uploadHTML = finalFileUrl ? `<p class="text-sm mt-3 pt-3 border-t border-gray-200"><b>Lampiran Bukti Pekerjaan:</b> <br> <a href="${finalFileUrl}" target="_blank" class="text-blue-600 underline break-all">${finalFileUrl}</a></p>` : '';

    const notesStr = (invData.Notes || '').trim();
    const notesHTML = (notesStr !== '' && notesStr !== '-') ? `<p class="text-sm mt-3 whitespace-pre-line">Catatan:<br>${notesStr}</p>` : '';

    const html = `
        <div class="flex justify-between items-start mb-8 border-b-4 border-indigo-800 pb-4">
            <div>
                <h1 class="text-4xl font-extrabold text-indigo-800 tracking-wider">INVOICE</h1>
                <p class="text-gray-600 mt-2 text-lg font-bold">${invData.InvID}</p>
                
                <!-- KUNCI FIX BOX HILANG: Menggunakan Inline Styles absolut -->
                <div style="margin-top: 15px; background-color: #eef2ff; border: 1px solid #c7d2fe; padding: 12px; border-radius: 6px; display: inline-block; min-width: 250px;">
                    <p style="font-weight: bold; font-size: 12px; color: #312e81; margin-bottom: 4px;">Link Akses E-Invoice Klien:</p>
                    <p style="font-family: monospace; color: #2563eb; font-size: 12px; margin-bottom: 8px;">${pubUrl}</p>
                    <p style="font-size: 12px; color: #1e1b4b;">PIN AKSES: <span style="font-weight: bold; font-size: 18px; color: #4338ca; letter-spacing: 3px;">${invData.ViewCode}</span></p>
                </div>

            </div>
            <div class="text-right">
                <h2 class="font-bold text-xl">${sender.name}</h2>
                <p class="text-sm whitespace-pre-line">${sender.address}</p>
                <p class="text-sm">Telp: ${sender.phone}</p>
                <p class="text-sm mt-4 text-gray-600">Tgl Terbit: ${invData.Date.substring(0,10)}</p>
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
                <td class="p-2 border border-gray-400">${i.Name}</td>
                <td class="p-2 border border-gray-400 text-center">${i.Qty || 1}</td>
                <td class="p-2 border border-gray-400 text-right font-mono">${formatRupiah(i.Price)}</td>
                <td class="p-2 border border-gray-400 text-right font-mono">${formatRupiah(i.Total || Math.round(parseFloat(i.Price)*(i.Qty||1)))}</td>
                <td class="p-2 border border-gray-400 text-xs">${i.Keterangan || ''}</td>
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
            <p class="font-mono text-xl text-indigo-700 font-bold">${invData.BankID}</p>
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
        margin:       [5, 0, 10, 0], // Memberi jarak margin atas bawah
        filename:     fileName + '.pdf',
        image:        { type: 'jpeg', quality: 1 },
        // KUNCI FIX: windowWidth memaksa library membaca dokumen layaknya di layar desktop lebar
        html2canvas:  { scale: 2, useCORS: true, windowWidth: 1200 }, 
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
            let parsed = JSON.parse(data.ItemsJSON);
            let items = Array.isArray(parsed) ? parsed : (parsed.itemsList || []);
            let sender = Array.isArray(parsed) ? { name: 'PT NAMA BISNIS ANDA', phone: '0812-XXXX-XXXX', address: 'Jl. Pusat Bisnis No. 1, Jakarta 12345' } : (parsed.senderInfo || {});
            
            buildInvoicePDF(data, items, sender);
            document.getElementById('renderedPublicDoc').innerHTML = document.getElementById('pdfRenderArea').innerHTML;
            closePDFModal(); 
        } else {
            alert('PIN Salah atau Dokumen tidak ditemukan!');
        }
    });
}