// Run against the isolated site produced by prepare.py, never a deployed origin.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { respond } = require('./fixtures.cjs');
const root = process.env.MOBILE_AUDIT_ROOT || '/tmp/staymaint-mobile-batches';
const source = path.resolve(__dirname, '../../app');
const out = path.join(root, 'results');
fs.mkdirSync(out, { recursive: true });
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const aliases = { '/auth/signin': '/auth/login', '/auth/onboarding': '/auth/access-pending', '/auth/logout': '/', '/login': '/auth/login', '/dashboard/createJob': '/dashboard/create-job', '/dashboard/myJobs': '/dashboard/my-jobs', '/dashboard/Preventive_maintenance': '/dashboard/preventive-maintenance', '/dashboard/chartdashboad': '/dashboard/chartdashboard', '/dashboard/billing': '/dashboard/settings/billing' };
const cases = walk(source).filter(p => p.endsWith('/page.tsx')).map(p => {
    const file = path.relative(source, p), template = '/' + path.dirname(file).split('/').filter(x => x !== '.' && !x.startsWith('(')).join('/');
    const url = template.replace('[slug]', template.startsWith('/th') ? encodeURIComponent('ระบบแจ้งซ่อมโรงแรม') : 'hotel-maintenance-software').replace('[propertyId]', 'MOBILE').replace('[roomId]', '101').replace('[room_id]', '101').replace('[machine_id]', 'MC-001').replace('[jobId]', template.startsWith('/demo') ? 'DEMO-001' : 'JOB-001').replace('[pm_id]', 'PM-001').replace('[plan_id]', 'PLAN-001').replace('[tenantId]', '1').replace('[id]', template.startsWith('/dashboard/profile/edit/') ? 'me' : '1');
    return { source: file, template, url, expected: aliases[url] || url, alias: Boolean(aliases[url]) };
});
// Exercise every published marketing copy variant as well as its route template.
const marketing = fs.readFileSync(path.join(source, 'lib/marketing-pages.ts'), 'utf8');
for (const [file, template, slugs] of [
    ['(marketing)/[slug]/page.tsx', '/[slug]', [...marketing.matchAll(/"([a-z-]+)": en\(/g)].map(m => m[1])],
    ['(marketing)/th/[slug]/page.tsx', '/th/[slug]', [...marketing.matchAll(/slug: "([^"]+)"/g)].map(m => m[1])],
])
    for (const slug of slugs) {
        const url = (template.startsWith('/th') ? '/th/' : '/') + encodeURIComponent(slug);
        if (!cases.some(c => c.url === url))
            cases.push({ source: file, template, url, expected: url, alias: false });
    }
if (process.argv.includes('--list')) {
    console.log(JSON.stringify(cases));
    process.exit(0);
}
const selected = JSON.parse(process.env.AUDIT_CASES || '[]');
function normalize(url) { return decodeURI(new URL(url, 'http://127.0.0.1:3100').pathname).replace(/\/$/, '') || '/'; }
async function measure(page) {
    return page.evaluate(() => {
        const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const scrollers = [...document.querySelectorAll('main')].filter(el => visible(el) && el.scrollWidth > el.clientWidth + 2).map(el => ({ width: el.clientWidth, scroll: el.scrollWidth, class: el.className }));
        const outside = [...document.querySelectorAll('main *,[role="dialog"] *')].filter(el => {
            if (!visible(el))
                return false;
            const r = el.getBoundingClientRect(), s = getComputedStyle(el);
            if (r.left >= -2 && r.right <= innerWidth + 2 || s.position === 'absolute' || s.position === 'fixed')
                return false;
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
                const st = getComputedStyle(a);
                if (['auto', 'scroll', 'hidden', 'clip'].includes(st.overflowX) && a.tagName !== 'MAIN' || st.position === 'absolute')
                    return false;
            }
            return true;
        }).slice(0, 8).map(el => ({ tag: el.tagName, class: el.className?.baseVal ?? el.className, text: el.textContent.slice(0, 100) }));
        const smallInputs = innerWidth < 768 ? [...document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]):not([type="color"]),textarea,select')].filter(el => visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16).map(el => ({ tag: el.tagName, name: el.name, font: getComputedStyle(el).fontSize })) : [];
        return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, mainOverflow: scrollers, outside, smallInputs };
    });
}
(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--renderer-process-limit=1'] });
    try {
        for (const index of selected) {
            const c = cases[index], result = { ...c, index, status: 'pending', measurements: [], errors: [], unmatched: [] };
            const authenticated = c.url.startsWith('/dashboard') || c.url.startsWith('/platform') || c.url.startsWith('/report') || c.url.startsWith('/invitations');
            const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
            await ctx.addCookies([{ name: 'pcms-locale', value: 'en', url: 'http://127.0.0.1:3100' }, ...(authenticated ? [{ name: 'auth0_session', value: 'v2.' + 'a'.repeat(43), url: 'http://127.0.0.1:3100' }] : [])]);
            await ctx.addInitScript(() => { if (window === window.top)
                localStorage.setItem('staymaint-demo-language', 'en'); });
            await ctx.route('**/*', async (route) => {
                const req = route.request(), u = new URL(req.url());
                if (!['http:', 'https:'].includes(u.protocol))
                    return route.continue();
                if (u.pathname.startsWith('/api/')) {
                    if (req.resourceType() === 'document' && /\/api\/auth\/(login|logout)/.test(u.pathname))
                        return route.fulfill({ status: 302, headers: { location: u.pathname.includes('logout') ? '/' : '/auth/login/' } });
                    const reply = respond(req.url(), req.method(), authenticated);
                    if (reply.unmatched)
                        result.unmatched.push(u.pathname + u.search);
                    return route.fulfill({ status: reply.status, json: reply.body });
                }
                if (!['127.0.0.1', 'localhost'].includes(u.hostname))
                    return route.abort();
                return route.continue();
            });
            const page = await ctx.newPage();
            page.on('pageerror', e => result.errors.push(e.message.slice(0, 6000)));
            try {
                const query = c.url === '/invitations/accept' ? '?token=mobile-audit-token' : c.url === '/dashboard/search' ? '?q=air' : c.url === '/demo/rooms' ? '?room=101' : '';
                const response = await page.goto('http://127.0.0.1:3100' + (c.url === '/' ? '/' : c.url + '/') + query, { waitUntil: 'domcontentloaded', timeout: 90000 });
                result.http = response?.status();
                if (c.alias)
                    await page.waitForURL(url => normalize(url.toString()) === normalize(c.expected), { timeout: 20000 });
                await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });
                await page.waitForFunction(() => {
                    const headings = [...document.querySelectorAll('h1,h2')].map(el => el.innerText).join(' ');
                    const busy = [...document.querySelectorAll('[aria-busy="true"]')].some(el => el.getBoundingClientRect().height > 0);
                    return !busy && !/Checking authentication|^Loading\b|กำลังโหลด/.test(headings);
                }, undefined, { timeout: 15000 });
                await page.waitForTimeout(600);
                result.finalUrl = page.url();
                result.heading = (await page.locator('h1,h2').allTextContents()).slice(0, 8).join(' | ');
                result.body = (await page.locator('body').innerText()).slice(0, 3500);
                if (normalize(result.finalUrl) !== normalize(c.expected))
                    throw Error('Unexpected navigation: ' + result.finalUrl + ' expected ' + c.expected);
                if (/Equipment not found|Maintenance task not found|Job not found|Invitation unavailable|Floor plan unavailable/i.test(result.heading))
                    throw Error('Fixture did not render intended page');
                if (c.url !== '/dashboard/unauthorized' && /Access denied|Profile unavailable/i.test(result.heading))
                    throw Error('Expected the authorized content view');
                if (result.http >= 400)
                    throw Error('HTTP ' + result.http);
                if (result.errors.length)
                    throw Error('Page error: ' + result.errors.join(' | '));
                if (!c.url.startsWith('/auth/error') && /Something went wrong|Application error|Unable to load|Error loading|Checking authentication|could not be found|could not be loaded|failed to load|did not match the active Property/i.test(result.body))
                    throw Error('Content did not reach its intended state');
                if (c.url === '/demo') {
                    await page.locator('#machines button[aria-controls="demo-machine-details"]').first().click();
                    await page.getByRole('button', { name: 'Close details', exact: true }).waitFor();
                    result.extraState = 'Machine details expanded';
                }
                if (c.url === '/preventive-maintenance-hotel') {
                const privatePage = await ctx.request.get('http://127.0.0.1:3100/dashboard/', { maxRedirects: 0 });
                const privateApi = await ctx.request.get('http://127.0.0.1:3100/api/v1/jobs/', { maxRedirects: 0 });
                result.securityChecks = { dashboardStatus: privatePage.status(), dashboardLocation: privatePage.headers().location, jobsApiStatus: privateApi.status() };
                if (![307, 308].includes(privatePage.status()) || !privatePage.headers().location?.includes('/auth/login') || privateApi.status() !== 401) throw Error('Private route authentication guard regressed');
            }
            for (const width of [320, 375, 390, 768]) {
                    await page.setViewportSize({ width, height: width === 768 ? 1024 : 844 });
                    await page.waitForTimeout(250);
                    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main').forEach(el => el.scrollTo(0, 0)); });
                    const m = await measure(page);
                    result.measurements.push(m);
                    await page.screenshot({ path: path.join(out, `${index}-${width}.png`), fullPage: true, timeout: 12000 });
                }
                result.status = result.measurements.some(m => m.documentWidth > m.width + 2 || m.mainOverflow.length || m.outside.length || m.smallInputs.length) ? 'failed-layout' : c.alias ? 'passed-redirect' : 'passed';
            }
            catch (e) {
                result.status = 'blocked';
                result.reason = e.message;
                try {
                    await page.screenshot({ path: path.join(out, `${index}-blocked.png`), timeout: 5000 });
                }
                catch { }
            }
            finally {
                fs.writeFileSync(path.join(out, `${index}.json`), JSON.stringify(result, null, 2));
                console.log(JSON.stringify({ index, url: c.url, status: result.status, heading: result.heading, reason: result.reason, unmatched: [...new Set(result.unmatched)], bad: result.measurements.filter(m => m.mainOverflow.length || m.outside.length || m.smallInputs.length || m.documentWidth > m.width + 2) }));
                await ctx.close();
            }
        }
    }
    finally {
        await browser.close();
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
