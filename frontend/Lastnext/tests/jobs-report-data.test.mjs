import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
const displayNames = {};
const displaySource = await readFile(new URL('../app/lib/utils/display-name.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(displaySource, { compilerOptions }).outputText, { exports: displayNames });
const report = {};
const source = await readFile(new URL('../app/lib/jobs-report-data.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions }).outputText, {
  exports: report,
  require(name) {
    if (name === './utils/display-name') return displayNames;
    throw new Error(`Unexpected dependency: ${name}`);
  },
});

const baseJob = {
  id: 1, job_id: 'job-a', description: 'Repair pump', status: 'pending', priority: 'high',
  created_at: '2026-10-31T18:00:00Z', user: 7, topics: [{ id: 3, title: 'Plumbing' }],
  rooms: [{ room_id: 101, name: 'Room 101' }], is_preventivemaintenance: true,
};

test('report filters use the property timezone at a month boundary', () => {
  const filter = (timezone) => report.filterJobsForReport(
    [baseJob], 'all', 'all', 'all', 'all', 'all', '11', '2026', '', '', '', timezone,
  );
  assert.equal(filter('Asia/Bangkok').length, 1);
  assert.equal(filter('UTC').length, 0);
});

test('report combines status, priority, PM, topic, assignee and search filters', () => {
  const matching = report.filterJobsForReport(
    [baseJob, { ...baseJob, id: 2, status: 'completed' }],
    'pending', 'high', 'pm', '3', '7', 'all', 'all', '2026-11-01', '2026-11-01',
    'plumbing', 'Asia/Bangkok',
  );
  assert.equal(matching.length, 1);
  assert.equal(matching[0].job_id, 'job-a');
  assert.equal(report.filterJobsForReport(
    [baseJob], 'all', 'all', 'non_pm', 'all', 'all', 'all', 'all', '', '', '', 'UTC',
  ).length, 0);
});

test('report counts PM separately and keeps zero-baseline comparison undefined', () => {
  const current = report.buildComparisonSnapshot([baseJob, { ...baseJob, is_preventivemaintenance: false }]);
  assert.equal(current.total, 2);
  assert.equal(current.pm, 1);
  assert.equal(current.nonPm, 1);
  const metrics = report.buildComparisonMetrics(current, { total: 1, pm: 0, nonPm: 1 });
  assert.equal(metrics[0].deltaPct, 100);
  assert.equal(metrics[1].deltaPct, null);
});

test('room summaries retain every linked room and legacy room-name fallback', () => {
  assert.equal(report.getJobRoomEntries({ ...baseJob, rooms: [...baseJob.rooms, { room_id: 102, name: 'Room 102' }] }).length, 2);
  assert.equal(report.getJobRoomEntries({ rooms: [], room_name: ' Lobby ' })[0].displayName, 'Lobby');
  assert.equal(report.getJobRoomEntries({ rooms: [] }).length, 0);
});
