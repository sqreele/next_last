const assert = require('node:assert/strict');
const { test } = require('node:test');
const loadTypeScript = require('./helpers/load-typescript.cjs');
const { groupMachinesByCategory } = loadTypeScript(`${__dirname}/../app/lib/machine-categories.ts`);

test('categories combine whitespace and case variants without changing machine records', () => {
  const machines = [
    { machine_id: 'A', category: ' Pump ', status: 'active' },
    { machine_id: 'B', category: 'pump', status: 'repair' },
    { machine_id: 'C', category: 'HVAC', status: 'active' },
  ];
  const categories = groupMachinesByCategory(machines);
  assert.equal(categories.length, 2);
  assert.deepEqual(categories.find((group) => group.key === 'category:pump').machines.map((m) => m.machine_id), ['A', 'B']);
  assert.equal(machines[0].category, ' Pump ');
  assert.equal(machines[0].machine_id, 'A');
});

test('missing categories remain accessible without colliding with a named category', () => {
  const groups = groupMachinesByCategory([
    { machine_id: 'A' }, { machine_id: 'B', category: ' ' },
    { machine_id: 'C', category: null }, { machine_id: 'D', category: 'Uncategorized' },
  ]);
  assert.equal(groups.find((group) => group.key === 'uncategorized').machines.length, 3);
  assert.equal(groups.find((group) => group.key === 'category:uncategorized').machines[0].machine_id, 'D');
  assert.equal(groups.at(-1).label, null);
});

test('grouping includes only machines supplied by the current property and filters', () => {
  const groups = groupMachinesByCategory([{ machine_id: 'FILTERED', category: 'Pump' }]);
  assert.deepEqual(groups.flatMap((group) => group.machines.map((machine) => machine.machine_id)), ['FILTERED']);
  assert.deepEqual(groupMachinesByCategory([]), []);
});
