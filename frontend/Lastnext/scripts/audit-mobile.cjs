#!/usr/bin/env node
// Browser audit entry point. The isolated fixture site is never deployed.
const path = require('path');
const { spawnSync } = require('child_process');
const directory = path.join(__dirname, 'mobile-audit');
const env = {
  ...process.env,
  NODE_PATH: process.env.NODE_PATH || '/tmp/staymaint-mobile-audit/node_modules',
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/tmp/staymaint-mobile-audit/browsers',
};
function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) process.exit(result.status || 1);
  return result.status;
}
if (process.argv.includes('--list')) {
  run('node', [path.join(directory, 'run-batch.cjs'), '--list']);
} else {
  run('python3', [path.join(directory, 'prepare.py')]);
  if (!process.argv.includes('--prepare')) {
    run('python3', [path.join(directory, 'batches.py')], true);
    run('python3', [path.join(directory, 'report.py')]);
  }
}
