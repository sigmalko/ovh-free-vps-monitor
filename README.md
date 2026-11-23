# ovh-free-vps-monitor

Monitor dostępności serwerów **VPS OVHcloud** w krajach Unii Europejskiej (ze szczególnym uwzględnieniem
**Warszawy**). Gdy w którejś lokalizacji można zamówić VPS, aplikacja tworzy **issue na GitHubie** z informacją,
gdzie i jaki typ VPS jest dostępny (kod planu, parametry, cena).

Aplikacja działa w kontenerze Dockera, a sprawdzanie uruchamia **cron** według harmonogramu zdefiniowanego
w `docker-compose.yml`.

## Jak to działa

- Korzysta z **publicznego API OVHcloud** (`/order/catalog/public/vps` oraz `/vps/order/rule/datacenter`).
  Te endpointy **nie wymagają uwierzytelniania** — nie potrzebujesz kluczy API OVH
  (`Application Key`, `Application Secret`, `Consumer Key` nie są używane).
- Dla każdego planu VPS sprawdza status w każdym datacenter (np. `WAW` = Warszawa) i bierze pod uwagę
  tylko oferty dostępne dla Linuksa.
- Dla każdej lokalizacji z dostępnym VPS tworzy **jedno issue** (Polska ma etykietę `poland` i emoji 🇵🇱).
- **Deduplikacja:** jeśli dla danej lokalizacji istnieje już *otwarte* issue, nowe nie powstaje.
  Zamknij issue, aby ponownie uzbroić powiadomienie dla tej lokalizacji.

## Konfiguracja — co trzeba zdefiniować

### Sekret (jedyny wymagany)

| Nazwa sekretu | Gdzie | Opis |
|---|---|---|
| `github_token` | plik na hoście, montowany jako Docker secret w `/run/secrets/github_token` | Token GitHub z prawem tworzenia issue w tym repozytorium |

Zalecany token: **fine-grained personal access token** ograniczony do jednego repozytorium
(`sigmalko/ovh-free-vps-monitor`) z uprawnieniem **Issues: Read and write** (nic więcej).
Utworzysz go w: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.

Token **nie jest** wpisywany do `.env`, do `docker-compose.yml` ani do repozytorium — leży w pliku na hoście
poza kodem. Katalog `secrets/` i plik `.env` są w `.gitignore`.

### Zmienne (opcjonalne, mają wartości domyślne)

Ustawiasz je w pliku `.env` obok `docker-compose.yml` (wzór: `.env.example`) albo bezpośrednio w `docker-compose.yml`.

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `CRON_SCHEDULE` | `*/10 * * * *` | Harmonogram crona (5 pól: minuta godzina dzień miesiąc dzień_tygodnia) |
| `TZ` | `Europe/Warsaw` | Strefa czasowa dla crona i logów |
| `RUN_ON_START` | `true` | Wykonaj sprawdzenie od razu po starcie kontenera |
| `GITHUB_REPOSITORY` | `sigmalko/ovh-free-vps-monitor` | Repozytorium (`owner/repo`), w którym powstają issue |
| `COUNTRIES` | *(puste = cała UE)* | Kody krajów (ISO) do powiadomień, np. `PL` albo `PL,DE,CZ` |
| `OVH_SUBSIDIARY` | `PL` | Subsydiariusz OVH (wpływa na katalog planów i ceny) |
| `GITHUB_TOKEN_FILE_HOST` | `./secrets/github_token` | Ścieżka do pliku z tokenem **na hoście** |

## Uruchomienie na Windowsie (Docker Desktop)

Wymagania: Docker Desktop (z Docker Compose v2), uruchomiony.

1. Sklonuj repozytorium i wejdź do katalogu (PowerShell):

   ```powershell
   git clone https://github.com/sigmalko/ovh-free-vps-monitor.git
   cd ovh-free-vps-monitor
   ```

2. Zapisz token GitHub do pliku-sekretu (bez końcowego znaku nowej linii):

   ```powershell
   New-Item -ItemType Directory -Force secrets | Out-Null
   Set-Content -Path secrets\github_token -Value "TUTAJ_WKLEJ_TOKEN" -NoNewline
   ```

   Plik możesz też trzymać poza repozytorium, np. `C:\ProgramData\ovh-monitor\github_token`, i wskazać go w `.env`:

   ```
   GITHUB_TOKEN_FILE_HOST=C:/ProgramData/ovh-monitor/github_token
   ```

   (W Docker Desktop ścieżka musi leżeć na dysku udostępnionym kontenerom — domyślnie `C:`; używaj ukośników `/`.)

3. (Opcjonalnie) skopiuj i dostosuj konfigurację:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

4. Zbuduj i uruchom w tle:

   ```powershell
   docker compose up -d --build
   ```

5. Podgląd logów (pierwsze sprawdzenie wykona się od razu, kolejne wg `CRON_SCHEDULE`):

   ```powershell
   docker compose logs -f
   ```

Przydatne polecenia:

```powershell
docker compose ps                      # status kontenera
docker compose exec monitor /usr/local/bin/run-monitor.sh   # wymuś sprawdzenie teraz
docker compose down                    # zatrzymaj i usuń kontener
```

Zmiana harmonogramu: edytuj `CRON_SCHEDULE` w `.env` (lub w `docker-compose.yml`) i wykonaj `docker compose up -d`.

## Uruchomienie na Linuksie

Tak samo, tylko w bashu:

```bash
git clone https://github.com/sigmalko/ovh-free-vps-monitor.git && cd ovh-free-vps-monitor
mkdir -p secrets && printf '%s' 'TUTAJ_WKLEJ_TOKEN' > secrets/github_token && chmod 600 secrets/github_token
docker compose up -d --build
docker compose logs -f
```

Dla serwera możesz trzymać sekret poza katalogiem projektu, np. `/etc/ovh-monitor/github_token`
i ustawić `GITHUB_TOKEN_FILE_HOST=/etc/ovh-monitor/github_token` w `.env`.

## Uruchomienie bez Dockera (do testów)

Wymagany Node.js ≥ 20, zero zależności.

```bash
node src/index.mjs --dry-run              # tylko pokaż, co by zgłoszono (nic nie tworzy)
node src/index.mjs --dry-run --poland-only
GITHUB_TOKEN=... node src/index.mjs        # prawdziwe issue (repo z remote origin)
npm test                                   # testy jednostkowe
```

## Uwagi

- Lokalizacje spoza UE (np. Wielka Brytania, Kanada, Singapur) są ignorowane. Nieznany datacenter z API jest
  pomijany z ostrzeżeniem w logu — dopisz go w `src/datacenters.mjs`.
- Dostępność w API to stan chwilowy; „dostępny” oznacza, że konfigurator OVH pozwala w tej chwili zamówić dany plan.
- Kontener działa jako root, żeby `crond` mógł bez problemów odczytać sekret niezależnie od uprawnień pliku na hoście.
