/**
 * Fetch modern country assets (flags, coat of arms, stats) from mledoze/countries
 * and map them to Wikipedia page names used by the polity GeoJSON data.
 *
 * Data source: https://github.com/mledoze/countries (open source, ~250 countries)
 * Flag images:  https://flagcdn.com (free CDN, uses ISO cca2 codes)
 *
 * Produces public/ne/polity_assets.json — a lookup keyed by Wikipedia page name
 * containing flag URLs, coat of arms URLs, capital, area, currencies, languages, etc.
 *
 * Usage:  node scripts/fetch_country_assets.cjs
 */

const fs = require('fs');
const path = require('path');

const POLITIES_DIR = 'public/ne/polities';
const OUTPUT_FILE = 'public/ne/polity_assets.json';
const MLEDOZE_URL = 'https://cdn.jsdelivr.net/npm/world-countries@5.0.0/dist/countries.json';

// ── Manual aliases: Wikipedia page name → mledoze name.common ──
const WIKI_TO_COMMON = {
  "People's Republic of China": 'China',
  'Republic of China (1912-1949)': 'Taiwan',
  'South Korea': 'South Korea',
  'North Korea': 'North Korea',
  'Russian Federation': 'Russia',
  'Vatican City': 'Vatican City',
  'Czech Republic': 'Czechia',
  'Slovak Republic': 'Slovakia',
  'East Germany': 'Germany',
  'West Germany': 'Germany',
  'Union of Soviet Socialist Republics': 'Russia',
  Yugoslavia: 'Serbia',
  Czechoslovakia: 'Czechia',
  Burma: 'Myanmar',
  'Ivory Coast': 'Ivory Coast',
  'Cabo Verde': 'Cape Verde',
  'Timor-Leste': 'Timor-Leste',
  'São Tomé and Príncipe': 'Sao Tome and Principe',
  Eswatini: 'Eswatini',
  'Kingdom of eSwatini': 'Eswatini',
  // GeoJSON uses these Wikipedia page names instead of the common name:
  'French Fifth Republic': 'France',
  'Great Britain': 'United Kingdom',
  'History of Austria': 'Austria',
  'Third Hellenic Republic': 'Greece',
  Éire: 'Ireland',
  Irag: 'Iran',                     // typo in GeoJSON for Iran
  'The Bahamas': 'Bahamas',
  'The Gambia': 'Gambia',
  'East Timor': 'Timor-Leste',
  'Democratic Republic of the Congo': 'DR Congo',
  'Republic of the Congo': 'Republic of the Congo',
  'Northern Cyprus': 'Cyprus',
  Kosovo: 'Kosovo',
  'Serbia and Montenegro': 'Serbia',
  'Netherlands Antilles': 'Netherlands',
  'Bruneian Sultanate (1368-1888)': 'Brunei',
  'Mali Federation': 'Mali',
  'United Arab Republic': 'Egypt',
  Chechnya: 'Russia',
  'Russian-occupied territories': 'Russia',
  'History of Libya under Muammar Gaddafi': 'Libya',
  Micronesia: 'Micronesia',
  'Hong Kong': 'Hong Kong',
  Macau: 'Macau',
  'Puerto Rico': 'Puerto Rico',
};

// Extra aliases: name → mledoze common name (for broader matching)
const EXTRA_ALIASES = {
  'United States of America': 'United States',
  'Czech Republic': 'Czechia',
  'Republic of Ireland': 'Ireland',
  'Republic of Korea': 'South Korea',
  "Democratic People's Republic of Korea": 'North Korea',
  'DPRK': 'North Korea',
  'Syrian Arab Republic': 'Syria',
  'Federal Republic of Germany': 'Germany',
  'Islamic Republic of Iran': 'Iran',
  'Islamic Republic of Afghanistan': 'Afghanistan',
  'State of Israel': 'Israel',
  'Kingdom of Saudi Arabia': 'Saudi Arabia',
  'Hashemite Kingdom of Jordan': 'Jordan',
  'Republic of Turkey': 'Turkey',
  'Republic of Iraq': 'Iraq',
  'Republic of Yemen': 'Yemen',
  'Socialist Republic of Vietnam': 'Vietnam',
  'Lao People\'s Democratic Republic': 'Laos',
  'People\'s Republic of Bangladesh': 'Bangladesh',
  'Kingdom of Thailand': 'Thailand',
  'Republic of the Union of Myanmar': 'Myanmar',
  'Federated States of Micronesia': 'Micronesia',
  'Hong Kong SAR': 'Hong Kong',
  'Macao SAR': 'Macau',
};

// ── Helpers ──

function normalize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ── Main ──

async function main() {
  // Step 1: collect unique Wikipedia page names from GeoJSON
  console.log('Step 1: collecting Wikipedia page names from polity GeoJSON...');
  const wikiNames = new Set();
  const files = fs.readdirSync(POLITIES_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(POLITIES_DIR, file), 'utf-8'));
    if (!data.features) continue;
    for (const f of data.features) {
      const wiki = f.properties?.Wikipedia;
      if (wiki) wikiNames.add(wiki);
    }
  }
  console.log(`  → ${wikiNames.size} unique Wikipedia page names`);

  // Step 2: fetch mledoze/countries
  console.log('Step 2: fetching mledoze/countries dataset...');
  const countries = await fetchJSON(MLEDOZE_URL);
  console.log(`  → ${countries.length} countries fetched`);

  // Step 3: build name index
  console.log('Step 3: building name index...');
  const nameIndex = new Map();  // normalized name → flat entry
  const rawIndex = new Map();   // raw name.common → flat entry

  for (const c of countries) {
    const common = c.name?.common;
    if (!common) continue;

    const flat = {
      flag: c.cca2 ? `https://flagcdn.com/w320/${c.cca2.toLowerCase()}.png` : null,
      flagSvg: c.cca2 ? `https://flagcdn.com/${c.cca2.toLowerCase()}.svg` : null,
      shield: null,
      shieldSvg: null,
      capital: c.capital?.[0] || null,
      population: null,  // mledoze doesn't include population
      area: c.area ?? null,
      currencies: null,
      languages: null,
      cca2: c.cca2 || null,
      cca3: c.cca3 || null,
      nameOfficial: c.name?.official || null,
      nameZh: c.translations?.zho?.common || null,
      continent: c.region || null,
      subregion: c.subregion || null,
      source: 'mledoze',
    };

    if (c.currencies) {
      flat.currencies = Object.values(c.currencies).map((cur) => {
        return cur.name ? `${cur.name} (${cur.symbol || ''})`.replace(/\s*\(\s*\)/, '').trim() : '';
      }).filter(Boolean);
    }
    if (c.languages) {
      flat.languages = Object.values(c.languages).filter(Boolean);
    }

    nameIndex.set(normalize(common), flat);
    rawIndex.set(common, flat);
    if (c.name?.official && c.name.official !== common) {
      nameIndex.set(normalize(c.name.official), flat);
    }
    // also index alt spellings
    if (c.altSpellings) {
      for (const alt of c.altSpellings) {
        if (alt.length > 2) nameIndex.set(normalize(alt), flat);
      }
    }
  }

  // Add extra aliases
  for (const [alias, target] of Object.entries(EXTRA_ALIASES)) {
    const data = rawIndex.get(target);
    if (data) nameIndex.set(normalize(alias), data);
  }

  console.log(`  → ${nameIndex.size} name entries in index (incl. alt spellings)`);

  // Step 4: match
  console.log('Step 4: matching Wikipedia names to country data...');
  const output = {};
  let matched = 0;
  const unmatchedModern = [];

  for (const wiki of wikiNames) {
    // Direct normalized match
    let data = nameIndex.get(normalize(wiki));

    // Alias table
    if (!data && WIKI_TO_COMMON[wiki]) {
      data = rawIndex.get(WIKI_TO_COMMON[wiki]);
    }

    if (data) {
      output[wiki] = data;
      matched++;
    } else {
      // Collect short-named unmatched (likely modern)
      if (wiki.length < 50) unmatchedModern.push(wiki);
    }
  }

  console.log(`  → ${matched} matched, ${wikiNames.size - matched} unmatched`);

  // Print unmatched that look like modern countries
  const modernUnmatched = unmatchedModern
    .filter((n) => !/^[A-Z][a-z]+ (dynasty|Empire|Kingdom|of |Dark|period|culture|civilization|Caliphate|Khaganate|Sultanate|Republic|Confederacy|Union)/.test(n) && n.length < 30)
    .sort();
  if (modernUnmatched.length > 0 && modernUnmatched.length <= 80) {
    console.log('\n  Potentially unmatched modern countries:');
    for (const name of modernUnmatched) {
      console.log(`    - ${name}`);
    }
  }

  // Step 5: write
  console.log('\nStep 5: writing output...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`  → ${OUTPUT_FILE} (${(stats.size / 1024).toFixed(1)} KB, ${Object.keys(output).length} entries)`);
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
