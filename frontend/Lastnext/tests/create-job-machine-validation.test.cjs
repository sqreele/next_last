const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const Yup = require('yup');

// Execute the form's actual schema without loading Next.js and browser components.
const source = readFileSync(`${__dirname}/../app/components/jobs/CreateJobForm.tsx`, 'utf8');
const schemaSource = source.slice(source.indexOf('const createValidationSchema'), source.indexOf('const PRIORITY_OPTIONS'));
const { outputText } = ts.transpileModule(schemaSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
});
const createSchema = new Function('Yup', 'formatMessage', 'MAX_FILE_SIZE', 'MAX_BEFORE_FILES', 'MAX_AFTER_FILES',
  `${outputText}\nreturn createValidationSchema;`)(Yup, (message) => message, 5 * 1024 * 1024, 20, 5);
const schema = createSchema((key) => key);
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
