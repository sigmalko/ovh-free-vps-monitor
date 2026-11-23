// Tworzenie issue na GitHubie (REST API, bez zależności). Wymaga tokenu z uprawnieniem do issues.

import { describePlan } from './availability.mjs';

export const LABEL = 'ovh-vps-monitor';
const MARKER_PREFIX = '<!-- ovh-vps-monitor:dc=';

const flag = (country) =>
  country.length === 2
    ? String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '';

export function markerFor(datacenter) {
  return `${MARKER_PREFIX}${datacenter} -->`;
}

export function buildIssue(group, { subsidiary, now = new Date() }) {
  const isPl = group.country === 'PL';
  const title = `${isPl ? '🇵🇱 ' : ''}Dostępny VPS OVHcloud: ${group.city} [${group.datacenter}, ${group.country}] — ${group.offers.length} plan(ów)`;

  const rows = group.offers
    .sort((a, b) => a.planCode.localeCompare(b.planCode))
    .map((o) => {
      const { specs, model } = describePlan({ planCode: o.planCode, name: o.planName });
      const delivery = o.daysBeforeDelivery > 0 ? `${o.daysBeforeDelivery} dni` : 'od ręki';
      return `| \`${o.planCode}\` | ${model} | ${specs ?? '—'} | ${o.monthlyPrice ?? '—'} | ${delivery} |`;
    });

  const body = [
    `${flag(group.country)} **Lokalizacja:** ${group.city} (datacenter \`${group.datacenter}\`, kraj: ${group.country})`,
    '',
    `Serwery VPS możliwe w tej chwili do zamówienia (system: Linux):`,
    '',
    '| Kod planu | Model | Parametry | Cena netto / mies. | Dostawa |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    `Zamów: https://www.ovhcloud.com/pl/vps/ (wybierz lokalizację **${group.city}** w konfiguratorze).`,
    '',
    `<sub>Wykryto: ${now.toISOString()} · subsydiariusz OVH: ${subsidiary} · zamknij to issue, aby ponownie uzbroić powiadomienie dla tej lokalizacji.</sub>`,
    markerFor(group.datacenter),
  ].join('\n');

  return { title, body, labels: isPl ? [LABEL, 'poland'] : [LABEL] };
}

export class GitHub {
  constructor({ token, repo }) {
    this.token = token;
    this.repo = repo;
  }

  async #request(method, path, body) {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'ovh-free-vps-monitor',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json();
  }

  /** Zbiór datacenter, dla których jest już otwarte issue (wg znacznika w treści). */
  async openDatacenters() {
    const found = new Set();
    for (let page = 1; page <= 10; page++) {
      const issues = await this.#request(
        'GET',
        `/repos/${this.repo}/issues?state=open&labels=${LABEL}&per_page=100&page=${page}`,
      );
      for (const issue of issues) {
        if (issue.pull_request) continue;
        const m = new RegExp(`${MARKER_PREFIX}(\\S+) -->`).exec(issue.body ?? '');
        if (m) found.add(m[1]);
      }
      if (issues.length < 100) break;
    }
    return found;
  }

  createIssue({ title, body, labels }) {
    return this.#request('POST', `/repos/${this.repo}/issues`, { title, body, labels });
  }
}
