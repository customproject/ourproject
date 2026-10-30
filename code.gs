const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const UPLOAD_FOLDER_ID = '1TFVFKV7K33cIPXPMxrVrGGJUmUMHiHWl'; // Pastikan ID Folder ini Valid

function doPost(e) {
  try {
    let payload = JSON.parse(e.postData.contents);
    let action = payload.action;
    let data = payload.data;
    let token = payload.token;
    let result = {};

    // Celah Keamanan Ditutup: Validasi Token untuk aksi selain login & public view
    if (action !== "login" && action !== "publicView") {
      if (!validateToken(token)) {
        throw new Error("Unauthorized. Sesi Anda tidak valid atau telah habis.");
      }
    }

    if (action === "login") result = handleLogin(data);
    else if (action === "getItems") result = getTableData("Items");
    else if (action === "getBanks") result = getTableData("Banks");
    else if (action === "getQuotations") result = getTableData("Quotations");
    else if (action === "getInvoices") result = getTableData("Invoices");
    else if (action === "getUploads") result = getTableData("Uploads");
    else if (action === "saveItem") result = saveMasterItem(data);
    else if (action === "saveQuotation") result = saveQuotation(data);
    else if (action === "saveInvoice") result = saveInvoice(data);
    else if (action === "uploadFile") result = uploadFileToDrive(data);
    else if (action === "publicView") result = getPublicDocument(data);

    return ContentService.createTextOutput(JSON.stringify({ status: "success", data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("Backend API is Running Securely.").setMimeType(ContentService.MimeType.TEXT);
}

function validateToken(token) {
  if (!token) return false;
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Sessions");
  if (!sheet) return false;
  let rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === token) return true;
  }
  return false;
}

function handleLogin(data) {
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Admin");
  let rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.username && rows[i][1] == data.password) {
      let newToken = "AUTH_" + Utilities.getUuid();
      // Simpan session agar tervalidasi di request selanjutnya
      let sessionSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Sessions");
      sessionSheet.appendRow([newToken, data.username, new Date()]);
      return { token: newToken };
    }
  }
  throw new Error("Invalid Credentials");
}

function getTableData(sheetName) {
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  let rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  
  let headers = rows.shift(); 
  return rows.map(row => {
    let obj = {};
    headers.forEach((header, index) => { 
      let val = row[index];
      // KUNCI FIX: Memaksa objek tanggal menjadi string teks di zona waktu Jakarta (GMT+7)
      if (val instanceof Date) {
        val = Utilities.formatDate(val, "GMT+7", "yyyy-MM-dd");
      }
      obj[header] = val; 
    });
    return obj;
  });
}

function generateID(sheetName, prefix) {
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  let lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return prefix + "-0001";
  
  // Perbaikan: Cari angka tertinggi secara dinamis (mencegah duplikat akibat sorting/hapus baris)
  let ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let maxNum = 0;
  
  for (let i = 0; i < ids.length; i++) {
    let idStr = ids[i][0].toString();
    if (idStr.startsWith(prefix)) {
      let parts = idStr.split("-");
      if (parts.length > 1) {
        let num = parseInt(parts[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
  }
  
  let nextNum = maxNum + 1;
  return prefix + "-" + nextNum.toString().padStart(4, "0");
}

function saveMasterItem(data) {
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Items");
  let newId = generateID("Items", "ITM");
  sheet.appendRow([newId, data.mainCat, data.subCat, data.name, data.price]);
  return { id: newId };
}

function saveQuotation(data) {
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Quotations");
  let newId = generateID("Quotations", "QT" + Utilities.formatDate(new Date(), "GMT+7", "yyMM"));
  let date = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  
  // FIX: Tambahkan "'" + date agar Sheets menyimpannya sebagai Plain Text
  sheet.appendRow([newId, "'" + date, data.toName, data.phone, data.address, data.desc, JSON.stringify(data.items), data.total, "Pending"]);
  return { id: newId };
}

function saveInvoice(data) {
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Invoices");
  let newId = generateID("Invoices", "INV" + Utilities.formatDate(new Date(), "GMT+7", "yyMM"));
  
  // Ambil dari frontend, atau gunakan hari ini
  let date = data.date ? data.date : Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  let viewCode = Math.floor(1000 + Math.random() * 9000).toString(); 
  
  // FIX: Tambahkan "'" + date agar Sheets menyimpannya sebagai Plain Text
  sheet.appendRow([newId, data.quoteId, "'" + date, JSON.stringify(data.items), data.subTotal, data.taxPPN, data.taxPPh, data.total, data.bankId, data.notes, viewCode]);
  return { id: newId, pin: viewCode };
}

function uploadFileToDrive(data) {
  let folder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
  let blob = Utilities.newBlob(Utilities.base64Decode(data.base64), data.mimeType, data.filename);
  let file = folder.createFile(blob);
  
  // Try-catch jika organisasi Google Workspace melarang public sharing
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(e) {
    Logger.log("Info: Organisasi melarang public share. File tetap terupload privat.");
  }
  
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Uploads");
  let newId = generateID("Uploads", "UPL");
  sheet.appendRow([newId, data.refId, file.getUrl(), new Date()]);
  return { fileUrl: file.getUrl() };
}

function getPublicDocument(data) {
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Invoices");
  let rows = sheet.getDataRange().getValues();
  let headers = rows.shift();
  
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === data.docId) { 
      if (rows[i][10] == data.pin) { 
        let obj = {};
        headers.forEach((header, index) => { 
          let val = rows[i][index];
          // KUNCI FIX: Mencegah Timezone Shift di halaman klien
          if (val instanceof Date) {
            val = Utilities.formatDate(val, "GMT+7", "yyyy-MM-dd");
          }
          obj[header] = val; 
        });

        let upSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Uploads");
        let upRows = upSheet.getDataRange().getValues();
        for(let j=1; j<upRows.length; j++) {
            if(upRows[j][1] === data.docId) {
                obj.UploadedFileURL = upRows[j][2];
                break;
            }
        }
        return obj;
      } else {
        throw new Error("PIN Salah!");
      }
    }
  }
  throw new Error("Dokumen tidak ditemukan.");
}