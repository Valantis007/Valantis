'use strict';

// Αρχικά δεδομένα: ενδεικτικά σημεία, πρόσθετα, εποχές και στόλος.
// Αλλάξτε τα ελεύθερα από τον πίνακα διαχείρισης μετά την εγκατάσταση.

const config = require('../config');
const { transaction } = require('./index');
const { seedLocations } = require('./seed-locations');

// Τα σημεία με τις οδηγίες «Πώς θα μας βρείτε»: src/db/seed-locations.js.

const extras = [
  {
    name: 'Πλήρης Απαλλαγή Ευθύνης για Ζημιές (FDW) - συμμετοχή 0 €',
    name_en: 'Full Damage Waiver (FDW) - €0 excess',
    name_es: 'Exención total por daños (FDW) - franquicia 0 €',
    description: 'Μηδενίζει τη συμμετοχή σας σε ζημιές του οχήματος, με τις εξαιρέσεις των όρων (§7). Δεν είναι ασφαλιστικό προϊόν: είναι συμβατική παραίτηση της εταιρείας από αξιώσεις για ζημιές. Η εγγύηση δεν αλλάζει.',
    description_en: 'Reduces your liability for damage to the vehicle to zero, subject to the exclusions in the terms (§7). It is not an insurance product: it is a contractual waiver by the company of claims for damage. The deposit does not change.',
    description_es: 'Reduce a cero su responsabilidad por daños al vehículo, salvo las exclusiones de las condiciones (§7). No es un seguro: es una renuncia contractual de la empresa a reclamar por daños. La fianza no cambia.',
    price_cents: 1200, pricing: 'per_day', max_qty: 1, sort_order: 1, kind: 'damage_waiver',
  },
  {
    name: 'Επιπλέον οδηγός', name_en: 'Additional driver', name_es: 'Conductor adicional',
    description: 'Ο επιπλέον οδηγός πρέπει να είναι παρών στην παραλαβή με το δίπλωμά του και να πληροί τις ίδιες προϋποθέσεις ηλικίας/διπλώματος.',
    description_en: 'The additional driver must be present at pick-up with their driving licence and meet the same age and licence requirements.',
    description_es: 'El conductor adicional debe estar presente en la recogida con su permiso de conducir y cumplir los mismos requisitos de edad y permiso.',
    price_cents: 500, pricing: 'per_day', max_qty: 2, sort_order: 2, kind: 'driver',
  },
  {
    name: 'Παιδικό κάθισμα (0-4 ετών)', name_en: 'Child seat (0-4 years)', name_es: 'Silla infantil (0-4 años)',
    description: 'Εγκεκριμένο κατά ECE R44/04 ή R129 (i-Size).', description_en: 'Approved to ECE R44/04 or R129 (i-Size).', description_es: 'Homologada según ECE R44/04 o R129 (i-Size).',
    price_cents: 500, pricing: 'per_day', max_qty: 2, sort_order: 3, kind: 'child_seat',
  },
  {
    name: 'Κάθισμα booster (4-12 ετών)', name_en: 'Booster seat (4-12 years)', name_es: 'Elevador (4-12 años)',
    description: 'Εγκεκριμένο κατά ECE R44/04 ή R129 (i-Size).', description_en: 'Approved to ECE R44/04 or R129 (i-Size).', description_es: 'Homologado según ECE R44/04 o R129 (i-Size).',
    price_cents: 400, pricing: 'per_day', max_qty: 2, sort_order: 4, kind: 'child_seat',
  },
  { name: 'GPS πλοήγηση', name_en: 'GPS navigation', name_es: 'Navegador GPS', description: '', price_cents: 500, pricing: 'per_day', max_qty: 1, sort_order: 5, kind: 'other' },
  {
    name: 'Προπληρωμένο γεμάτο ρεζερβουάρ',
    name_en: 'Prepaid full tank',
    name_es: 'Depósito lleno prepagado',
    description: 'Παραλαμβάνετε με γεμάτο ρεζερβουάρ και επιστρέφετε με όσο καύσιμο θέλετε. Το καύσιμο που δεν χρησιμοποιήθηκε δεν επιστρέφεται. Εναλλακτικά, επιστρέψτε με την ίδια στάθμη χωρίς χρέωση.',
    description_en: 'Pick up with a full tank and return with as much fuel as you like. Unused fuel is not refunded. Alternatively, return at the same level at no charge.',
    description_es: 'Recoge el coche con el depósito lleno y lo devuelve con el combustible que quiera. El combustible no utilizado no se reembolsa. También puede devolverlo con el mismo nivel sin coste.',
    price_cents: 6000, pricing: 'per_rental', max_qty: 1, sort_order: 6, kind: 'prepaid_fuel',
  },
];

const seasons = [
  { name: 'Υψηλή περίοδος', start_md: '07-01', end_md: '08-31', percent: 140 },
  { name: 'Μέση περίοδος (Ιούνιος)', start_md: '06-01', end_md: '06-30', percent: 120 },
  { name: 'Μέση περίοδος (Σεπτέμβριος)', start_md: '09-01', end_md: '09-30', percent: 115 },
  { name: 'Χριστούγεννα - Πρωτοχρονιά', start_md: '12-20', end_md: '01-06', percent: 115 },
];

const cars = [
  ['Fiat', 'Panda', 2023, 'ΝΒΑ1001', 'mini', 'manual', 'petrol', 4, 5, 1, 2500, 25000, 21, 'Ιδανικό για την πόλη, εύκολο στο παρκάρισμα και πολύ οικονομικό.', 'Ideal for the city, easy to park and very economical.', 'Ideal para la ciudad, fácil de aparcar y muy económico.'],
  ['Toyota', 'Aygo X', 2024, 'ΝΒΑ1002', 'mini', 'automatic', 'petrol', 4, 5, 1, 3000, 25000, 21, 'Μικρό αυτόματο, ιδανικό για αρχάριους οδηγούς.', 'Small automatic, ideal for new drivers.', 'Pequeño automático, ideal para conductores noveles.'],
  ['Hyundai', 'i20', 2023, 'ΝΒΑ1003', 'economy', 'manual', 'petrol', 5, 5, 2, 3200, 30000, 21, 'Άνετο και οικονομικό για πόλη και επαρχία.', 'Comfortable and economical in town and in the countryside.', 'Cómodo y económico en ciudad y carretera.'],
  ['Volkswagen', 'Polo', 2024, 'ΝΒΑ1004', 'economy', 'automatic', 'petrol', 5, 5, 2, 3800, 30000, 21, 'Αυτόματο κιβώτιο DSG, Apple CarPlay / Android Auto.', 'DSG automatic gearbox, Apple CarPlay / Android Auto.', 'Cambio automático DSG, Apple CarPlay / Android Auto.'],
  ['Toyota', 'Corolla Hybrid', 2024, 'ΝΒΑ1005', 'compact', 'automatic', 'hybrid', 5, 5, 3, 4800, 40000, 23, 'Υβριδικό με πολύ χαμηλή κατανάλωση, ιδανικό για μεγάλες αποστάσεις.', 'Hybrid with very low fuel consumption, ideal for long distances.', 'Híbrido de muy bajo consumo, ideal para largas distancias.'],
  ['Peugeot', '308 SW', 2023, 'ΝΒΑ1006', 'family', 'manual', 'diesel', 5, 5, 4, 5200, 40000, 23, 'Station wagon με μεγάλο πορτμπαγκάζ για οικογενειακές διακοπές.', 'Estate car with a large boot for family holidays.', 'Familiar con un gran maletero para las vacaciones en familia.'],
  ['Nissan', 'Qashqai', 2024, 'ΝΒΑ1007', 'suv', 'automatic', 'hybrid', 5, 5, 3, 6500, 50000, 25, 'SUV με ψηλή θέση οδήγησης και σύγχρονα συστήματα ασφαλείας.', 'SUV with a high driving position and modern safety systems.', 'SUV con posición de conducción elevada y sistemas de seguridad modernos.'],
  ['Dacia', 'Duster 4x4', 2023, 'ΝΒΑ1008', 'suv', 'manual', 'diesel', 5, 5, 3, 5500, 50000, 23, 'Τετρακίνητο για χωματόδρομους και ορεινές διαδρομές.', 'Four-wheel drive for dirt roads and mountain routes.', 'Tracción a las cuatro ruedas para caminos de tierra y rutas de montaña.'],
  ['Citroën', 'SpaceTourer', 2023, 'ΝΒΑ1009', 'van', 'automatic', 'diesel', 9, 4, 6, 11000, 80000, 25, 'Εννιαθέσιο για μεγάλες παρέες και οικογένειες.', 'Nine-seater for large groups and families.', 'Nueve plazas para grupos grandes y familias.'],
  ['Mercedes-Benz', 'C 200', 2024, 'ΝΒΑ1010', 'luxury', 'automatic', 'petrol', 5, 4, 3, 12000, 100000, 27, 'Πολυτέλεια και άνεση για επαγγελματικά ταξίδια.', 'Luxury and comfort for business trips.', 'Lujo y confort para viajes de negocios.'],
  ['Mini', 'Cooper Cabrio', 2023, 'ΝΒΑ1011', 'convertible', 'automatic', 'petrol', 4, 2, 1, 9000, 80000, 25, 'Ανοιχτό αυτοκίνητο για τις καλοκαιρινές βόλτες.', 'A convertible for summer drives.', 'Un descapotable para los paseos de verano.'],
];

function seedIfEmpty(db) {
  transaction(db, () => {
    if (!db.prepare('SELECT 1 FROM locations LIMIT 1').get()) {
      const stmt = db.prepare(
        `INSERT INTO locations (name, name_en, name_es, address, address_en, address_es, instructions, instructions_en, instructions_es,
           return_instructions, return_instructions_en, return_instructions_es, needs_address, fee_cents, sort_order)
         VALUES (:name, :name_en, :name_es, :address, :address_en, :address_es, :instructions, :instructions_en, :instructions_es,
           :return_instructions, :return_instructions_en, :return_instructions_es, :needs_address, :fee_cents, :sort_order)`,
      );
      // Οι οδηγίες του γραφείου αναφέρουν το ωράριο των ρυθμίσεων (OPENING_HOUR / CLOSING_HOUR).
      seedLocations(config.rules).forEach((l) => stmt.run(l));
    }
    if (!db.prepare('SELECT 1 FROM extras LIMIT 1').get()) {
      const stmt = db.prepare(
        `INSERT INTO extras (name, name_en, name_es, description, description_en, description_es, price_cents, pricing, max_qty, sort_order, kind)
         VALUES (:name, :name_en, :name_es, :description, :description_en, :description_es, :price_cents, :pricing, :max_qty, :sort_order, :kind)`,
      );
      extras.forEach((e) => stmt.run({ description_en: null, description_es: null, ...e }));
    }
    if (!db.prepare('SELECT 1 FROM seasons LIMIT 1').get()) {
      const stmt = db.prepare('INSERT INTO seasons (name, start_md, end_md, percent) VALUES (:name, :start_md, :end_md, :percent)');
      seasons.forEach((s) => stmt.run(s));
    }
    if (!db.prepare('SELECT 1 FROM cars LIMIT 1').get()) {
      const stmt = db.prepare(
        `INSERT INTO cars (make, model, year, plate, category, transmission, fuel, seats, doors, luggage,
           daily_rate_cents, deposit_cents, min_driver_age, description, description_en, description_es, image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      cars.forEach((c) => stmt.run(...c, `/img/cars/${c[4]}.svg`));
    }
  });
}

module.exports = { seedIfEmpty };
