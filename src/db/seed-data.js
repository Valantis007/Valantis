'use strict';

// Αρχικά δεδομένα: ενδεικτικά σημεία, πρόσθετα, εποχές και στόλος.
// Αλλάξτε τα ελεύθερα από τον πίνακα διαχείρισης μετά την εγκατάσταση.

const { transaction } = require('./index');

const locations = [
  { name: 'Γραφείο - Κέντρο πόλης', address: 'Οδός 1, Κέντρο', fee_cents: 0, sort_order: 1 },
  { name: 'Αεροδρόμιο', address: 'Αίθουσα αφίξεων', fee_cents: 2000, sort_order: 2 },
  { name: 'Λιμάνι', address: 'Επιβατικός σταθμός', fee_cents: 1000, sort_order: 3 },
  { name: 'Παράδοση σε ξενοδοχείο (εντός πόλης)', address: 'Στη διεύθυνση που θα μας δώσετε', fee_cents: 1500, sort_order: 4 },
];

const extras = [
  { name: 'Πλήρης ασφάλεια (μηδενική απαλλαγή)', description: 'Μηδενίζει τη συμμετοχή σας σε ζημιές και την εγγύηση.', price_cents: 1200, pricing: 'per_day', max_qty: 1, sort_order: 1 },
  { name: 'Επιπλέον οδηγός', description: 'Ο επιπλέον οδηγός πρέπει να είναι παρών στην παραλαβή με το δίπλωμά του.', price_cents: 500, pricing: 'per_day', max_qty: 2, sort_order: 2 },
  { name: 'Παιδικό κάθισμα (0-4 ετών)', description: '', price_cents: 500, pricing: 'per_day', max_qty: 2, sort_order: 3 },
  { name: 'Κάθισμα booster (4-12 ετών)', description: '', price_cents: 400, pricing: 'per_day', max_qty: 2, sort_order: 4 },
  { name: 'GPS πλοήγηση', description: '', price_cents: 500, pricing: 'per_day', max_qty: 1, sort_order: 5 },
  { name: 'Γεμάτο ρεζερβουάρ κατά την παραλαβή', description: 'Επιστρέψτε το αυτοκίνητο με όσο καύσιμο θέλετε.', price_cents: 6000, pricing: 'per_rental', max_qty: 1, sort_order: 6 },
];

const seasons = [
  { name: 'Υψηλή περίοδος', start_md: '07-01', end_md: '08-31', percent: 140 },
  { name: 'Μέση περίοδος (Ιούνιος)', start_md: '06-01', end_md: '06-30', percent: 120 },
  { name: 'Μέση περίοδος (Σεπτέμβριος)', start_md: '09-01', end_md: '09-30', percent: 115 },
  { name: 'Χριστούγεννα - Πρωτοχρονιά', start_md: '12-20', end_md: '01-06', percent: 115 },
];

const cars = [
  ['Fiat', 'Panda', 2023, 'ΝΒΑ1001', 'mini', 'manual', 'petrol', 4, 5, 1, 2500, 25000, 21, 'Ιδανικό για την πόλη, εύκολο στο παρκάρισμα και πολύ οικονομικό.'],
  ['Toyota', 'Aygo X', 2024, 'ΝΒΑ1002', 'mini', 'automatic', 'petrol', 4, 5, 1, 3000, 25000, 21, 'Μικρό αυτόματο, ιδανικό για αρχάριους οδηγούς.'],
  ['Hyundai', 'i20', 2023, 'ΝΒΑ1003', 'economy', 'manual', 'petrol', 5, 5, 2, 3200, 30000, 21, 'Άνετο και οικονομικό για πόλη και επαρχία.'],
  ['Volkswagen', 'Polo', 2024, 'ΝΒΑ1004', 'economy', 'automatic', 'petrol', 5, 5, 2, 3800, 30000, 21, 'Αυτόματο κιβώτιο DSG, Apple CarPlay / Android Auto.'],
  ['Toyota', 'Corolla Hybrid', 2024, 'ΝΒΑ1005', 'compact', 'automatic', 'hybrid', 5, 5, 3, 4800, 40000, 23, 'Υβριδικό με πολύ χαμηλή κατανάλωση, ιδανικό για μεγάλες αποστάσεις.'],
  ['Peugeot', '308 SW', 2023, 'ΝΒΑ1006', 'family', 'manual', 'diesel', 5, 5, 4, 5200, 40000, 23, 'Station wagon με μεγάλο πορτμπαγκάζ για οικογενειακές διακοπές.'],
  ['Nissan', 'Qashqai', 2024, 'ΝΒΑ1007', 'suv', 'automatic', 'hybrid', 5, 5, 3, 6500, 50000, 25, 'SUV με ψηλή θέση οδήγησης και σύγχρονα συστήματα ασφαλείας.'],
  ['Dacia', 'Duster 4x4', 2023, 'ΝΒΑ1008', 'suv', 'manual', 'diesel', 5, 5, 3, 5500, 50000, 23, 'Τετρακίνητο για χωματόδρομους και ορεινές διαδρομές.'],
  ['Citroën', 'SpaceTourer', 2023, 'ΝΒΑ1009', 'van', 'automatic', 'diesel', 9, 4, 6, 11000, 80000, 25, 'Εννιαθέσιο για μεγάλες παρέες και οικογένειες.'],
  ['Mercedes-Benz', 'C 200', 2024, 'ΝΒΑ1010', 'luxury', 'automatic', 'petrol', 5, 4, 3, 12000, 100000, 27, 'Πολυτέλεια και άνεση για επαγγελματικά ταξίδια.'],
  ['Mini', 'Cooper Cabrio', 2023, 'ΝΒΑ1011', 'convertible', 'automatic', 'petrol', 4, 2, 1, 9000, 80000, 25, 'Ανοιχτό αυτοκίνητο για τις καλοκαιρινές βόλτες.'],
];

function seedIfEmpty(db) {
  transaction(db, () => {
    if (!db.prepare('SELECT 1 FROM locations LIMIT 1').get()) {
      const stmt = db.prepare('INSERT INTO locations (name, address, fee_cents, sort_order) VALUES (:name, :address, :fee_cents, :sort_order)');
      locations.forEach((l) => stmt.run(l));
    }
    if (!db.prepare('SELECT 1 FROM extras LIMIT 1').get()) {
      const stmt = db.prepare(
        'INSERT INTO extras (name, description, price_cents, pricing, max_qty, sort_order) VALUES (:name, :description, :price_cents, :pricing, :max_qty, :sort_order)',
      );
      extras.forEach((e) => stmt.run(e));
    }
    if (!db.prepare('SELECT 1 FROM seasons LIMIT 1').get()) {
      const stmt = db.prepare('INSERT INTO seasons (name, start_md, end_md, percent) VALUES (:name, :start_md, :end_md, :percent)');
      seasons.forEach((s) => stmt.run(s));
    }
    if (!db.prepare('SELECT 1 FROM cars LIMIT 1').get()) {
      const stmt = db.prepare(
        `INSERT INTO cars (make, model, year, plate, category, transmission, fuel, seats, doors, luggage,
           daily_rate_cents, deposit_cents, min_driver_age, description, image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      cars.forEach((c) => stmt.run(...c, `/img/cars/${c[4]}.svg`));
    }
  });
}

module.exports = { seedIfEmpty };
