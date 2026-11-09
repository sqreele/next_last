// Isolated localhost harness. It copies the actual billing component and uses
// the actual design system, without the application's authentication or data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'staymaint-company-preview-'));
fs.mkdirSync(path.join(root, 'app'));
for (const [name, target] of [
  ['node_modules', 'node_modules'], ['app/components', 'app/components'], ['app/lib', 'app/lib'],
]) fs.symlinkSync(path.join(source, target), path.join(root, name), 'dir');
for (const [from, to] of [
  ['app/dashboard/settings/billing/CompanyBilling.tsx', 'app/CompanyBilling.tsx'],
  ['app/dashboard/settings/billing/BillingDocuments.tsx', 'app/BillingDocuments.tsx'],
  ['app/globals.css', 'app/globals.css'], ['tailwind.config.ts', 'tailwind.config.ts'],
]) fs.copyFileSync(path.join(source, from), path.join(root, to));
fs.appendFileSync(path.join(root, 'app/globals.css'), `\n@source "${path.join(source, 'app/components/ui')}";\n`);
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'staymaint-company-preview', private: true }));
fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
  target: 'ES2017', lib: ['dom', 'esnext'], strict: true, noEmit: true, esModuleInterop: true,
  module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', baseUrl: '.',
  paths: { '@/*': ['./*'] }, skipLibCheck: true,
}, include: ['**/*.ts', '**/*.tsx'], exclude: ['node_modules'] }));
fs.writeFileSync(path.join(root, 'next.config.mjs'), 'export default { devIndicators: false, experimental: { cpus: 1 } };\n');
fs.writeFileSync(path.join(root, 'postcss.config.mjs'), 'export default { plugins: { "@tailwindcss/postcss": {} } };\n');
fs.writeFileSync(path.join(root, 'app/layout.tsx'), 'import "./globals.css"; export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="th"><body>{children}</body></html>; }\n');
fs.writeFileSync(path.join(root, 'app/page.tsx'), '"use client"; import CompanyBilling from "./CompanyBilling"; import BillingDocuments from "./BillingDocuments"; import { LocaleProvider } from "@/app/lib/i18n/LocaleProvider"; import { LocaleToggle } from "@/app/components/i18n/LocaleToggle"; export default function Page() { return <LocaleProvider><main className="mx-auto max-w-5xl p-4 space-y-5"><LocaleToggle /><CompanyBilling tenantId="TTEST" onChanged={async () => {}} /><BillingDocuments tenantId="TTEST" companyBilling onRefresh={async () => {}} /></main></LocaleProvider>; }\n');
const child = spawn(process.execPath, [path.join(source, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', process.env.COMPANY_BILLING_PREVIEW_PORT || '3117'], { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => { process.exitCode = code || 0; });
