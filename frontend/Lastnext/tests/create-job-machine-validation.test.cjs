const assert = require('node:assert/strict');
const { test } = require('node:test');
const loadTypeScript = require('./helpers/load-typescript.cjs');
const { createValidationSchema } = loadTypeScript(`${__dirname}/../app/components/jobs/create-job-validation.ts`);
const schema = createValidationSchema((key) => key);
const machineJob = {
  locationType: 'machine', machine_id: 'PUMP-001', procedure_template: 5,
  description: 'Inspect pump', status: 'pending', priority: 'medium',
  topic: { title: '', description: '' }, room: null, area_id: null,
  files: [new File(['image'], 'before.jpg', { type: 'image/jpeg' })],
  afterFiles: [], documents: [],
};

test('machine jobs validate with a template and no user-selected category', async () => {
  await schema.validate(machineJob);
});

test('machine jobs require a template and a machine', async () => {
  for (const [field, value] of [['procedure_template', null], ['machine_id', '']]) {
    await assert.rejects(schema.validate({ ...machineJob, [field]: value }), (error) => error.path === field);
  }
});

test('room jobs still require a category but do not require a template', async () => {
  const roomJob = { ...machineJob, locationType: 'location', machine_id: '', procedure_template: null,
    room: { room_id: 1, name: '101' } };
  await assert.rejects(schema.validate(roomJob), (error) => error.path === 'topic.title');
  await schema.validate({ ...roomJob, topic: { title: 'Electrical', description: '' } });
});
