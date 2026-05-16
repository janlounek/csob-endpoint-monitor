/**
 * One-time CSOB starter seed.
 *
 * Idempotent: if the database already contains ANY clients or sites, this script
 * exits silently. Only used to populate a fresh, empty database with the original
 * CSOB sites + their checks so a brand-new install isn't completely blank.
 *
 * Anything beyond the initial bootstrap (new clients, new sites, edits, deletes)
 * should be done through the UI and will persist as long as the database itself
 * persists across deploys (i.e. you have a Railway Volume mounted and DB_PATH
 * pointing at a file on it).
 */
const { initDb, createSite, getAllSites, getDb, getClientBySlug, createClient } = require('./db/database');

initDb();

const db = getDb();
const existingClients = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
const existingSites = db.prepare('SELECT COUNT(*) AS c FROM sites').get().c;

if (existingClients > 0 || existingSites > 0) {
  console.log(`Seed skipped: database already has ${existingClients} client(s) and ${existingSites} site(s).`);
  process.exit(0);
}

console.log('Seed: empty database detected — populating with CSOB starter data...');

// Public-site defaults. Exponea is intentionally omitted — it isn't actively used
// on CSOB and was repeatedly being re-introduced on every redeploy.
const defaultChecks = [
  { type: 'meta_pixel', config: {} },
  { type: 'google_ads', config: {} },
  { type: 'adform', config: {} },
  { type: 'adobe_analytics', config: { trackingDomain: 'tracking-secure.csob.cz', reportingSuite: 'kbcnvcsobczprod' } },
  { type: 'adobe_launch', config: { customDomain: 'statistics.csob.cz' } },
  { type: 'onetrust', config: {} },
  { type: 'sklik', config: {} },
];

// Private zones: no marketing endpoints.
const privateChecks = [
  { type: 'adobe_analytics', config: { trackingDomain: 'tracking-secure.csob.cz', reportingSuite: 'kbcnvcsobczprod' } },
  { type: 'adobe_launch', config: { customDomain: 'statistics.csob.cz' } },
  { type: 'onetrust', config: {} },
];

const publicSites = [
  { name: 'CSOB.cz', url: 'https://www.csob.cz/' },
  { name: 'CSOB Penze', url: 'https://www.csob-penze.cz/' },
  { name: 'CSOB Stavebni', url: 'https://www.csobstavebni.cz/' },
  { name: 'CSOB Hypotecni', url: 'https://www.csobhypotecni.cz/' },
  { name: 'CSOB Leasing', url: 'https://www.csobleasing.cz/' },
  { name: 'CSOB Premium', url: 'https://www.csobpremium.cz/' },
  { name: 'CSOB Private Banking', url: 'https://www.csobpb.cz/' },
  { name: 'Platba Kartou CSOB', url: 'https://platbakartou.csob.cz/' },
  { name: 'CSOB Pojistovna', url: 'https://www.csobpoj.cz/' },
  { name: 'CSOB Asset Management', url: 'https://www.csobam.cz/' },
  { name: 'Pruvodce Podnikanim', url: 'https://www.pruvodcepodnikanim.cz/' },
];

const privateZones = [
  { name: 'CSOB Identita', url: 'https://identita.csob.cz/', parent: 'CSOB.cz' },
  { name: 'CSOB Online', url: 'https://online.csob.cz/odhlaseni', parent: 'CSOB.cz' },
  { name: 'CSOB CEB', url: 'https://ceb.csob.cz/web/public/odhlaseni', parent: 'CSOB.cz' },
  { name: 'CSOB Penze Online', url: 'https://online.csob-penze.cz/', parent: 'CSOB Penze' },
  { name: 'Moje CSOB Stavebni', url: 'https://moje.csobstavebni.cz/', parent: 'CSOB Stavebni' },
  { name: 'Hypotecni Zona', url: 'https://hypotecnizona.csobhypotecni.cz/', parent: 'CSOB Hypotecni' },
  { name: 'Moje CSOB Pojistovna', url: 'https://moje.csobpoj.cz/', parent: 'CSOB Pojistovna' },
];

let csobClient = getClientBySlug('csob');
if (!csobClient) {
  const id = createClient({ name: 'CSOB', slug: 'csob' });
  csobClient = { id };
  console.log(`Created 'CSOB' client (id=${id})`);
}

const parentIds = {};
for (const site of publicSites) {
  const id = createSite({ ...site, checks: defaultChecks, site_type: 'public', client_id: csobClient.id });
  parentIds[site.name] = id;
  console.log(`  Created: ${site.name} (ID: ${id})`);
}

for (const zone of privateZones) {
  const parentId = parentIds[zone.parent];
  const id = createSite({ name: zone.name, url: zone.url, checks: privateChecks, parent_id: parentId, site_type: 'private', client_id: csobClient.id });
  console.log(`  Created: ${zone.name} (ID: ${id}) -> ${zone.parent}`);
}

console.log(`Seed complete: ${publicSites.length} public + ${privateZones.length} private sites under CSOB.`);
