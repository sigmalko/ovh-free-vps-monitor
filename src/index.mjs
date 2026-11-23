#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkAvailability, groupByDatacenter } from './availability.mjs';
import { EU_COUNTRIES } from './datacenters.mjs';
import { buildIssue, GitHub } from './github.mjs';
import { DEFAULT_PLAN_PATTERN } from './ovh.mjs';

const HELP = `Użycie: node src/index.mjs [opcje]

Sprawdza dostępność VPS OVHcloud w UE i tworzy issue na GitHubie dla każdej
lokalizacji, w której można coś zamówić (Polska/Warszawa jest zawsze pierwsza).

Opcje:
  --countries <PL,DE,..>  kody krajów do powiadomień (domyślnie: wszystkie kraje UE; env COUNTRIES)
  --poland-only           skrót na --countries PL
  --subsidiary <XX>       subsydiariusz OVH, wpływa na katalog planów (domyślnie PL; env OVH_SUBSIDIARY)
  --plans <regex>         które plany sprawdzać (wyrażenie regularne na kodzie planu; env PLAN_PATTERN).
                          Domyślnie tylko oferta publiczna: ${DEFAULT_PLAN_PATTERN}
                          Wszystkie plany z katalogu: --plans '.*'
  --repo <owner/repo>    repozytorium na issue (domyślnie env GITHUB_REPOSITORY albo remote origin)
  --dry-run               nic nie tworzy, tylko wypisuje, co by zgłosiło
  --json                  wynik na stdout w JSON
  -h, --help              ta pomoc

Token GitHub (uprawnienie: Issues read/write), w kolejności sprawdzania:
  GITHUB_TOKEN_FILE  ścieżka do pliku z tokenem (Docker secret: /run/secrets/github_token)
  GITHUB_TOKEN / GH_TOKEN`;

const { values: opt } = parseArgs({
  options: {
    countries: { type: 'string' },
    'poland-only': { type: 'boolean' },
    subsidiary: { type: 'string' },
    plans: { type: 'string' },
    repo: { type: 'string' },
    'dry-run': { type: 'boolean' },
    json: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (opt.help) {
  console.log(HELP);
  process.exit(0);
}

const log = (...a) => console.error(...a);
const warn = (m) => console.error(`⚠ ${m}`);

function detectRepo() {
  if (opt.repo) return opt.repo;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const m = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
    if (m) return m[1];
  } catch {
    /* brak gita / remote */
  }
  throw new Error('Nie wiem, gdzie tworzyć issue. Podaj --repo owner/repo lub ustaw GITHUB_REPOSITORY.');
}

// Kolejność: plik sekretu (Docker secrets) → GITHUB_TOKEN → GH_TOKEN.
// trim() usuwa też końcowy \n oraz BOM, które potrafią dopisać edytory/PowerShell.
function readGithubToken() {
  const file = process.env.GITHUB_TOKEN_FILE;
  if (file) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch (err) {
      throw new Error(`Nie można odczytać pliku z tokenem (${file}): ${err.message}`);
    }
    return content.trim();
  }
  return (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN)?.trim();
}

async function main() {
  const subsidiary = (opt.subsidiary ?? process.env.OVH_SUBSIDIARY ?? 'PL').toUpperCase();
  const countries = opt['poland-only']
    ? ['PL']
    : (opt.countries ?? process.env.COUNTRIES ?? [...EU_COUNTRIES].join(','))
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);

  const planPattern = opt.plans ?? (process.env.PLAN_PATTERN || DEFAULT_PLAN_PATTERN);
  const offers = await checkAvailability({ subsidiary, planPattern, log, warn });
  const groups = groupByDatacenter(offers, countries);

  if (groups.length === 0) {
    log(`Brak dostępnych VPS w krajach: ${countries.join(', ')}.`);
    if (opt.json) console.log(JSON.stringify({ available: [] }));
    return;
  }

  log(`Dostępne VPS w ${groups.length} lokalizacji:`);
  for (const g of groups) log(`  • ${g.city} [${g.datacenter}, ${g.country}] — ${g.offers.length} plan(ów)`);

  const issues = groups.map((g) => ({ group: g, issue: buildIssue(g, { subsidiary }) }));

  if (opt.json) {
    console.log(JSON.stringify({ available: groups }, null, 2));
  }

  if (opt['dry-run']) {
    for (const { issue } of issues) {
      console.log(`\n=== [dry-run] ${issue.title}\nlabels: ${issue.labels.join(', ')}\n\n${issue.body}`);
    }
    return;
  }

  const token = readGithubToken();
  if (!token) {
    throw new Error(
      'Brak tokenu GitHub — ustaw GITHUB_TOKEN_FILE (np. /run/secrets/github_token), GITHUB_TOKEN lub GH_TOKEN.',
    );
  }
  const gh = new GitHub({ token, repo: detectRepo() });

  const alreadyOpen = await gh.openDatacenters();
  let created = 0;
  for (const { group, issue } of issues) {
    if (alreadyOpen.has(group.datacenter)) {
      log(`  – ${group.datacenter}: otwarte issue już istnieje, pomijam.`);
      continue;
    }
    const res = await gh.createIssue(issue);
    created++;
    log(`  ✔ ${group.datacenter}: utworzono issue #${res.number} ${res.html_url}`);
  }
  log(`Gotowe. Nowych issue: ${created}.`);
}

main().catch((err) => {
  console.error(`Błąd: ${err.message}`);
  process.exit(1);
});
