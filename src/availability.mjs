import { describeDatacenter, isEu } from './datacenters.mjs';
import { fetchDatacenters, fetchPlans, mapLimit } from './ovh.mjs';

// "vps-value-1-2-40-vps-2025-model1" -> { line: 'Value', vcores: 1, ramGb: 2, diskGb: 40 }
const SPEC_RE = /^vps-([a-z]+)-(\d+)-(\d+)-(\d+)/;

export function parseSpecs(planCode) {
  const m = SPEC_RE.exec(planCode);
  if (!m) return null;
  const line = m[1] === 'le' ? 'Level' : m[1][0].toUpperCase() + m[1].slice(1);
  return { line, vcores: Number(m[2]), ramGb: Number(m[3]), diskGb: Number(m[4]) };
}

export function describePlan(plan) {
  const s = parseSpecs(plan.planCode);
  const specs = s ? `${s.line}: ${s.vcores} vCore, ${s.ramGb} GB RAM, ${s.diskGb} GB` : null;
  return { specs, model: plan.name };
}

/**
 * Zamienia odpowiedź API na listę dostępnych ofert (Linux = domyślny system VPS).
 * @returns {{planCode, planName, monthlyPrice, datacenter, country, city, eu, daysBeforeDelivery}[]}
 */
export function extractAvailable(plan, datacenters, warn = () => {}) {
  const out = [];
  for (const dc of datacenters) {
    if (dc.status !== 'available' || dc.linuxStatus !== 'available') continue;
    const info = describeDatacenter(dc.datacenter);
    if (!info) {
      warn(`Nieznany datacenter "${dc.datacenter}" (${dc.code}) — pomijam. Dodaj go do src/datacenters.mjs.`);
      continue;
    }
    out.push({
      planCode: plan.planCode,
      planName: plan.name,
      monthlyPrice: plan.monthlyPrice,
      datacenter: dc.datacenter,
      country: info.country,
      city: info.city,
      eu: isEu(info.country),
      daysBeforeDelivery: dc.daysBeforeDelivery ?? 0,
    });
  }
  return out;
}

/** Sprawdza wszystkie plany VPS i zwraca dostępne oferty (bez filtrowania po kraju). */
export async function checkAvailability({ subsidiary, concurrency = 6, log = () => {}, warn = () => {} }) {
  const plans = await fetchPlans(subsidiary);
  log(`Sprawdzam ${plans.length} planów VPS (subsydiariusz ${subsidiary})…`);
  const failures = [];
  const perPlan = await mapLimit(plans, concurrency, async (plan) => {
    try {
      return extractAvailable(plan, await fetchDatacenters(subsidiary, plan.planCode), warn);
    } catch (err) {
      failures.push(`${plan.planCode}: ${err.message}`);
      return [];
    }
  });
  if (failures.length === plans.length) {
    throw new Error(`Nie udało się sprawdzić żadnego planu. Pierwszy błąd: ${failures[0]}`);
  }
  failures.forEach((f) => warn(`Pominięto plan — ${f}`));
  return perPlan.flat();
}

/** Filtruje po kraju i grupuje per datacenter. Polska zawsze pierwsza. */
export function groupByDatacenter(offers, countries) {
  const allowed = new Set(countries);
  const groups = new Map();
  for (const o of offers) {
    if (!allowed.has(o.country)) continue;
    if (!groups.has(o.datacenter)) {
      groups.set(o.datacenter, { datacenter: o.datacenter, country: o.country, city: o.city, offers: [] });
    }
    groups.get(o.datacenter).offers.push(o);
  }
  return [...groups.values()].sort(
    (a, b) => (b.country === 'PL') - (a.country === 'PL') || a.datacenter.localeCompare(b.datacenter),
  );
}
