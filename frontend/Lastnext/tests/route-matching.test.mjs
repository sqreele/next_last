import assert from 'node:assert/strict';
import test from 'node:test';
import { isWithinRoute } from '../app/lib/security/route-matching.mjs';

test('protected pages and API endpoints include their nested routes', () => {
  for (const [pathname, route] of [
    ['/dashboard', '/dashboard'],
    ['/dashboard/', '/dashboard'],
    ['/dashboard/jobs/JOB-001/', '/dashboard'],
    ['/preventive-maintenance/PM-001/', '/preventive-maintenance'],
    ['/api/v1/jobs', '/api/v1/jobs'],
    ['/api/v1/jobs/JOB-001/', '/api/v1/jobs'],
  ]) assert.equal(isWithinRoute(pathname, route), true, pathname);
});

test('public marketing slugs do not inherit a similarly named private route', () => {
  for (const [pathname, route] of [
    ['/preventive-maintenance-hotel', '/preventive-maintenance'],
    ['/preventive-maintenance-hotel/', '/preventive-maintenance'],
    ['/dashboard-preview/', '/dashboard'],
    ['/api/v1/jobs-export/', '/api/v1/jobs'],
  ]) assert.equal(isWithinRoute(pathname, route), false, pathname);
});
