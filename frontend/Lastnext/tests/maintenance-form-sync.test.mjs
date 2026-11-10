import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
const contracts = {};
const typeSource = await readFile(new URL('../app/components/preventive/maintenance-form-types.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(typeSource, { compilerOptions }).outputText, { exports: contracts });
const source = await readFile(new URL('../app/components/preventive/MaintenanceFormSync.tsx', import.meta.url), 'utf8');

function runSync(props, values) {
  const effects = [];
  const writes = [];
  const fetches = [];
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions }).outputText, {
    exports,
    require(name) {
      if (name === 'react') return { useEffect: (effect) => { effects.push(effect); } };
      if (name === 'formik') return { useFormikContext: () => ({
        values, setFieldValue: (...args) => { writes.push(args); },
      }) };
      if (name === './maintenance-form-types') return contracts;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  exports.MaintenanceFormSync({
    selectedProperty: 'property-a', availableMachines: [], availableMaintenanceTasks: [],
    loadingMachines: false,
    fetchAvailableMaintenanceTasks: async (ids) => { fetches.push(ids); },
    ...props,
  });
  effects.forEach((effect) => effect());
  return { writes, fetches };
}

test('creation follows the active property and preselects an available machine', () => {
  const result = runSync({ machineId: 'machine-a', availableMachines: [{ machine_id: 'machine-a' }] }, {
    property_id: 'old-property', selected_machine_ids: [], procedure_template: '',
  });
  assert.deepEqual(result.writes[0], ['property_id', 'property-a', false]);
  assert.equal(result.writes[1][0], 'selected_machine_ids');
  assert.equal(result.writes[1][1][0], 'machine-a');
});

test('a selected template stays authoritative over a preselected machine', () => {
  const result = runSync({
    machineId: 'machine-a',
    availableMachines: [{ machine_id: 'machine-a' }, { machine_id: 'machine-b' }],
    availableMaintenanceTasks: [{ id: 10, machine_ids: ['machine-b'] }],
  }, { property_id: 'property-a', selected_machine_ids: ['machine-a', 'machine-b'], procedure_template: 10 });
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0][0], 'selected_machine_ids');
  assert.equal(result.writes[0][1].join(','), 'machine-b');
  assert.equal(result.fetches.length, 0);
});

test('editing does not replace the saved property or force a machine selection', () => {
  const result = runSync({
    pmId: 'existing-pm', machineId: 'machine-a',
    availableMachines: [{ machine_id: 'machine-a' }],
  }, { property_id: 'saved-property', selected_machine_ids: [], procedure_template: '' });
  assert.equal(result.writes.length, 0);
  assert.equal(result.fetches.length, 0);
});
