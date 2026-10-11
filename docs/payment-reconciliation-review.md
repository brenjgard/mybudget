# Statement reconciliation and iOS launch review

## Reproduced accounting failure

The new production-domain regression uses synthetic Chase and Mileage cards with $2,500 reported balances each, a September 30 payment of $1,000, and an October 5 payment of $1,000. Before payment, $3,900 checking minus $5,000 total obligations produces a genuine **-$1,100** low point. After both payments, checking is updated to $1,900; the remaining card obligations should be $3,000, preserving that low point.

The previous production code excluded paid payments from the allocation against the older card balance snapshots. It consequently projected the full $5,000 again, producing **-$3,100**. Running the regression against the pre-change `harbor-domain.ts` failed with `-3100 !== -1100`; the corrected code passes. This matches the size and month-boundary shape of the reported incident, but does not establish what happened in the user's actual ledger.

## Changes

- Keep paid amounts allocated against card balance snapshots until a newer snapshot includes them. A late check-off of a historical payment does not subtract it again from an already updated snapshot.
- Derive Fleet statement completion from linked payments, including partial payments and undo, instead of requiring a separate statement-header write. Read the previous two months as well as upcoming months so September payments remain visible in October.
- Count actual payments once. Statement headers are not a second payment; older paid headers without payment children remain supported. Cross-month receipts are considered before interpreting a header as a legacy payment.
- Distinguish Paid, Still owed, Scheduled and Unscheduled in Fleet. A scheduled payment is not a paid payment.
- Editing an upcoming statement preserves paid receipts and unrelated statement history. It updates unpaid payments with stable identifiers and writes replacements before deleting retired schedule rows. Paid statements cannot have their history erased through the upcoming-statement delete action.
- Do not silently fall back to local success when an authenticated occurrence read/write/delete fails. Dock changes appear only after persistence succeeds and failed actions show an error.

Reported bank/card balance snapshots are not automatically overwritten by checking off a payment. No production data, schema, credentials, or bank balances were modified. Multi-row schedule edits still use the existing repository operations, not a database transaction; a failure is reported and may require reloading to see partially persisted edits. Paid receipts are excluded from replacement/deletion.

## iOS launch

Added 38 compact portrait/landscape PNG launch images (about 410 KB combined), generated from the existing vector logo, and device-matched `apple-touch-startup-image` metadata. Added the Next route loading fallback and an inline initial page background. No financial data is cached in a service worker.

Apple documents startup images as the content shown while a Home Screen web app launches in its [Safari Web Content Guide](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html). The later route fallback follows [Next's loading convention](https://nextjs.org/docs/app/api-reference/file-conventions/loading). This improves what is visible during launch; it does not eliminate OS startup, authentication, or network latency. Actual iPhone cold launch still needs device validation after deployment; an existing Home Screen installation may retain older launch assets.

## Verification

- `node scripts/verify-card-payments.cjs`: nine production-domain checks, covering the two-card month boundary, completion/undo/partial payments, duplicate headers, legacy receipts, snapshot updates, same-day timestamps and card isolation.
- `node scripts/verify-card-persistence.cjs`: authentication/read/write/delete failures propagate without fake local success; successful saves retain the local mirror.
- `node scripts/verify-harbor-polish.cjs`: all 31 existing checks pass.
- TypeScript, ESLint and production build pass. Build required access to the existing Google-hosted Geist font; the existing middleware deprecation notice remains.
- Headless Chrome using production assets and intercepted synthetic API responses: failed Dock payment retains the unpaid row and displays an error; successful Dock payment removes the completed Fleet statement across September/October; partial schedule edits retain paid receipts and older statements. Mobile layout has no horizontal overflow. The rendered head includes all 38 startup-image links. Inspected the mobile Fleet screenshot and generated launch image.
- No authenticated production-ledger reconciliation or physical iPhone/Safari test was performed. This is a local code fix, not a deployment or a confirmation that all of the user's historical balances reconcile.
