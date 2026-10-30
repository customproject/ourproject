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
| `index.html` | Application markup, screen structure, forms, tables, navigation, public PIN view, and PDF modal. |
| `javascript.js` | Frontend state, UI interactions, calculations, API requests, document rendering, and PDF download behavior. |
| `README.md` | Project overview, interface guide, workflows, and implementation notes. |

The frontend uses:

- **HTML5** for the page structure
- **Tailwind CSS via CDN** for layout and styling
- **Vanilla JavaScript** for application behavior
- **html2pdf.js via CDN** for A4 PDF generation
- **Google Apps Script web app** as the configured API endpoint

The Google Apps Script backend is external to this repository. Its implementation, data storage, credential verification, token lifecycle, and PIN validation are therefore not documented or verifiable from the frontend files alone.

## Configuration and running

1. Deploy the Google Apps Script backend as a web app and configure its access settings appropriately.
2. Set the deployed endpoint in the `API_URL` constant near the top of `javascript.js`.
3. Serve or host `index.html` with `javascript.js` available at the referenced path.
4. Open the page in a modern browser.

The page loads Tailwind CSS and html2pdf.js from public CDNs, so those libraries need to be reachable by the browser. The frontend does not include a local build step or package manager configuration.

## API integration

The frontend sends JSON POST requests to the configured Apps Script endpoint. The shared `callAPI(action, data)` helper includes the locally stored admin token in requests. The visible frontend actions include login, master-item retrieval/saving, quotation creation and history, invoice creation and history, file upload, and public invoice retrieval.

The exact request handlers and persistence behavior live in the external Apps Script project, not in this repository.

## Authentication and security notes

- The admin login sends the entered username and password to the backend and stores the returned token in `localStorage`.
- Subsequent frontend API calls attach that token. The UI logs out when it receives an unauthorized response.
- Logout removes the browser's stored token; this alone does **not** prove that the backend revokes the token.
- A token's presence in `localStorage` only controls the initial frontend display. The backend must validate the token and authorize every protected operation.
- JavaScript running on the same origin can read `localStorage`; an XSS vulnerability could expose a stored token. Consider a secure, HttpOnly, SameSite cookie-based session design if the backend architecture supports it.
- Public invoice access uses a document ID and PIN. The backend should validate both on every public-document request and should apply appropriate rate limiting.
- Do not commit real credentials, session tokens, private client data, or sensitive deployment configuration to the repository.

## Current scope and limitations

This repository contains the browser frontend. It does not contain the Apps Script backend source, so the following cannot be confirmed from this codebase alone:

- Password hashing and credential storage
- Token generation, expiry, rotation, and server-side revocation
- Server-side authorization for each admin action
- PIN storage, verification, and brute-force protection
- Data validation and persistence rules
- File-upload validation and storage permissions

Review the backend implementation and deployment settings before treating the application as production-ready.
