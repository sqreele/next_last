"""Summarize only completed browser evidence, keeping failures and redirects explicit."""
import json, os
from collections import Counter
from pathlib import Path
base=Path(__file__).resolve().parent
repo=base.parents[3]
root=Path(os.environ.get('MOBILE_AUDIT_ROOT','/tmp/staymaint-mobile-batches'))
manifest=json.loads((root/'manifest.json').read_text())
records=[]
for i,case in enumerate(manifest):
 p=root/'results'/f'{i}.json'
 records.append(json.loads(p.read_text()) if p.exists() else {**case,'index':i,'status':'pending','measurements':[]})
counts=Counter(r['status'] for r in records)
passed=counts['passed']+counts['passed-redirect']
complete=passed==len(records)
views=sum(len(r['measurements']) for r in records if r['status'].startswith('passed'))
source_count=len({r['source'] for r in records})
lines=['# Mobile browser audit — 2026-11-08','',f'**{"Complete" if complete else "In progress"}: {passed}/{len(records)} URLs passed**, covering {source_count} page templates. Completed passes include {counts["passed-redirect"]} intentional redirects and {views} viewport checks. The concrete marketing URLs are included alongside the dynamic route templates.','','## Method and limits','','- Chromium mobile/touch emulation at 320×844, 375×844, 390×844, and 768×1024.','- Use one URL per local dev-server session by default to bound memory; marketing variants sharing a template ran in batches of four.','- Copy application code to `/tmp/staymaint-mobile-batches/site`; replace only the copied server session transport with a synthetic local session. This session override exists only in the isolated copy; the path-matching fix listed below is the production code change.','- Both browser and server API calls use synthetic fixtures on localhost. Writes are rejected; the invitation-preview POST is a read-only fixture. External requests are blocked in the browser.','- Wait for content and the intended redirect destination. Loading states, unintended error boundaries, unexpected redirects, and browser exceptions cannot pass. Dedicated error/access-denied pages are checked in their intended state.','- Check document/main horizontal overflow, content outside viewport bounds, and mobile editing fonts. Wide tables/floor plans may scroll inside their own containers.','- Capture a screenshot for every successful viewport observation. A redirect pass verifies its trigger and destination, not a separately rendered page.','- This verifies the responsive layout with fixture data. It does not verify real tenant data, production authentication, payment processing, physical-device Safari, or the iOS keyboard.','','## Fixes found by this browser run','','1. Jobs Report: shared mobile headers combined `width: 100%` with side margins and overflowed their parent by 12px. Use automatic width so the gutters fit.','2. Machine detail: a long equipment name expanded a flex child at 768px. Allow the flex children to shrink and wrap unbroken names.',
'3. Demo job/machine details: wrap unbroken remarks and descriptions to prevent overflow at 320px.',
'4. Jobs by Topic and Rooms by Topic: use the server data transport for property loading; the browser API helper used a relative URL during SSR.',
'5. Demo Report: record the update timestamp only after data loads so SSR and initial hydration render the same placeholder.',
'6. Public PM marketing page: match protected paths by segment boundary, so `/preventive-maintenance-hotel` stays public. Browser requests without cookies still receive a Dashboard login redirect (307) and Jobs API denial (401).','','## Per-URL results','','| # | URL | Result | Viewports |','| --- | --- | --- | --- |']
for r in records:
 url=r['url']
 status=r['status']
 label={'passed':'Passed','passed-redirect':'Passed redirect','blocked':'Needs rerun','failed-layout':'Layout issue','pending':'Pending'}.get(status,status)
 lines.append(f'| {r["index"]} | `{url}` | {label} | {len(r.get("measurements",[]))} |')
lines+=['','## Evidence','','Screenshots and full per-page JSON: `/tmp/staymaint-mobile-batches/results/`. The checked-in summary JSON contains the final status, headings, and viewport measurements for each URL. Batch/server logs remain in `/tmp/staymaint-mobile-batches/`.','','## Repeat or resume','','```bash','npm install --prefix /tmp/staymaint-mobile-audit playwright','PLAYWRIGHT_BROWSERS_PATH=/tmp/staymaint-mobile-audit/browsers /tmp/staymaint-mobile-audit/node_modules/.bin/playwright install --with-deps chromium','cd frontend/Lastnext','node scripts/audit-mobile.cjs','# Rerun selected URL indices from the table:','AUDIT_INDICES=28,29 node scripts/audit-mobile.cjs','```','','The default is one page per dev-server session. Completed passes are skipped on resume only for the same application/fixture fingerprint; failed or pending pages are retried. Changing application code or fixtures archives the old evidence and requires a fresh run. Use `AUDIT_BATCH_SIZE` only when more memory is available. `MOBILE_AUDIT_ROOT` changes the isolated output directory. No fixture server or auth stub belongs in a deployment.']
validation_path=root/'validation.json'
if validation_path.exists():
    validation=json.loads(validation_path.read_text())
    fingerprint=root/'.source.sha256'
    if fingerprint.exists() and validation.get('source_sha256')==fingerprint.read_text().strip():
        lines += ['', '## Final validation', '', '- `npm run typecheck` — passed.', f'- `npm test` — {validation["frontend_test_files"]} test files passed, zero failures.', '- `git diff --check` — passed.', '- Fixture contract and JavaScript/Python syntax checks — passed.']
report=repo/'docs/mobile-device-audit-2026-11-08.md'
report.write_text('\n'.join(lines)+'\n')
evidence=[{k:v for k,v in r.items() if k not in ['body']} for r in records]
(repo/'docs/mobile-device-audit-results-2026-11-08.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'passed':passed,'total':len(records),'viewports':views,'status':dict(counts)}))
if not complete:raise SystemExit(2)
