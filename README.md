# ERP & Invoicing System

A lightweight, browser-based ERP and invoicing application for managing service/product items, preparing quotations, issuing invoices, and sharing invoices with clients through a PIN-protected public link.

The interface is written in Indonesian and is designed around a simple admin dashboard with document-focused workflows.

## Highlights

- **Master Item** — maintain reusable product and service items, grouped by main and subcategory, with default prices.
- **Quotation** — prepare quotations with sender and client details, selectable master items, quantities, optional item notes, calculated totals, and quotation history.
- **Invoice** — create invoices from saved quotations, set an issue date, apply configurable PPN/PPh calculations, select a payment account, add payment notes, and optionally attach proof-of-work files.
- **Client invoice access** — share a document-specific URL; clients enter a four-digit PIN before the invoice is displayed.
- **PDF output** — preview quotations and invoices, then download A4 PDF documents.
- **Activity feedback** — show a processing overlay during API requests and provide visible success/error feedback.

## Interface overview

### 1. Admin login

The admin area starts with a centered login panel containing username and password fields. After a successful login, the dashboard is shown. The frontend remembers the returned session token in browser local storage so the dashboard can be restored on a later page load.

### 2. Dashboard navigation

A sticky top navigation bar provides access to the three working areas:

| Section | Purpose |
| --- | --- |
| **Master Item** | Create reusable item/service records. |
| **Quotation** | Build quotations and review quotation history. |
| **Invoice** | Convert quotations into invoices and review invoice history. |
| **Logout** | Clear the locally stored session token and reload the page. |

### 3. Master Item

The Master Item screen provides a compact form for:

- Main category
- Subcategory
- Item or service name
- Default price

Saved items can be loaded into the quotation workflow for reuse.

### 4. Quotation workspace

The quotation screen is organized into a creation form and a history panel.

**Quotation form**
- Sender/business identity
- Client name, phone number, and address
- Work description or purpose of the offer
- Master-item selector and quantity
- Optional line-item note
- Itemized table with quantity, unit price, and line total
- Automatically calculated quotation total
- Save-and-generate action

**Quotation history**
- Lists saved quotation IDs, clients, descriptions, dates, and totals
- Supports refreshing the list and opening a saved quotation as a PDF preview

### 5. Invoice workspace

The invoice screen follows the same document-first layout, with additional billing controls.

**Invoice form**
- Select a saved quotation and load its line items
- Set the invoice issue date
- Enable or disable PPN (the current UI labels this as 11%)
- Choose a PPh handling option: none, deducted at 2% or 2.5%, or buyer-paid/gross-up at 2% or 2.5%
- Select a payment account
- Add payment terms or other notes
- Optionally upload proof-of-work or completion evidence
- Review the calculated grand total
- Save and issue the invoice

**Invoice history**
- Lists invoice IDs, quotation references, dates, and totals
- Displays the public-access PIN
- Provides a copy-link action for the client URL
- Opens a saved invoice in PDF preview

> Tax rates and tax treatment are business rules currently represented in the frontend. Confirm that they match the applicable tax requirements before using them for real transactions.

### 6. Public client invoice view

A URL containing a document identifier opens the public document screen instead of the admin dashboard. The client is prompted to enter a four-digit PIN. When the backend accepts the document ID and PIN, the invoice is rendered with an option to download the A4 PDF.

The public route is separate from the admin login experience. The PIN check must be enforced by the backend; hiding or showing frontend elements is not an access-control boundary.

### 7. PDF preview and download

Quotation and invoice documents are rendered into a preview modal. The modal includes actions to download the active document as a PDF or close the preview. The public invoice view also provides a PDF download action.

The generated documents include document identifiers, sender/client details, item tables, totals, and relevant payment or access information.

## Typical workflows

### Create a quotation

1. Sign in to the admin area.
2. Add or maintain reusable items in **Master Item**.
3. Open **Quotation** and enter client and sender details.
4. Load master items, set quantities, and add optional notes.
5. Review the calculated total.
6. Save and generate the quotation.
7. Reopen it later from quotation history to preview or download its PDF.

### Issue an invoice

1. Open **Invoice**.
2. Select a saved quotation and load its items.
3. Set the invoice date, tax options, payment account, and notes.
4. Optionally attach proof-of-work.
5. Review the grand total and issue the invoice.
6. Share the generated public URL and PIN with the client.
7. The client opens the link, enters the PIN, and views or downloads the invoice.

## Technology and project structure

| File | Responsibility |
| --- | --- |
| `code.gs` | Google Apps Script API, authentication, session management, spreadsheet persistence, server-side calculations, uploads, and public invoice access. |
| `index.html` | Application markup, screen structure, forms, tables, navigation, public PIN view, and PDF modal. |
| `javascript.js` | Frontend state, UI interactions, client-side previews, API requests, safe document rendering, and PDF download behavior. |
| `README.md` | Project overview, interface guide, workflows, and implementation notes. |

The frontend uses:

- **HTML5** for the page structure
- **Tailwind CSS via CDN** for layout and styling
- **Vanilla JavaScript** for application behavior
- **html2pdf.js via CDN** for A4 PDF generation
- **Google Apps Script web app** as the configured API endpoint

The Google Apps Script backend is included in `code.gs`. It uses Google Sheets for application records and Google Drive for uploaded evidence. Deploy this file as the web app backend and keep the spreadsheet and Drive folder access restricted to the appropriate administrators.

## Configuration and running

1. Back up the Google Sheets spreadsheet and upload folder before updating the backend.
2. Open the bound Google Apps Script project and replace its backend source with the repository's `code.gs`.
3. Confirm `UPLOAD_FOLDER_ID` in `code.gs` refers to the intended Google Drive folder. The spreadsheet ID is read from the active bound spreadsheet.
4. Deploy a new version of the Apps Script web app and set its access permissions intentionally.
5. Update `API_URL` in `javascript.js` when the deployment URL changes.
6. Serve or host `index.html` with `javascript.js` available at the referenced path, then test login, item retrieval, quotation creation, invoice creation, upload, and public PIN access.

The page loads Tailwind CSS and html2pdf.js from public CDNs, so those libraries need to be reachable by the browser. The frontend does not include a local build step or package manager configuration.

## API integration

The frontend sends JSON POST requests to the configured Apps Script endpoint. The shared `callAPI(action, data)` helper includes the locally stored admin token in requests. The visible frontend actions include login, master-item retrieval/saving, quotation creation and history, invoice creation and history, file upload, and public invoice retrieval.

The request handlers and persistence behavior are implemented in the repository's `code.gs` Google Apps Script backend.

## Authentication and security notes

- The admin login stores salted PBKDF2-HMAC-SHA256 password hashes using 10,000 iterations. This is a deliberate Apps Script runtime compromise: 600,000 HMAC iterations caused deployed login requests to time out. Use a dedicated authentication service for stronger password hashing before exposing the app to a high-risk environment.
- To initialize or recover an administrator when the `Admin` sheet has no account rows, open the spreadsheet's bound Apps Script editor, select `createOrResetAdminAccount`, and click **Run**. Approve the requested spreadsheet permissions, then enter the username and a new password in the prompts. This function is editor-run only and is not exposed as a public web API action. It creates the account if absent or resets the matching username if present.
- New session tokens are stored as SHA-256 digests in the `Sessions` sheet, expire after 12 hours, and can be revoked by the authenticated `logout` action.
- Subsequent frontend API calls attach the bearer token from `localStorage`; the UI logs out when it receives an unauthorized response.
- A token's presence in `localStorage` only controls the initial frontend display. The backend must validate the token and authorize every protected operation.
- JavaScript running on the same origin can read `localStorage`; an XSS vulnerability could expose a stored token. Consider a secure, HttpOnly, SameSite cookie-based session design if the backend architecture supports it.
- Public invoice access validates the document ID and 4–6 digit PIN on each request. Existing four-digit PINs remain valid; newly issued invoices use six digits. Failed attempts are throttled per invoice ID for a short window using Apps Script cache.
- Do not commit real credentials, session tokens, private client data, or sensitive deployment configuration to the repository.

## Deployment checks and limitations

The backend implementation is present in `code.gs`, but these environment-specific details still require verification against the live Google account and spreadsheet:

- Apps Script execution time and service quotas, especially synchronous password hashing
- Actual spreadsheet sheet names, header rows, and access permissions
- Actual Drive folder permissions and whether Workspace policy permits link sharing
- Correct deployment URL, web-app access settings, and browser-to-Apps-Script connectivity
- Indonesian tax treatment and rates for the business's actual transactions

Review the backend implementation and deployment settings before treating the application as production-ready.


## Backend behavior and compatibility

- The existing API actions remain available: `login`, `getItems`, `getBanks`, `getQuotations`, `getInvoices`, `getUploads`, `saveItem`, `saveQuotation`, `saveInvoice`, `uploadFile`, and `publicView`. The authenticated `logout` action has been added.
- Quotation line items are validated and their prices are re-read from the Master Item sheet when an item ID is supplied. Invoice creation uses the saved quotation snapshot rather than trusting browser-submitted invoice items.
- Invoice tax amounts and totals are calculated by the backend from `ppnEnabled` and `pphStatus`. The current calculation rates preserve the existing UI behavior (PPN 11%; PPh options 2% and 2.5%). Confirm tax treatment and rates with a qualified Indonesian tax professional before issuing real invoices.
- ID generation and record appends use a script lock to reduce duplicate IDs during simultaneous writes.
- If attachment upload fails after invoice creation, the frontend reports that the invoice was saved and that the attachment needs separate attention. It does not report the whole invoice transaction as failed.
- The spreadsheet must retain the existing sheet names and header columns used by the application: `Admin`, `Sessions`, `Items`, `Banks`, `Quotations`, `Invoices`, and `Uploads`. Existing records are not intentionally rewritten by this revision, although the first successful login upgrades that administrator's password cell and the session sheet may gain new columns.
