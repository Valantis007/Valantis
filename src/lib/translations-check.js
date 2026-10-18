'use strict';

// Περιεχόμενο που γράφει το γραφείο και βλέπει ο πελάτης (αυτοκίνητα, πρόσθετα, σημεία): ποια
// ενεργά στοιχεία δεν έχουν μετάφραση στα αγγλικά ή στα ισπανικά. Εμφανίζεται στη διαχείριση
// («Μεταφράσεις που λείπουν» στον Έλεγχο συστήματος και ένδειξη στις λίστες).

const i18n = require('./i18n');
const mileage = require('./mileage');

const LANGS = ['en', 'es'];
const LANG_NAMES = { en: 'αγγλικά', es: 'ισπανικά' };

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

function missingLangs(row, field) {
  if (!filled(row[field])) return [];
  return LANGS.filter((l) => !filled(row[`${field}_${l}`]));
}

/**
 * @returns {Array<{ type: 'car'|'extra'|'location', id: number, title: string, field: string,
 *   text: string, langs: string[], href: string }>}
 */
function missingTranslations(db) {
  const items = [];
  const add = (type, row, title, field, text, langs, href) => {
    if (langs.length) items.push({ type, id: row.id, title, field, text: String(text), langs, langNames: langs.map((l) => LANG_NAMES[l]), href });
  };
  for (const car of db.prepare('SELECT * FROM cars WHERE active = 1 ORDER BY make, model, id').all()) {
    const title = `${car.make} ${car.model} (${car.plate})`;
    add('car', car, title, 'Περιγραφή', car.description, missingLangs(car, 'description'), `/admin/cars/${car.id}`);
    // Παλιό ελεύθερο κείμενο χιλιομέτρων: μεταφράζεται μόνο αν υπάρχει στο λεξικό.
    const m = mileage.of(car);
    if (m.custom) {
      const langs = LANGS.filter((l) => i18n.dictionaries[l][m.custom] === undefined);
      add('car', car, title, 'Χιλιόμετρα', m.custom, langs, `/admin/cars/${car.id}#mileage`);
    }
  }
  for (const x of db.prepare('SELECT * FROM extras WHERE active = 1 ORDER BY sort_order, id').all()) {
    add('extra', x, x.name, 'Όνομα', x.name, missingLangs(x, 'name'), `/admin/extras#extra-${x.id}`);
    add('extra', x, x.name, 'Περιγραφή', x.description, missingLangs(x, 'description'), `/admin/extras#extra-${x.id}`);
  }
  for (const l of db.prepare('SELECT * FROM locations WHERE active = 1 ORDER BY sort_order, id').all()) {
    add('location', l, l.name, 'Όνομα', l.name, missingLangs(l, 'name'), `/admin/locations#location-${l.id}`);
    add('location', l, l.name, 'Διεύθυνση', l.address, missingLangs(l, 'address'), `/admin/locations#location-${l.id}`);
    add('location', l, l.name, 'Οδηγίες παραλαβής', l.instructions, missingLangs(l, 'instructions'), `/admin/locations#location-${l.id}`);
    add('location', l, l.name, 'Οδηγίες επιστροφής', l.return_instructions, missingLangs(l, 'return_instructions'), `/admin/locations#location-${l.id}`);
  }
  return items;
}

// id → λίστα πεδίων χωρίς μετάφραση, για ένα είδος (για την ένδειξη στις λίστες).
function byRow(items, type) {
  const map = {};
  for (const item of items.filter((i) => i.type === type)) (map[item.id] = map[item.id] || []).push(item.field);
  return map;
}

module.exports = { missingTranslations, byRow, LANG_NAMES };
