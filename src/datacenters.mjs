// Mapowanie datacenter OVHcloud (pole `datacenter` z API) na kraj i czytelną nazwę.
// Źródło nazw: odpowiedzi /vps/order/rule/datacenter. Nieznane kody są pomijane (z ostrzeżeniem w logu).

export const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

export const DATACENTERS = {
  WAW: { country: 'PL', city: 'Warszawa' },
  DE: { country: 'DE', city: 'Niemcy (Limburg)' },
  GRA: { country: 'FR', city: 'Gravelines' },
  SBG: { country: 'FR', city: 'Strasburg' },
  'EU-WEST-RBX': { country: 'FR', city: 'Roubaix' },
  'EU-SOUTH-MIL': { country: 'IT', city: 'Mediolan' },
  'EU-CENTRAL-LZ-PRG': { country: 'CZ', city: 'Praga (Local Zone)' },
  'EU-CENTRAL-LZ-SOF': { country: 'BG', city: 'Sofia (Local Zone)' },
  'EU-SOUTH-LZ-MAD': { country: 'ES', city: 'Madryt (Local Zone)' },
  'EU-WEST-LZ-AMS': { country: 'NL', city: 'Amsterdam (Local Zone)' },
  'EU-WEST-LZ-BRU': { country: 'BE', city: 'Bruksela (Local Zone)' },
  'EU-WEST-LZ-MRS': { country: 'FR', city: 'Marsylia (Local Zone)' },
  'EU-WEST-LZ-VIE': { country: 'AT', city: 'Wiedeń (Local Zone)' },
  'EU-NORTH-LZ-STO': { country: 'SE', city: 'Sztokholm (Local Zone)' },
  // Poza UE — wpisane jawnie, żeby nie generowały ostrzeżeń o nieznanym kodzie.
  UK: { country: 'GB', city: 'Wielka Brytania (Erith)' },
  'EU-WEST-LZ-ZRH': { country: 'CH', city: 'Zurych (Local Zone)' },
  BHS: { country: 'CA', city: 'Beauharnois' },
  SGP: { country: 'SG', city: 'Singapur' },
  SYD: { country: 'AU', city: 'Sydney' },
  YNM: { country: 'IN', city: 'Mumbaj' },
};

export function describeDatacenter(code) {
  return DATACENTERS[code] ?? null;
}

export function isEu(country) {
  return EU_COUNTRIES.has(country);
}
