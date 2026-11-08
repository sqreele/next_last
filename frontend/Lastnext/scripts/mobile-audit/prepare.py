"""Create an isolated local copy for browser layout testing; never modify live auth."""
import hashlib, json, os, shutil, subprocess
from datetime import datetime, timezone
from pathlib import Path
source = Path(__file__).resolve().parents[2]
root = Path(os.environ.get('MOBILE_AUDIT_ROOT', '/tmp/staymaint-mobile-batches'))
site = root / 'site'
if site.resolve() == source or source in site.resolve().parents:
    raise RuntimeError('The browser fixture copy must be outside the application source tree.')
root.mkdir(parents=True, exist_ok=True)
marker = root / '.mobile-audit-owned'
if site.exists() and not marker.exists():
    raise RuntimeError('Refusing to overwrite an unmarked directory; select a fresh MOBILE_AUDIT_ROOT.')
marker.write_text('Owned isolated browser fixture workspace; never deploy.\n')
site.mkdir(parents=True, exist_ok=True)
# Never reuse a passing result for a different version of the application or fixtures.
hash_files = [source/name for name in ['middleware.ts','next.config.mjs','tailwind.config.ts','postcss.config.mjs','package.json','package-lock.json']]
hash_files += sorted(p for p in (source/'app').rglob('*') if p.is_file())
hash_files += [Path(__file__).parent/name for name in ['fixtures.cjs','run-batch.cjs']]
digest = hashlib.sha256()
for item in hash_files:
    digest.update(str(item.relative_to(source)).encode())
    digest.update(item.read_bytes())
fingerprint = root / '.source.sha256'
if fingerprint.exists() and fingerprint.read_text().strip() != digest.hexdigest() and (root/'results').exists():
    archive = root / ('results-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    (root/'results').rename(archive)
    print('Archived stale browser evidence:', archive)
fingerprint.write_text(digest.hexdigest() + '\n')
for name in ['app','lib']:
    shutil.copytree(source/name, site/name, dirs_exist_ok=True)
for name in ['package.json','tsconfig.json','next-env.d.ts','postcss.config.mjs','tailwind.config.ts','middleware.ts']:
    shutil.copy2(source/name,site/name)
for name in ['node_modules','public']:
    target=site/name
    if not target.exists(): target.symlink_to(source/name,target_is_directory=True)
config=(source/'next.config.mjs').read_text().replace("const repoRoot = path.resolve(projectRoot, '..', '..')",'const repoRoot = projectRoot')
(site/'next.config.mjs').write_text(config)
fixture_module=source/'scripts/mobile-audit/fixtures.cjs'
user=json.loads(subprocess.check_output(['node','-e','process.stdout.write(JSON.stringify(require(process.argv[1]).user))',str(fixture_module)]))
(site/'audit-session.json').write_text(json.dumps(user))
# Stub only the copied server session transport. All page/layout code remains copied verbatim.
(site/'app/lib/auth0/server-session.ts').write_text('''import { cookies } from "next/headers";
import user from "../../../audit-session.json";
export async function getCompatServerSession() { return (await cookies()).get("auth0_session") ? {user, expires:"2099-01-01"} : null; }
export async function requireServerAccessToken() { return (await getCompatServerSession())?.user.accessToken || null; }
export async function getUserProfile(id: string) { return id === user.id ? user : null; }
''')
print(site)
