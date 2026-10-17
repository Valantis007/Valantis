'use strict';

// Ενδεικτικές φωτογραφίες αυτοκινήτων από τη Wikipedia / Wikimedia Commons, με ελεύθερη άδεια
// (CC BY, CC BY-SA, CC0, κοινό κτήμα) και αναφορά δημιουργού. Για να φαίνεται η ιστοσελίδα όπως
// θα είναι· πριν το άνοιγμα αντικαθίστανται με φωτογραφίες των δικών σας αυτοκινήτων.

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');

// Αλλάζουν μόνο στα tests (τοπικός ψεύτικος server).
const wikiApi = () => process.env.DEMO_PHOTOS_WIKI_API || 'https://en.wikipedia.org/w/api.php';
const commonsApi = () => process.env.DEMO_PHOTOS_COMMONS_API || 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = `CarRentalDemoPhotos/1.0 (${config.company.email || 'local test'})`;
const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_BYTES = 5 * 1024 * 1024;
const FREE_LICENSE = /^(cc0|cc[ -]by(-sa)?( \d(\.\d)?)?|public domain|pd)\b/i;

// Άρθρα της Wikipedia για τα ενδεικτικά αυτοκίνητα (η πρώτη φωτογραφία του άρθρου είναι συνήθως
// η τρέχουσα γενιά, από μπροστά-πλάγια). Για άλλα αυτοκίνητα γίνεται αναζήτηση με μάρκα και μοντέλο.
const ARTICLES = {
  'fiat panda': ['Fiat Panda'],
  'toyota aygo x': ['Toyota Aygo X'],
  'hyundai i20': ['Hyundai i20'],
  'volkswagen polo': ['Volkswagen Polo Mk6', 'Volkswagen Polo'],
  'toyota corolla hybrid': ['Toyota Corolla (E210)', 'Toyota Corolla'],
  'peugeot 308 sw': ['Peugeot 308'],
  'nissan qashqai': ['Nissan Qashqai'],
  'dacia duster 4x4': ['Dacia Duster'],
  'citroën spacetourer': ['Citroën SpaceTourer', 'Citroën Jumpy'],
  'mercedes-benz c 200': ['Mercedes-Benz C-Class (W206)', 'Mercedes-Benz C-Class'],
  'mini cooper cabrio': ['Mini Convertible', 'Mini Hatch'],
};

async function api(base, params) {
  const url = `${base}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function candidates(car) {
  const name = `${car.make} ${car.model}`;
  const known = ARTICLES[name.toLowerCase()];
  if (known) return known;
  const simple = car.model.replace(/\b(hybrid|plug-in|sw|sport ?wagon|estate|4x4|4wd|awd|cabrio(let)?|convertible|automatic|auto)\b/gi, '').trim();
  return [...new Set([name, `${car.make} ${simple}`.trim()])];
}

// Όνομα αρχείου της κύριας φωτογραφίας του άρθρου (ή null).
async function pageImage(title) {
  const data = await api(wikiApi(), { action: 'query', redirects: '1', prop: 'pageimages', piprop: 'name', titles: title });
  const page = (data.query && data.query.pages || [])[0];
  return page && !page.missing && page.pageimage ? page.pageimage : null;
}

async function searchImage(car) {
  const data = await api(wikiApi(), {
    action: 'query', generator: 'search', gsrsearch: `${car.make} ${car.model} car`, gsrlimit: '3', prop: 'pageimages', piprop: 'name',
  });
  const pages = (data.query && data.query.pages || []).slice().sort((a, b) => a.index - b.index);
  const hit = pages.find((p) => p.pageimage && !/\.svg$/i.test(p.pageimage));
  return hit ? hit.pageimage : null;
}

const plain = (html) => String(html || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Στοιχεία αρχείου από το Commons: μόνο ελεύθερες άδειες (τα «μη ελεύθερα» αρχεία της Wikipedia δεν είναι στο Commons).
async function commonsFile(name) {
  const data = await api(commonsApi(), {
    action: 'query', titles: `File:${name}`, prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '960',
    iiextmetadatafilter: 'Artist|LicenseShortName',
  });
  const page = (data.query && data.query.pages || [])[0];
  const info = page && !page.missing && page.imageinfo && page.imageinfo[0];
  if (!info || !TYPES[info.mime]) return null;
  const meta = info.extmetadata || {};
  const license = plain(meta.LicenseShortName && meta.LicenseShortName.value);
  if (!FREE_LICENSE.test(license)) return null;
  const artist = plain(meta.Artist && meta.Artist.value).slice(0, 100) || 'Wikimedia Commons';
  return {
    url: info.thumburl || info.url,
    mime: info.mime,
    source: info.descriptionurl,
    credit: `${artist} · ${license} · Wikimedia Commons`,
  };
}

async function findPhoto(car) {
  for (const title of candidates(car)) {
    const name = await pageImage(title);
    if (name && !/\.svg$/i.test(name)) {
      const file = await commonsFile(name);
      if (file) return file;
    }
  }
  const name = await searchImage(car);
  return name ? commonsFile(name) : null;
}

async function download(file, uploadDir) {
  const res = await fetch(file.url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim();
  if (!TYPES[type]) throw new Error(`μη αναμενόμενος τύπος αρχείου (${type || 'άγνωστος'})`);
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_BYTES) throw new Error('πολύ μεγάλο αρχείο');
  const filename = `${crypto.randomBytes(12).toString('hex')}${TYPES[type]}`;
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, filename), body);
  return `/uploads/${filename}`;
}

/**
 * Βάζει φωτογραφία σε κάθε αυτοκίνητο που έχει ακόμα το γενικό σχέδιο (/img/cars/*.svg).
 * Δεν αγγίζει φωτογραφίες που ανέβασε ο διαχειριστής.
 * Επιστρέφει { added: [ονόματα], failed: [{ car, reason }] }.
 */
async function addDemoPhotos(db, uploadDir) {
  const cars = db.prepare("SELECT id, make, model, image FROM cars WHERE image IS NULL OR image LIKE '/img/cars/%' ORDER BY id").all();
  const added = [];
  const failed = [];
  for (const car of cars) {
    const label = `${car.make} ${car.model}`;
    try {
      const file = await findPhoto(car);
      if (!file) {
        failed.push({ car: label, reason: 'δεν βρέθηκε φωτογραφία με ελεύθερη άδεια' });
        continue;
      }
      const image = await download(file, uploadDir);
      db.prepare('UPDATE cars SET image = ?, image_credit = ?, image_source = ? WHERE id = ?').run(image, file.credit, file.source, car.id);
      added.push(label);
    } catch (err) {
      let reason = err.message;
      if (err.name === 'TimeoutError') reason = 'λήξη χρόνου σύνδεσης';
      else if (err.message === 'fetch failed') reason = 'δεν υπάρχει σύνδεση με τη Wikipedia (ελέγξτε το internet)';
      failed.push({ car: label, reason });
    }
  }
  return { added, failed, considered: cars.length };
}

module.exports = { addDemoPhotos, findPhoto, candidates };
