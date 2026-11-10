const assert = require('node:assert/strict');
const { test } = require('node:test');
const loadTypeScript = require('./helpers/load-typescript.cjs');
const { buildMachineSummaries } = loadTypeScript(`${__dirname}/../app/lib/machine-dashboard-summary.ts`);

test('latest update and maintenance completion remain separate per machine', () => {
  const machines = [{ machine_id: 'A', last_maintenance_date: '2026-01-01' }, { machine_id: 'B' }];
  const completed = { machine: { machine_id: 'A' }, status: 'completed', created_at: '2026-01-02', completed_at: '2026-01-03' };
  const pending = { machine: { machine_id: 'A' }, status: 'pending', created_at: '2026-01-01', updated_at: '2026-01-10' };
  const plans = [
    { machines: [{ machine_id: 'A' }], status: 'completed', completed_date: '2026-01-05' },
    { machines: [{ machine_id: 'A' }], status: 'pending', completed_date: '2026-01-20' },
  ];
  const summary = buildMachineSummaries(machines, [pending, completed], plans);
  assert.equal(summary.get('A').latestJob, pending);
  assert.equal(summary.get('A').lastMaintenance, '2026-01-05');
  assert.equal(summary.get('A').openJobs, 1);
  assert.deepEqual(summary.get('B'), { openJobs: 0 });
});

test('invalid dates and jobs for other machines cannot replace maintenance dates', () => {
  const machines = [{ machine_id: 'A', last_maintenance_date: '2026-01-01' }];
  const jobs = [
    { machine: { machine_id: 'OTHER' }, status: 'completed', created_at: '2026-01-10', completed_at: '2026-01-10' },
    { machine: { machine_id: 'A' }, status: 'completed', created_at: '2026-01-02', completed_at: 'invalid' },
  ];
  assert.equal(buildMachineSummaries(machines, jobs, []).get('A').lastMaintenance, '2026-01-01');
  assert.equal(machines[0].last_maintenance_date, '2026-01-01');
});
