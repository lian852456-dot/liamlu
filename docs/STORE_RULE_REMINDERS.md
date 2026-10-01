# Private store rule reminders

`store-rule-reminders.js` adds a reminder section inside the existing
`department-ops.html` store panel. The shared department controller and existing
gold, store import, and Patrol rules are unchanged. The page includes two new
asset references and the reserved `storeRulesMount` container within `storePanel`.
Keep this mount when integrating other store components. The isolated module
observes the existing panel's visibility.

All policy text and source references live in a JSON document in the existing
private department data folder. Original documents, extracted text, real reminder
fixtures, and authenticated screenshots must remain outside this public repository.

## Read contract

POST `department_store_rules_read` uses the existing Patrol signed session.
The server verifies the session before looking up the folder or file. Both the
folder and reminder file must have private sharing access; multiple matching
files, malformed documents, or unsupported fields fail closed. This feature
adds no public write action, sharing operation, credential, permission, or folder.

The document contract is `store-rule-reminders-v1`, with scope
`store-daily-reminders`, a revision, context, and 1–50 rules. Each rule has an ID,
category, title, instruction, frequency, audience, exception notes, and source
short names with page numbers. Scores and performance fields are unsupported.
The response includes the existing session expiration and no Drive IDs or URLs.

The generic backend module is `gas/StoreRules.gs`. The Patrol bundle builder
copies it to `patrol-gas/StoreRules.gs` and includes only the authenticated POST
dispatch. When deploying, preserve all current server files and apply that one
dispatch addition plus the new module to a fresh private source readback.

## Browser lifecycle

The module reads only while the authenticated store panel is visible. It
revalidates the existing token before each read, refreshes at most once per
minute, and keeps no policy text in persistent browser storage. Tab changes,
backgrounding, page exit, expiry, and read errors clear the rendered rules.
Generation checks discard late responses. Text is inserted with `textContent`.

The logout control immediately removes the complete authenticated workspace,
clears the existing session key, requests existing server revocation, and reloads
the page. It does not require a new authentication mechanism.

## Validation

`tests/store-rule-reminders.test.cjs` exercises the real signed-session runtime
with synthetic credentials and policy fixtures, including anonymous/forged,
expired/revoked, shared-file, missing-data, and malformed-data cases.
`tests/store-rule-reminders.spec.js` intercepts all external requests and checks
desktop/mobile rendering, source metadata, HTML escaping, tab clearing, logout,
and late-response isolation. Private production verification is a separate gate.
