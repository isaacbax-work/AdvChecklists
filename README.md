# AdvChecklists

A checklist advancement tool: upload a document, place interactive fields on
it (checkboxes, buttons, date fields, text), and attach actions to them —
send an email, stamp today's date on another field, or mark the checklist
complete. Invite collaborators to fill out the checklist, and keep a full
history of every template version and every completed run.

## How it maps to the requirements

- **Upload a document and set buttons/actions against it** — a *template*
  is a document (PDF/PNG/JPEG) with *fields* positioned on it. Each field
  has a type (checkbox, button, date, text) and, for checkboxes/buttons, a
  list of actions that fire when it's checked/pressed: `send_email` (to,
  subject, body — with `{{today}}`, `{{instanceTitle}}`, `{{fieldLabel}}`
  placeholders), `set_date` (stamp another date field with today, e.g. an
  "approved on" field), or `mark_complete`.
- **Other people can be added to use the document** — templates have
  collaborators with a role: `OWNER` (full control), `EDITOR` (can edit
  fields/actions and publish new versions), `FILLER` (can start and
  complete checklist runs).
- **History of documents used / templates** — every time a template's
  fields are published, it creates a new immutable *TemplateVersion*
  rather than overwriting the old one, so past layouts stay intact. Every
  checklist run (*Instance*) records who created it, its field values, and
  a full audit log (*ActionLog*) of every action that fired, when, and
  whether it succeeded.

## Architecture

- `server/` — Express + TypeScript API, Prisma ORM over SQLite, JWT auth,
  Multer for document uploads, Nodemailer for the email action.
- `client/` — React + TypeScript SPA (Vite), talks to the API and renders
  the document with field overlays for both building templates and filling
  them in.

### Data model

`User` → `Template` (has an `owner` and `collaborators`) → `TemplateVersion`
(one per publish, holds the document + `Field`s) → `Instance` (a run of a
template version, has `FieldValue`s and an `ActionLog`).

## Running locally

Requires Node 20+.

```bash
npm install   # installs both workspaces

# server
cp server/.env.example server/.env   # edit JWT_SECRET, SMTP_* as needed
npm run build:server --workspace server >/dev/null 2>&1 # optional
npm run --workspace server prisma:migrate   # creates server/prisma/dev.db
npm run dev:server     # http://localhost:4000

# client (separate terminal)
npm run dev:client     # http://localhost:5173, proxies /api and /uploads to :4000
```

Register an account at `/register`, create a template, click the document
to place fields, configure their actions in the side panel, and hit
"Publish new version". Add collaborators by email (they need an account
already) and use "Start new checklist" to create a fillable instance.

### Email delivery

If `SMTP_HOST` isn't set in `server/.env`, the `send_email` action logs the
message to the server console and records it in the action history instead
of actually sending — so the app works out of the box without any mail
setup. Set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` to
send real email.

## Tests

```bash
npm run test:server
```

Covers registration/login, template creation with a document upload,
access control (owner/editor/filler/outsider), the checkbox → send_email
action, the button → mark_complete action, DATE field auto-fill, and
template versioning/instance history.

## Known simplifications

- PDFs are shown at a fixed page-1 aspect ratio rather than rendered page
  by page; field coordinates are percentage-based against that box so
  placement is consistent between the builder and the fill view, but
  multi-page PDFs only support placing fields on page 1 today.
- Field values don't keep their own edit history — only the latest value
  and who last changed it. The action log (emails sent, dates auto-set,
  completions) is the durable audit trail.
- Collaborators must already have an AdvChecklists account; there's no
  email-invite flow to sign up new users.
