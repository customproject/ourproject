/**
 * ERP & Invoicing System - Google Apps Script API
 *
 * Compatibility notes:
 * - Keeps the existing action names and core sheet columns.
 * - Existing plain-text Admin passwords are upgraded to salted PBKDF2-SHA256
 *   on the next successful login. Back up the spreadsheet before deployment.
 * - Existing four-digit invoice PINs remain valid. New invoices receive six digits.
 * - Upload sharing remains link-accessible to preserve the current client PDF
 *   workflow. Set SHARE_UPLOADS_WITH_LINK=false if client attachment links
 *   should no longer be public (the frontend link workflow must then change).
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const UPLOAD_FOLDER_ID = '1TFVFKV7K33cIPXPMxrVrGGJUmUMHiHWl';
const APP_TIMEZONE = 'Asia/Jakarta';
const SESSION_TTL_HOURS = 12;
const PBKDF2_ITERATIONS = 12000;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const SHARE_UPLOADS_WITH_LINK = true;
const PUBLIC_PIN_MAX_ATTEMPTS = 15;
const PUBLIC_PIN_WINDOW_SECONDS = 600;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Request body is required.');
    }

    var payload = JSON.parse(e.postData.contents);
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid request payload.');
    }

    var action = cleanText_(payload.action, 60);
    var data = payload.data && typeof payload.data === 'object' ? payload.data : {};
    var token = cleanText_(payload.token, 300);
    if (!action) throw new Error('Action is required.');

    var result;
    if (action === 'login') {
      result = handleLogin(data);
    } else if (action === 'publicView') {
      result = getPublicDocument(data);
    } else {
      var username = getSessionUsername_(token);
      if (!username) throw new Error('Unauthorized. Sesi Anda tidak valid atau telah habis.');

      switch (action) {
        case 'logout':
          revokeSession_(token);
          result = { loggedOut: true };
          break;
        case 'getItems':
          result = getTableData('Items');
          break;
        case 'getBanks':
          result = getTableData('Banks');
          break;
        case 'getQuotations':
          result = getTableData('Quotations');
          break;
        case 'getInvoices':
          result = getTableData('Invoices');
          break;
        case 'getUploads':
          result = getTableData('Uploads');
          break;
        case 'saveItem':
          result = saveMasterItem(data);
          break;
        case 'saveQuotation':
          result = saveQuotation(data);
          break;
        case 'saveInvoice':
          result = saveInvoice(data);
          break;
        case 'uploadFile':
          result = uploadFileToDrive(data);
          break;
        default:
          throw new Error('Unknown action: ' + action);
      }
    }

    return jsonResponse_({ status: 'success', data: result });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({
      status: 'error',
      message: safeErrorMessage_(error)
    });
  }
}

function doGet() {
  return ContentService.createTextOutput('ERP & Invoicing API is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeErrorMessage_(error) {
  var message = error && error.message ? error.message : String(error || 'Unknown error');
  return message.substring(0, 500);
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Required sheet not found: ' + name);
  return sheet;
}

function withScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function cleanText_(value, maxLength) {
  if (value === null || value === undefined) return '';
  var text = String(value).trim();
  if (maxLength && text.length > maxLength) {
    throw new Error('Text field exceeds the maximum length of ' + maxLength + ' characters.');
  }
  return text;
}

function parseMoney_(value, fieldName) {
  var number = Number(value);
  if (!isFinite(number) || number < 0 || number > 1000000000000) {
    throw new Error('Invalid amount: ' + fieldName);
  }
  return Math.round(number);
}

function parseQuantity_(value) {
  var number = Number(value);
  if (!isFinite(number) || number <= 0 || number > 1000000) {
    throw new Error('Quantity must be greater than zero.');
  }
  return number;
}

function parseDate_(value) {
  var dateText = cleanText_(value, 10);
  if (!dateText) return Utilities.formatDate(new Date(), APP_TIMEZONE, 'yyyy-MM-dd');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }
  var parsed = new Date(dateText + 'T00:00:00+07:00');
  if (isNaN(parsed.getTime()) ||
      Utilities.formatDate(parsed, APP_TIMEZONE, 'yyyy-MM-dd') !== dateText) {
    throw new Error('Invalid date.');
  }
  return dateText;
}

function formatSheetValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, APP_TIMEZONE, 'yyyy-MM-dd');
  }
  return value;
}

function getTableData(sheetName) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  var headers = values[0].map(function(header) { return String(header).trim(); });
  return values.slice(1).filter(function(row) {
    return row.some(function(cell) { return cell !== '' && cell !== null; });
  }).map(function(row) {
    var record = {};
    headers.forEach(function(header, index) {
      if (header) record[header] = formatSheetValue_(row[index]);
    });
    return record;
  });
}

function headerMap_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var map = {};
  headers.forEach(function(header, index) {
    var key = String(header || '').trim().toLowerCase();
    if (key) map[key] = index;
  });
  return map;
}

function findHeaderIndex_(map, names, fallbackIndex) {
  for (var i = 0; i < names.length; i++) {
    var key = names[i].toLowerCase();
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  }
  return fallbackIndex;
}

function findRecordById_(sheetName, id, idHeaders) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  var headers = values[0].map(function(value) { return String(value).trim(); });
  var map = {};
  headers.forEach(function(header, index) { map[header.toLowerCase()] = index; });
  var idIndex = findHeaderIndex_(map, idHeaders || [], 0);
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idIndex]) === String(id)) {
      var record = {};
      headers.forEach(function(header, index) {
        record[header] = formatSheetValue_(values[i][index]);
      });
      record._row = i + 1;
      return record;
    }
  }
  return null;
}

function appendMappedRow_(sheetName, record, fallbackValues) {
  var sheet = getSheet_(sheetName);
  var lastColumn = Math.max(sheet.getLastColumn(), fallbackValues ? fallbackValues.length : 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var hasHeaders = headers.some(function(value) { return String(value || '').trim() !== ''; });

  if (!hasHeaders && fallbackValues) {
    sheet.appendRow(fallbackValues);
    return;
  }

  var row = headers.map(function(header) {
    var key = String(header || '').trim();
    return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : '';
  });
  sheet.appendRow(row);
}

function generateID(sheetName, prefix) {
  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return prefix + '-0001';

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var maxNum = 0;
  ids.forEach(function(row) {
    var id = String(row[0] || '');
    if (id.indexOf(prefix + '-') === 0) {
      var match = id.match(/-(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10) || 0);
    }
  });
  return prefix + '-' + String(maxNum + 1).padStart(4, '0');
}

/* -------------------------- Authentication -------------------------- */

function passwordHash_(password, salt, iterations) {
  var passwordBytes = Utilities.newBlob(String(password), 'text/plain').getBytes();
  var saltBytes = Utilities.newBlob(String(salt), 'text/plain').getBytes();
  var block = saltBytes.concat([0, 0, 0, 1]);
  var u = Utilities.computeHmacSha256Signature(block, passwordBytes);
  var output = u.slice();

  for (var i = 1; i < iterations; i++) {
    u = Utilities.computeHmacSha256Signature(u, passwordBytes);
    for (var j = 0; j < output.length; j++) {
      output[j] = output[j] ^ u[j];
    }
  }
  return Utilities.base64Encode(output);
}

function createPasswordHash_(password) {
  var salt = Utilities.getUuid().replace(/-/g, '');
  return 'pbkdf2_sha256$' + PBKDF2_ITERATIONS + '$' + salt + '$' +
    passwordHash_(password, salt, PBKDF2_ITERATIONS);
}

function constantTimeEquals_(left, right) {
  left = String(left || '');
  right = String(right || '');
  var difference = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var i = 0; i < length; i++) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}

function verifyPassword_(storedValue, suppliedPassword) {
  var stored = String(storedValue || '');
  if (stored.indexOf('pbkdf2_sha256$') === 0) {
    var parts = stored.split('$');
    if (parts.length !== 4) return { valid: false, migrate: false };
    var iterations = parseInt(parts[1], 10);
    if (!iterations || iterations < 10000 || iterations > 100000) {
      return { valid: false, migrate: false };
    }
    var actual = passwordHash_(suppliedPassword, parts[2], iterations);
    return { valid: constantTimeEquals_(actual, parts[3]), migrate: false };
  }

  // Legacy plaintext password: allow one successful login, then upgrade it.
  return { valid: constantTimeEquals_(stored, suppliedPassword), migrate: true };
}

function handleLogin(data) {
  var username = cleanText_(data.username, 120);
  var password = String(data.password || '');
  if (!username || !password || password.length > 500) {
    throw new Error('Username and password are required.');
  }

  return withScriptLock_(function() {
    var sheet = getSheet_('Admin');
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) throw new Error('No administrator account is configured.');

    var headers = values[0].map(function(value) { return String(value).trim().toLowerCase(); });
    var usernameIndex = headers.indexOf('username');
    var passwordIndex = headers.indexOf('password');
    if (usernameIndex < 0) usernameIndex = 0;
    if (passwordIndex < 0) passwordIndex = 1;

    for (var i = 1; i < values.length; i++) {
      if (constantTimeEquals_(String(values[i][usernameIndex] || ''), username)) {
        var verification = verifyPassword_(values[i][passwordIndex], password);
        if (!verification.valid) break;
        if (verification.migrate) {
          sheet.getRange(i + 1, passwordIndex + 1).setValue(createPasswordHash_(password));
        }
        var token = 'AUTH_' + Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
        createSession_(token, username);
        return { token: token, expiresInHours: SESSION_TTL_HOURS };
      }
    }
    throw new Error('Invalid credentials.');
  });
}

function ensureSessionColumns_(sheet) {
  var map = headerMap_(sheet);
  var required = ['ExpiresAt', 'RevokedAt', 'LastSeenAt'];
  required.forEach(function(name) {
    if (!Object.prototype.hasOwnProperty.call(map, name.toLowerCase())) {
      var column = sheet.getLastColumn() + 1;
      sheet.getRange(1, column).setValue(name);
      map[name.toLowerCase()] = column - 1;
    }
  });
  return map;
}

function tokenDigest_(token) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(token),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}

function createSession_(token, username) {
  var sheet = getSheet_('Sessions');
  var map = ensureSessionColumns_(sheet);
  var lastColumn = sheet.getLastColumn();
  var row = new Array(lastColumn).fill('');
  var now = new Date();
  row[findHeaderIndex_(map, ['token'], 0)] = tokenDigest_(token);
  row[findHeaderIndex_(map, ['username'], 1)] = username;
  row[findHeaderIndex_(map, ['createdat', 'created at'], 2)] = now;
  row[findHeaderIndex_(map, ['expiresat'], 3)] =
    new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);
  row[findHeaderIndex_(map, ['revokedat'], 4)] = '';
  row[findHeaderIndex_(map, ['lastseenat'], 5)] = now;
  sheet.appendRow(row);
}

function getSessionUsername_(token) {
  if (!token) return null;
  var sheet = getSheet_('Sessions');
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  var headers = values[0].map(function(value) { return String(value).trim().toLowerCase(); });
  var tokenIndex = headers.indexOf('token');
  var usernameIndex = headers.indexOf('username');
  var createdIndex = headers.indexOf('createdat');
  var expiresIndex = headers.indexOf('expiresat');
  var revokedIndex = headers.indexOf('revokedat');
  if (tokenIndex < 0) tokenIndex = 0;
  if (usernameIndex < 0) usernameIndex = 1;
  if (createdIndex < 0) createdIndex = 2;

  var digest = tokenDigest_(token);
  var now = new Date();
  for (var i = values.length - 1; i >= 1; i--) {
    var storedToken = String(values[i][tokenIndex] || '');
    if (constantTimeEquals_(storedToken, digest) || constantTimeEquals_(storedToken, token)) {
      if (revokedIndex >= 0 && values[i][revokedIndex]) return null;
      var expires = expiresIndex >= 0 ? values[i][expiresIndex] : '';
      if (expires instanceof Date) {
        if (expires.getTime() < now.getTime()) return null;
      } else if (!expires && values[i][createdIndex] instanceof Date) {
        // Legacy sessions expire after the same fixed lifetime.
        var legacyExpiry = values[i][createdIndex].getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000;
        if (legacyExpiry < now.getTime()) return null;
      }
      return String(values[i][usernameIndex] || '');
    }
  }
  return null;
}

function validateToken(token) {
  return !!getSessionUsername_(token);
}

function revokeSession_(token) {
  if (!token) return;
  var sheet = getSheet_('Sessions');
  var map = headerMap_(sheet);
  var tokenIndex = findHeaderIndex_(map, ['token'], 0);
  var revokedIndex = findHeaderIndex_(map, ['revokedat'], -1);
  if (revokedIndex < 0) {
    revokedIndex = sheet.getLastColumn();
    sheet.getRange(1, revokedIndex + 1).setValue('RevokedAt');
    revokedIndex = revokedIndex;
  }
  var digest = tokenDigest_(token);
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    var storedToken = String(values[i][tokenIndex] || '');
    if (constantTimeEquals_(storedToken, digest) || constantTimeEquals_(storedToken, token)) {
      sheet.getRange(i + 1, revokedIndex + 1).setValue(new Date());
      return;
    }
  }
}

/* ---------------------------- Master items --------------------------- */

function saveMasterItem(data) {
  var name = cleanText_(data.name, 200);
  var mainCat = cleanText_(data.mainCat, 100);
  var subCat = cleanText_(data.subCat, 100);
  var price = parseMoney_(data.price, 'price');
  if (!name) throw new Error('Item name is required.');

  return withScriptLock_(function() {
    var id = generateID('Items', 'ITM');
    appendMappedRow_('Items', {
      ItemID: id, MainCat: mainCat, SubCat: subCat, Name: name, Price: price
    }, [id, mainCat, subCat, name, price]);
    return { id: id };
  });
}

function getMasterItemMap_() {
  var items = getTableData('Items');
  var map = {};
  items.forEach(function(item) {
    map[String(item.ItemID)] = item;
  });
  return map;
}

function normalizeSnapshotItems_(rawItems, requireMasterItem) {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 100) {
    throw new Error('A document must contain between 1 and 100 line items.');
  }
  var masterMap = requireMasterItem ? getMasterItemMap_() : {};
  var normalized = [];
  rawItems.forEach(function(item) {
    if (!item || typeof item !== 'object') throw new Error('Invalid line item.');
    var itemId = cleanText_(item.ItemID || item.itemId || '', 100);
    if (requireMasterItem && !itemId) throw new Error('Each quotation line must reference a saved Master Item.');
    var master = itemId ? masterMap[itemId] : null;
    if (requireMasterItem && itemId && !master) {
      throw new Error('A selected master item no longer exists: ' + itemId);
    }
    var name = cleanText_(master ? master.Name : item.Name || item.name, 200);
    var price = parseMoney_(master ? master.Price : item.Price !== undefined ? item.Price : item.price, 'item price');
    var qty = parseQuantity_(item.Qty !== undefined ? item.Qty : item.qty);
    if (!name) throw new Error('Every line item must have a name.');
    normalized.push({
      ItemID: itemId,
      MainCat: cleanText_(master ? master.MainCat : item.MainCat || '', 100),
      SubCat: cleanText_(master ? master.SubCat : item.SubCat || '', 100),
      Name: name,
      Price: price,
      Qty: qty,
      Keterangan: cleanText_(item.Keterangan || item.keterangan || '', 500),
      Total: Math.round(price * qty)
    });
  });
  return normalized;
}

function unpackItems_(itemsPayload) {
  if (Array.isArray(itemsPayload)) return itemsPayload;
  if (itemsPayload && Array.isArray(itemsPayload.itemsList)) return itemsPayload.itemsList;
  throw new Error('Invalid document items.');
}

function serializeDocumentItems_(items, senderInfo) {
  return JSON.stringify({
    itemsList: items,
    senderInfo: {
      name: cleanText_(senderInfo && senderInfo.name || '', 200),
      phone: cleanText_(senderInfo && senderInfo.phone || '', 60),
      address: cleanText_(senderInfo && senderInfo.address || '', 500)
    }
  });
}

/* ----------------------------- Quotations ---------------------------- */

function saveQuotation(data) {
  var toName = cleanText_(data.toName, 200);
  if (!toName) throw new Error('Client name is required.');
  var items = normalizeSnapshotItems_(unpackItems_(data.items), true);
  var total = items.reduce(function(sum, item) { return sum + item.Total; }, 0);
  var sender = data.items && data.items.senderInfo ? data.items.senderInfo : {};
  var itemsJson = serializeDocumentItems_(items, sender);
  var now = new Date();
  var date = Utilities.formatDate(now, APP_TIMEZONE, 'yyyy-MM-dd');

  return withScriptLock_(function() {
    var id = generateID('Quotations', 'QT' + Utilities.formatDate(now, APP_TIMEZONE, 'yyMM'));
    appendMappedRow_('Quotations', {
      QuoteID: id,
      Date: "'" + date,
      ToName: toName,
      Phone: cleanText_(data.phone, 60),
      Address: cleanText_(data.address, 500),
      Description: cleanText_(data.desc, 1000),
      ItemsJSON: itemsJson,
      Total: total,
      Status: 'Pending'
    }, [id, "'" + date, toName, cleanText_(data.phone, 60),
      cleanText_(data.address, 500), cleanText_(data.desc, 1000), itemsJson, total, 'Pending']);
    return { id: id, total: total };
  });
}

/* ------------------------------ Invoices ----------------------------- */

function calculateTaxes_(subtotal, ppnEnabled, pphStatus) {
  var ppn = ppnEnabled ? Math.round(subtotal * 0.11) : 0;
  var pph = 0;
  var total = subtotal + ppn;

  switch (pphStatus) {
    case 'dipotong_2':
      pph = Math.round(subtotal * 0.02);
      total -= pph;
      break;
    case 'ditanggung_2':
      pph = Math.round(subtotal / 0.98 - subtotal);
      total += pph;
      break;
    case 'dipotong_25':
      pph = Math.round(subtotal * 0.025);
      total -= pph;
      break;
    case 'ditanggung_25':
      pph = Math.round(subtotal / 0.975 - subtotal);
      total += pph;
      break;
    case 'none':
    case '':
    case null:
    case undefined:
      break;
    default:
      throw new Error('Unsupported PPh option.');
  }
  return { ppn: ppn, pph: pph, total: Math.round(total), pphStatus: pphStatus || 'none' };
}

function parseStoredItems_(itemsJson) {
  var parsed;
  try {
    parsed = typeof itemsJson === 'string' ? JSON.parse(itemsJson || '[]') : itemsJson;
  } catch (error) {
    throw new Error('Stored quotation items are invalid. Please contact the administrator.');
  }
  return {
    items: normalizeSnapshotItems_(unpackItems_(parsed), false),
    sender: parsed && !Array.isArray(parsed) ? (parsed.senderInfo || {}) : {}
  };
}

function generatePin_() {
  var raw = Utilities.getUuid() + Utilities.getUuid();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  var hex = digest.map(function(byte) {
    var value = (byte + 256) % 256;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
  return String(100000 + (parseInt(hex.substring(0, 8), 16) % 900000));
}

function saveInvoice(data) {
  var quoteId = cleanText_(data.quoteId, 100);
  var bankId = cleanText_(data.bankId, 250);
  if (!quoteId) throw new Error('Quotation reference is required.');
  if (!bankId) throw new Error('Payment account is required.');
  var date = parseDate_(data.date);
  var ppnEnabled = data.ppnEnabled === true || String(data.ppnEnabled) === 'true';
  var pphStatus = cleanText_(data.pphStatus || 'none', 30);

  return withScriptLock_(function() {
    var quotation = findRecordById_('Quotations', quoteId, ['quoteid']);
    if (!quotation) throw new Error('Referenced quotation was not found.');

    var snapshot = parseStoredItems_(quotation.ItemsJSON);
    var items = snapshot.items;
    var subtotal = items.reduce(function(sum, item) { return sum + item.Total; }, 0);
    var taxes = calculateTaxes_(subtotal, ppnEnabled, pphStatus);
    var id = generateID('Invoices', 'INV' + Utilities.formatDate(new Date(), APP_TIMEZONE, 'yyMM'));
    var pin = generatePin_();
    var itemsJson = serializeDocumentItems_(items, snapshot.sender);

    appendMappedRow_('Invoices', {
      InvID: id,
      QuoteID: quoteId,
      Date: "'" + date,
      ItemsJSON: itemsJson,
      SubTotal: subtotal,
      TaxPPN: taxes.ppn,
      TaxPPh: taxes.pph,
      Total: taxes.total,
      BankID: bankId,
      Notes: cleanText_(data.notes, 2000),
      ViewCode: pin,
      Status: 'Issued'
    }, [id, quoteId, "'" + date, itemsJson, subtotal, taxes.ppn, taxes.pph,
      taxes.total, bankId, cleanText_(data.notes, 2000), pin]);

    return {
      id: id,
      pin: pin,
      subTotal: subtotal,
      taxPPN: taxes.ppn,
      taxPPh: taxes.pph,
      total: taxes.total
    };
  });
}

/* ------------------------------- Uploads ----------------------------- */

function validateUpload_(data) {
  var mimeType = cleanText_(data.mimeType, 100).toLowerCase();
  if (ALLOWED_UPLOAD_TYPES.indexOf(mimeType) < 0) {
    throw new Error('Only PDF, JPEG, and PNG files are allowed.');
  }
  var filename = cleanText_(data.filename, 180).replace(/[\\\/:*?"<>|#%]/g, '_');
  if (!filename) throw new Error('Filename is required.');
  var base64 = String(data.base64 || '');
  if (!base64 || base64.length > Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 16) {
    throw new Error('File is empty or exceeds the 5 MB upload limit.');
  }
  var bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (error) {
    throw new Error('Invalid file encoding.');
  }
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error('File is empty or exceeds the 5 MB upload limit.');
  }

  var signature = bytes.slice(0, 8).map(function(value) { return (value + 256) % 256; });
  var validSignature = false;
  if (mimeType === 'application/pdf') {
    validSignature = signature[0] === 37 && signature[1] === 80 &&
      signature[2] === 68 && signature[3] === 70;
  } else if (mimeType === 'image/png') {
    validSignature = signature[0] === 137 && signature[1] === 80 &&
      signature[2] === 78 && signature[3] === 71;
  } else if (mimeType === 'image/jpeg') {
    validSignature = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  }
  if (!validSignature) throw new Error('File contents do not match the selected file type.');

  return { filename: filename, mimeType: mimeType, bytes: bytes };
}

function uploadFileToDrive(data) {
  var invoiceId = cleanText_(data.refId, 100);
  if (!invoiceId || !findRecordById_('Invoices', invoiceId, ['invid'])) {
    throw new Error('A valid invoice reference is required for an upload.');
  }
  var upload = validateUpload_(data);
  var folder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
  var file = null;

  try {
    file = folder.createFile(Utilities.newBlob(upload.bytes, upload.mimeType, upload.filename));
    if (SHARE_UPLOADS_WITH_LINK) {
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (sharingError) {
        // Some Workspace policies block public link sharing; preserve the upload
        // but log that the client may not be able to open its attachment link.
        console.warn('Drive link sharing was blocked: ' + sharingError);
      }
    }

    return withScriptLock_(function() {
      var id = generateID('Uploads', 'UPL');
      appendMappedRow_('Uploads', {
        UploadID: id,
        RefID: invoiceId,
        FileURL: file.getUrl(),
        CreatedAt: new Date()
      }, [id, invoiceId, file.getUrl(), new Date()]);
      return { id: id, fileUrl: file.getUrl() };
    });
  } catch (error) {
    if (file) {
      try { file.setTrashed(true); } catch (cleanupError) {
        console.error('Unable to clean up orphan upload: ' + cleanupError);
      }
    }
    throw error;
  }
}

/* --------------------------- Public invoices ------------------------- */

function checkPublicPinRateLimit_(docId) {
  var cache = CacheService.getScriptCache();
  var key = 'public-pin-' + tokenDigest_(docId).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  var attempts = parseInt(cache.get(key) || '0', 10);
  if (attempts >= PUBLIC_PIN_MAX_ATTEMPTS) {
    throw new Error('Too many PIN attempts. Please try again in 10 minutes.');
  }
  return { cache: cache, key: key, attempts: attempts };
}

function getPublicDocument(data) {
  var docId = cleanText_(data.docId, 100);
  var pin = cleanText_(data.pin, 8);
  if (!docId || !/^\d{4,6}$/.test(pin)) {
    throw new Error('Invoice ID or PIN is invalid.');
  }

  var rate = checkPublicPinRateLimit_(docId);
  var invoice = findRecordById_('Invoices', docId, ['invid']);
  if (!invoice || !constantTimeEquals_(String(invoice.ViewCode || ''), pin)) {
    rate.cache.put(rate.key, String(rate.attempts + 1), PUBLIC_PIN_WINDOW_SECONDS);
    throw new Error('PIN salah atau dokumen tidak ditemukan.');
  }
  rate.cache.remove(rate.key);

  var uploads = getTableData('Uploads');
  for (var i = uploads.length - 1; i >= 0; i--) {
    if (String(uploads[i].RefID) === docId) {
      invoice.UploadedFileURL = uploads[i].FileURL;
      break;
    }
  }
  delete invoice._row;
  return invoice;
}
