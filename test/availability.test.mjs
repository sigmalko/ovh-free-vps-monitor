import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAvailable, groupByDatacenter, parseSpecs } from '../src/availability.mjs';
import { buildIssue, markerFor } from '../src/github.mjs';

const plan = { planCode: 'vps-value-1-2-40-vps-2025-model1', name: 'VPS-1 2026', monthlyPrice: '26.00 zł' };
const dc = (datacenter, status, linuxStatus = status) => ({
  datacenter,
  code: datacenter.toLowerCase(),
  status,
  linuxStatus,
  daysBeforeDelivery: 0,
});

test('parseSpecs rozpoznaje parametry z kodu planu', () => {
  assert.deepEqual(parseSpecs('vps-value-1-2-40-vps-2025-model1'), { line: 'Value', vcores: 1, ramGb: 2, diskGb: 40 });
  assert.deepEqual(parseSpecs('vps-le-2-2-40'), { line: 'Level', vcores: 2, ramGb: 2, diskGb: 40 });
  assert.equal(parseSpecs('vps-2025-model1'), null);
});

test('extractAvailable bierze tylko dostępne dla Linuksa i oznacza UE', () => {
  const warnings = [];
  const out = extractAvailable(
    plan,
    [dc('WAW', 'available'), dc('GRA', 'out-of-stock'), dc('BHS', 'available', 'out-of-stock'), dc('UK', 'available'), dc('XXX', 'available')],
    (m) => warnings.push(m),
  );
  assert.deepEqual(out.map((o) => [o.datacenter, o.country, o.eu]), [['WAW', 'PL', true], ['UK', 'GB', false]]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /XXX/);
});

test('groupByDatacenter filtruje po kraju i stawia Polskę pierwszą', () => {
  const offers = [
    ...extractAvailable(plan, [dc('GRA', 'available'), dc('WAW', 'available'), dc('UK', 'available')]),
  ];
  const groups = groupByDatacenter(offers, ['PL', 'FR']);
  assert.deepEqual(groups.map((g) => g.datacenter), ['WAW', 'GRA']);
  assert.deepEqual(groupByDatacenter(offers, ['PL']).map((g) => g.datacenter), ['WAW']);
});

test('buildIssue zawiera lokalizację, typ serwera i znacznik do deduplikacji', () => {
  const [group] = groupByDatacenter(extractAvailable(plan, [dc('WAW', 'available')]), ['PL']);
  const issue = buildIssue(group, { subsidiary: 'PL', now: new Date('2026-01-01T00:00:00Z') });
  assert.match(issue.title, /Warszawa/);
  assert.ok(issue.labels.includes('poland'));
  assert.match(issue.body, /vps-value-1-2-40-vps-2025-model1/);
  assert.match(issue.body, /Value: 1 vCore, 2 GB RAM, 40 GB/);
  assert.ok(issue.body.includes(markerFor('WAW')));
});
