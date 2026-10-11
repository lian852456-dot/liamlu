# App report session integration

B login previously populated KPI, awards and personal performance without the
daily report modules. The report unlock button focused the hidden legacy form.
The installed App now opts into the existing authorized dashboard read with
`includeReports: true`; Daily chooses Taipei today 16/21 and yesterday 21.
The unlock button opens the visible B access panel and refreshes an active B
session through the same protected bundle.

Session, device, roster, suspension, revocation, binding, native generation,
password epoch and fixed expiry checks remain unchanged. Caller-selected employee
IDs, dates and segments are rejected. Explicit existing sheets avoid creation or
schema repair on this read. Each report and people source has an independent
success/error result; missing data, partial failures and total failures reach
visible terminal states. A people-source failure never becomes zero failed people.
Invalid bundles and logout clear reports. This App bundle is not persisted in the
dashboard session cache.

Validation: 202 Node checks, 11 loading browser checks and 8 owner-phone browser
checks passed. The exact formal source overlay passed 37 checks. The two existing
oldest-lease tests use a deterministic increasing clock so equal-millisecond
logins do not accidentally assert a different digest tie-break order.

Daily was updated from v67 to v68 on the same deployment. Four functions and one
new helper were overlaid on freshly read formal source; the seven other files,
manifest, deployment entry points and permissions were compared exactly.
Immutable v68 source and active deployment readback passed. No roster or business
data was written. Rollback is the retained immutable v67 on that deployment and a
revert of this frontend patch with a fresh service-worker version; retain unrelated
main changes. Frontend diagnostic version: `reports-20261011-1`.

Pages deployment and physical installed-App acceptance are separate post-merge
gates. Their exact receipts, de-identified screenshots and final results are saved
in the local `app-reports-evidence-20261011` directory. Synthetic authorization
tests do not replace physical expiry, suspension or revocation acceptance.
