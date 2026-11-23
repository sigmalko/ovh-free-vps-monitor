// Klient publicznego API OVHcloud (bez uwierzytelniania).
//  - GET /order/catalog/public/vps?ovhSubsidiary=XX      — lista planów VPS + ceny
//  - GET /vps/order/rule/datacenter?ovhSubsidiary=XX&planCode=YY — dostępność per datacenter

const API = 'https://eu.api.ovh.com/1.0';

async function getJson(path, { retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(API + path, {
        headers: { accept: 'application/json', 'user-agent': 'ovh-free-vps-monitor' },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return await res.json();
      // 4xx (poza 429) to błąd zapytania — ponawianie nic nie da.
      if (res.status < 500 && res.status !== 429) {
        const body = await res.text();
        const err = new Error(`OVH API ${res.status} dla ${path}: ${body.slice(0, 200)}`);
        err.fatal = true;
        throw err;
      }
      lastError = new Error(`OVH API ${res.status} dla ${path}`);
    } catch (err) {
      if (err.fatal) throw err;
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw lastError;
}

// Plany z sufiksami degressivity/percent to warianty cenowe tego samego planu — pomijamy.
const VARIANT_RE = /degressivity|percent/;

// Domyślnie tylko plany z publicznej oferty OVH ("VPS-1…6" w liniach 2025/2027, także Local Zone),
// bo starsze/ukryte plany (Value, Essential, Comfort, Elite, Level…) są w API "available",
// ale nie ma ich na stronie zamówień.
export const DEFAULT_PLAN_PATTERN = '^vps-\\d{4}-model\\d+(\\.LZ)?$';

export async function fetchPlans(subsidiary, planPattern = DEFAULT_PLAN_PATTERN) {
  const wanted = new RegExp(planPattern);
  const catalog = await getJson(`/order/catalog/public/vps?ovhSubsidiary=${encodeURIComponent(subsidiary)}`);
  return catalog.plans
    .filter((p) => !VARIANT_RE.test(p.planCode) && wanted.test(p.planCode))
    .map((p) => ({
      planCode: p.planCode,
      name: p.invoiceName,
      monthlyPrice: monthlyPrice(p),
    }));
}

function monthlyPrice(plan) {
  const renew = plan.pricings?.find(
    (pr) => pr.capacities?.includes('renew') && pr.intervalUnit === 'month' && pr.commitment === 0,
  );
  return renew?.formattedPrice ?? null;
}

export async function fetchDatacenters(subsidiary, planCode) {
  const data = await getJson(
    `/vps/order/rule/datacenter?ovhSubsidiary=${encodeURIComponent(subsidiary)}&planCode=${encodeURIComponent(planCode)}`,
  );
  return data.datacenters;
}

// Prosta pula współbieżności, żeby nie bombardować API ~70 równoległymi zapytaniami.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
