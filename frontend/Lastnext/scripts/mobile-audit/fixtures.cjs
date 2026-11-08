const long = 'เครื่องจักรระบบปรับอากาศอาคารโรงแรม-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const property = { id: 1, property_id: 'MOBILE', name: 'Mobile Audit Hotel', description: 'Audit fixture' };
const user = { id: '1', username: 'mobile-audit', email: 'mobile@example.test', positions: 'Admin', properties: [property], created_at: '2026-11-01T00:00:00Z', first_name: 'Mobile', last_name: 'Audit', is_superuser: true, is_staff: true };
const machine = { machine_id: 'MC-001', name: long, brand: 'Brand', serial_number: long, category: 'Air Conditioning', location: 'Roof', status: 'active', description: long, asset_tag: 'ASSET-001', installation_date: '2025-01-01', last_maintenance_date: '2026-10-01', warranty_end_date: '2027-01-01', property, property_id: 'MOBILE', property_name: property.name, preventive_maintenances: [] };
const demoJob = { id: 'DEMO-001', title: 'ตรวจสอบเครื่องปรับอากาศ', room: '101', technician: 'Audit Technician', status: 'in_progress', priority: 'high', category: 'Repair', updated: '2026-11-08T01:00:00Z', created: '2026-11-01T01:00:00Z', completed: null, remarks: long, is_defective: false, is_preventive_maintenance: false, machine, images: [{ id: 1, image_type: 'before', image_url: '/branding/logo-mark-dark-tile.svg' }], comments: [], documents: [] };
const job = { ...demoJob, id: 1, job_id: 'JOB-001', description: 'ตรวจสอบเครื่องปรับอากาศ', created_at: demoJob.created, updated_at: demoJob.updated, completed_at: null, user, user_name: 'Audit Technician', technician_name: 'Audit Technician', property_id: 'MOBILE', rooms: [], topics: [], images: [], can_operate: true, can_assign: true };
const pm = { pm_id: 'PM-001', pmtitle: 'ตรวจเช็คเครื่องจักรรายเดือน', scheduled_date: '2026-10-01T00:00:00Z', status: 'pending', frequency: 'monthly', procedure: 'ตรวจสอบตามแผน', quality_score: null, assigned_to_name: 'Audit Technician', assigned_to: 'Audit Technician', machines: [machine], machine_ids: ['MC-001'], topics: [], images: [], can_operate: true };
const snapshot = { property, rooms: ['101', '102'], areas: ['Lobby'], categories: ['Repair', 'PMMs Rooms'], machine_categories: ['Repair'], machines: [machine], jobs: [demoJob], inventory: [{ item_id: 'INV-001', name: 'Spare part', quantity: 2, status: 'low_stock' }], maintenance: [pm], reset_interval_minutes: 45 };
const list = (results) => ({ results, count: results.length, next: null, previous: null, total_pages: 1, current_page: 1, page_size: 200 });
const capabilities = ['platform.tenants.read', 'platform.billing.read', 'platform.usage.read', 'platform.billing.diagnostics.read'];
Object.assign(user, { accessToken: 'local-mobile-audit-fixture', accessTokenExpires: 4102444800000, display_name: 'Mobile Audit', is_active: true });
const profile = { ...user, first_name: 'Mobile', last_name: 'Audit', email_notifications_enabled: true, memberships: [{ tenant_id: '1', tenant_name: 'Audit Hotel Group', role: 'owner', access_scope: 'tenant_wide', properties: [property] }], platform_roles: ['platform_admin'], platform_capabilities: capabilities, is_platform_user: true, is_platform_superuser: true };
const room = { id: 101, room_id: '101', name: '101', room_name: '101', room_type: 'Deluxe', property_id: 'MOBILE', property, property_name: property.name, is_active: true, created_at: job.created_at, updated_at: job.updated_at, properties: [property], description: 'Guest room audit fixture', floor: '1', status: 'available', topics: [] };
const topic = { id: 1, title: 'Air Conditioning', description: 'Inspect room air conditioning', priority: 'medium', property_id: 'MOBILE' };
Object.assign(job, { name: 'Air conditioning inspection', rooms: [room], topics: [topic], topic_data: [topic], properties: [property], is_preventivemaintenance: false, is_preventive_maintenance: false, comments: [], documents: [], remarks: 'Inspect cooling operation', machine: machine });
Object.assign(pm, { job: job, topics: [topic], created_by: 1, created_by_details: user, assigned_to: 1, assigned_to_details: user, completed_date: null, next_due_date: '2026-12-08T00:00:00Z', before_image_url: null, after_image_url: null, images: [], image_counts: { before: 0, after: 0 }, property_id: 'MOBILE', notes: 'Inspect operating condition', master_plan: null, is_overdue: true, days_remaining: -1 });
const task = { id: 1, name: 'Air conditioning inspection procedure', description: 'Clean filters and check cooling operation.', frequency: 'monthly', estimated_duration: '30', responsible_department: 'Engineering', difficulty_level: 'beginner', required_tools: 'Thermometer', safety_notes: 'Disconnect power before inspection.', steps: [], created_at: job.created_at, updated_at: job.updated_at };
const masterPlan = { plan_id: 'PLAN-001', title: 'Monthly air conditioning plan', description: 'Monthly equipment inspection', frequency: 'monthly', interval: 1, start_date: '2026-11-01', end_date: null, next_due_date: '2026-12-01', status: 'active', active: true, is_active: true, machines: [machine], machine_ids: [machine.machine_id], topics: [topic], assigned_to: 1, assigned_to_details: user, estimated_duration: 30, procedure: 'Inspect and clean filters', lead_time_days: 7, property_id: 'MOBILE', priority: 'medium', occurrences: [], generated_count: 1 };
const plan = { id: 1, code: 'pro', name: 'Pro', monthly_price: 99, max_users: 20, max_properties: 5, max_monthly_work_orders: 1000, max_pm_schedules: 100, max_assets: 500, max_storage_mb: 10240, features: {} };
const subscription = { id: 1, tenant_id: '1', tenant_name: 'Audit Hotel Group', plan, status: 'active', entitlement_level: 'full', provider_mode: 'test', subscription_bound: true, customer_bound: true, current_period_start: '2026-11-01T00:00:00Z', current_period_end: '2026-12-01T00:00:00Z', trial_end: null, cancel_at_period_end: false };
const usage = { tenant_id: '1', tenant_name: 'Audit Hotel Group', period_start: '2026-11-01', period_end: '2026-11-30', property_count: 1, active_user_count: 1, work_order_count: 1, pm_schedule_count: 1, asset_count: 1, storage_mb: 1 };
const inventory = { id: 1, item_id: 'INV-001', name: 'Air filter', description: 'Replacement filter', category: 'HVAC', quantity: 12, minimum_quantity: 5, min_quantity: 5, unit: 'pcs', status: 'available', location: 'Store room', property_id: 'MOBILE', property, unit_price: 20, images: [], created_at: job.created_at, updated_at: job.updated_at };
const summary = { totalJobs: 1, pmJobs: 0, nonPmJobs: 1, completionRate: 0, trendByMonth: [{ month: 'Nov', year: 2026, jobs: 1 }], pmNonPmByMonth: [{ month: 'Nov', year: 2026, pm: 0, nonPm: 1 }], statusByMonth: [{ month: 'Nov', year: 2026, status: 'Waiting Sparepart', count: 1 }], topUsersByMonth: [{ month: 'Nov', year: 2026, user: 'Mobile Audit', pm: 0, nonPm: 1 }], topicsByMonth: [{ month: 'Nov', year: 2026, topic: 'Air Conditioning', count: 1, pm: 0, nonPm: 1, isPreventive: false }] };
const features = Object.fromEntries(['preventive_maintenance', 'pm_schedules', 'technician_kpi', 'advanced_reports', 'csv_export', 'multi_property', 'advanced_property_permissions', 'portfolio_dashboard'].map(x => [x, true]));
function respond(input, method = 'GET', authenticated = true) {
    const u = new URL(input, 'http://127.0.0.1:3101'), p = u.pathname.replace(/\/$/, '');
    if (method === 'POST' && p.includes('/invitations/preview'))
        return { status: 200, body: { tenant_name: 'Audit Hotel Group', role: 'technician', properties: [property], expires_at: '2099-01-01T00:00:00Z', status: 'pending' } };
    if (method !== 'GET' && method !== 'HEAD')
        return { status: 405, body: { detail: 'Read-only isolated mobile layout audit' } };
    let body;
    if (p.includes('session-compat'))
        body = authenticated ? { user, expires: '2099-01-01T00:00:00Z' } : null;
    else if (p.includes('csrf'))
        body = { csrfToken: 'local-fixture', csrftoken: 'local-fixture' };
    else if (p === '/api/demo')
        body = snapshot;
    else if (p.includes('/demo/email-preview'))
        body = { html: '<html><body><h1>Audit daily maintenance report</h1><p>Air conditioning inspection</p></body></html>', date: '2026-11-08', template: 'daily_summary.html', technicians: ['Audit Technician'], technician: 'Audit Technician', job_count: 1, preview_only: true };
    else if (p.startsWith('/api/demo/'))
        body = demoJob;
    else if (p.includes('profile/me') || p.includes('user-profiles/me'))
        body = profile;
    else if (p.includes('entitlement'))
        body = { ...subscription, features, plan, can_operate: true };
    else if (p.includes('commercial-plans'))
        body = [plan];
    else if (p.includes('dashboard/summary'))
        body = summary;
    else if (p.includes('utility/consumption'))
        body = [{ month: 'November', year: 2026, totalkwh: 1200, onpeakkwh: 800, offpeakkwh: 400, totalelectricity: 6000, electricity_cost_budget: 8000, water: 100, nightsale: 300 }];
    else if (p.includes('platform/summary'))
        body = { total_tenants: 1, active_subscriptions: 1, commercial_plans: [plan], attention_subscriptions: [subscription], provider_mode: 'test' };
    else if (/platform\/tenants\/1$/.test(p))
        body = { tenant_id: '1', name: 'Audit Hotel Group', timezone: 'Asia/Bangkok', status: 'active', subscription, properties: [property], memberships: [{ ...profile, user: 'mobile-audit', role: 'owner', is_active: true, property_scope: { all_tenant_properties: true, properties: [property] } }], usage, capabilities: features, webhook_summary: {}, stripe_binding: { customer_bound: true, subscription_bound: true, provider_mode: 'test' } };
    else if (p.includes('platform/tenants'))
        body = list([{ tenant_id: '1', name: 'Audit Hotel Group', subscription, usage, plan }]);
    else if (p.includes('platform/subscriptions'))
        body = list([subscription]);
    else if (p.includes('platform/usage'))
        body = list([usage]);
    else if (p.includes('platform/webhook-events'))
        body = list([{ id: 1, event_id: 'evt_audit', event_type: 'customer.subscription.updated', status: 'processed', processed_at: job.created_at, created_at: job.created_at }]);
    else if (p.includes('billing/tenants') || p.endsWith('/tenants'))
        body = list([{ tenant_id: '1', name: 'Audit Hotel Group', role: 'owner' }]);
    else if (p.includes('billing/plans'))
        body = list([plan]);
    else if (p.includes('billing/status'))
        body = { ...subscription, plan, usage, features, can_manage_billing: true, can_start_checkout: true, reason_code: 'active' };
    else if (p.includes('tenant-subscriptions'))
        body = list([subscription]);
    else if (p.includes('preventive-maintenance/plans/PLAN-001') || p.includes('maintenance-plans/PLAN-001') || p.includes('pm-master-plans/PLAN-001'))
        body = masterPlan;
    else if (p.includes('preventive-maintenance/plans') || p.includes('maintenance-plans') || p.includes('pm-master-plans'))
        body = [masterPlan];
    else if (p.includes('preventive-maintenance/projection'))
        body = { from: '2026-11-01', to: '2026-12-01', total: 1, items: [{ plan_id: masterPlan.plan_id, pmtitle: masterPlan.title, scheduled_date: masterPlan.next_due_date, frequency: 'monthly', occurrence_type: 'projected', generated_pm_id: null, machine_ids: [machine.machine_id] }] };
    else if (p.includes('preventive-maintenance/schedule')) {
        const from = u.searchParams.get('from') || '2026-11-08', count = Number(u.searchParams.get('days') || 7);
        const days = Array.from({ length: count }, (_, i) => { const d = new Date(from); d.setUTCDate(d.getUTCDate() + i); return { date: d.toISOString().slice(0, 10), weekday: d.toLocaleDateString('en', { weekday: 'short' }), items: i === 0 ? [{ ...pm, calendar_date: from, calendar_status: 'overdue', occurrence_type: 'generated', generated_pm_id: pm.pm_id }] : [], overdue_count: i === 0 ? 1 : 0, open_count: i === 0 ? 1 : 0, completed_count: 0, cancelled_count: 0 }; });
        body = { from, to: days.at(-1).date, days, total: 1, status: 'all', property_id: 'MOBILE', property_name: property.name, timezone: 'Asia/Bangkok', today: from, can_operate: true };
    }
    else if (p.includes('preventive-maintenance/stats'))
        body = { total: 1, pending: 1, completed: 0, in_progress: 0, overdue: 1, counts: { total: 1, pending: 1, completed: 0, overdue: 1, cancelled: 0 }, frequency_distribution: [{ frequency: 'monthly', count: 1 }], avg_completion_times: { monthly: 30 }, upcoming: [pm], machine_distribution: [{ machine_id: machine.machine_id, name: machine.name, count: 1 }], completion_rate: 0, status_counts: { pending: 1 }, can_manage_pm_master: true, can_operate: true, stats: { total: 1, pending: 1 } };
    else if (p.includes('preventive-maintenance/PM-001'))
        body = pm;
    else if (p.includes('preventive-maintenance'))
        body = list([pm]);
    else if (p.includes('maintenance-procedures/1'))
        body = task;
    else if (p.includes('maintenance-procedures'))
        body = list([task]);
    else if (p.includes('/machines/MC-001'))
        body = { ...machine, preventive_maintenances: [pm] };
    else if (p.includes('/machines'))
        body = list([machine]);
    else if (p.includes('/jobs/dashboard') || p.includes('/jobs/my-jobs'))
        body = { ...list([job]), property_id: 'MOBILE', property_name: property.name, status_counts: { total: 1, pending: 0, in_progress: 1, waiting_sparepart: 0, completed: 0, cancelled: 0, defect: 0, preventive_maintenance: 0 }, stats: { total: 1, pending: 0, in_progress: 1, inProgress: 1, completed: 0 }, properties: [property], can_operate: true, can_assign: true };
    else if (p.includes('/jobs/JOB-001/audit-log'))
        body = { job_id: job.job_id, count: 1, events: [{ kind: 'created', at: job.created_at, actor: 'Mobile Audit', message: 'Work order created' }] };
    else if (/\/jobs\/JOB-001\/(comments|audit|history|timeline)/.test(p))
        body = list([]);
    else if (/\/jobs\/JOB-001$/.test(p))
        body = job;
    else if (p.includes('/jobs'))
        body = list([job]);
    else if (/\/rooms\/101$/.test(p))
        body = room;
    else if (p.includes('/rooms'))
        body = list([room]);
    else if (p.includes('/properties/MOBILE'))
        body = property;
    else if (p.includes('/properties'))
        body = [property];
    else if (p.includes('/topics'))
        body = [topic];
    else if (p.includes('/areas'))
        body = list([{ id: 1, name: 'Lobby', property_id: 'MOBILE', property, description: 'Public lobby' }]);
    else if (p.includes('/floorplans/'))
        body = { property, property_id: 'MOBILE', property_name: property.name, floors: [{ id: 'Floor 1', view_box: [0, 0, 800, 500], svg_url: '/branding/logo-mark-dark-tile.svg', guest_rooms: [{ room_id: '101', name: '101', plan_label: '101', polygon: [[20, 20], [200, 20], [200, 200], [20, 200]] }], operational_areas: [] }] };
    else if (p.includes('/inventory'))
        body = list([inventory]);
    else if (p.includes('/invitations/workspace'))
        body = { tenants: [{ id: 1, tenant_id: '1', name: 'Audit Hotel Group' }], properties: [{ ...property, tenant: 1 }] };
    else if (p.includes('/invitations'))
        body = list([{ id: 1, tenant: 1, tenant_name: 'Audit Hotel Group', email: 'technician@example.test', role: 'technician', properties: [property], status: 'pending', expires_at: '2099-01-01T00:00:00Z', created_at: job.created_at, email_sent: true }]);
    else if (p.includes('/memberships'))
        body = list(profile.memberships);
    else if (p.includes('/users') || p.includes('/user-profiles'))
        body = list([user]);
    else if (p.includes('/notifications'))
        body = { ...list([]), unread_count: 0 };
    else if (p.includes('/search'))
        body = { jobs: [job], properties: [property], rooms: [room], results: [job] };
    else
        return { status: 200, body: list([]), unmatched: true };
    return { status: 200, body };
}
snapshot.jobs.push({ ...demoJob, id: 'DWEB-001', title: 'Inspect guest room fan', machine: null, remarks: 'Inspect guest room fan' });
module.exports = { respond, user, profile, job, room, machine, pm, snapshot, property };
if (require.main === module) {
    require('http').createServer((req, res) => { const reply = respond(req.url, req.method); if (reply.unmatched)
        console.log('UNMATCHED ' + req.url); res.writeHead(reply.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(reply.body)); }).listen(3101, '127.0.0.1', () => console.log('FIXTURE_READY'));
}
