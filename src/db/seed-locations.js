'use strict';

// Ενδεικτικά σημεία παραλαβής/επιστροφής με τις οδηγίες «Πώς θα μας βρείτε» στις τρεις γλώσσες.
// Τα χρησιμοποιούν η αρχική εγκατάσταση (seed-data.js) και η μετάβαση 11 (src/db/index.js), που
// συμπληρώνει τις οδηγίες σε παλιές βάσεις όταν το σημείο έχει ακόμη το αρχικό ελληνικό όνομα.
// Χωρίς σύνδεσμο χάρτη (map_url): είναι ενδεικτικά· το γραφείο βάζει τα πραγματικά από τη διαχείριση.

const HOTEL_ADDRESS = 'Στη διεύθυνση που θα μας δώσετε';

// Ώρα σε μορφή 08:00 (το ωράριο του γραφείου έρχεται από τις ρυθμίσεις OPENING_HOUR / CLOSING_HOUR).
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

function seedLocations(rules = { openingHour: 8, closingHour: 22 }) {
  const from = hh(rules.openingHour);
  const to = hh(rules.closingHour);
  return [
    {
      name: 'Γραφείο - Κέντρο πόλης',
      name_en: 'Office - City centre',
      name_es: 'Oficina - Centro de la ciudad',
      address: 'Οδός 1, Κέντρο',
      address_en: 'Street 1, City centre',
      address_es: 'Calle 1, Centro',
      instructions: `Ελάτε στο γραφείο μας, στη διεύθυνση που αναγράφεται. Ωράριο: καθημερινά ${from} - ${to}.`,
      instructions_en: `Come to our office at the address shown. Opening hours: daily ${from}–${to}.`,
      instructions_es: `Venga a nuestra oficina, en la dirección indicada. Horario: todos los días, de ${from} a ${to}.`,
      return_instructions: 'Επιστρέψτε το αυτοκίνητο στο γραφείο μας και παραδώστε τα κλειδιά σε συνάδελφό μας. Θα ελέγξουμε μαζί σας το αυτοκίνητο και τη στάθμη του καυσίμου.',
      return_instructions_en: 'Return the car to our office and hand the keys to a member of our staff. We will check the car and the fuel level together with you.',
      return_instructions_es: 'Devuelva el coche en nuestra oficina y entregue las llaves a un miembro de nuestro personal. Revisaremos con usted el coche y el nivel de combustible.',
      needs_address: 0,
      fee_cents: 0,
      sort_order: 1,
    },
    {
      name: 'Αεροδρόμιο',
      name_en: 'Airport',
      name_es: 'Aeropuerto',
      address: 'Αίθουσα αφίξεων',
      address_en: 'Arrivals hall',
      address_es: 'Sala de llegadas',
      instructions: 'Θα σας περιμένει συνάδελφός μας στην έξοδο των αφίξεων με πινακίδα με το όνομά σας. Αν καθυστερήσει η πτήση σας, σας περιμένουμε.',
      instructions_en: 'A member of our staff will be waiting for you at the arrivals exit with a sign with your name. If your flight is delayed, we will wait for you.',
      instructions_es: 'Un miembro de nuestro personal le esperará en la salida de llegadas con un cartel con su nombre. Si su vuelo se retrasa, le esperaremos.',
      return_instructions: 'Καλέστε μας περίπου 15 λεπτά πριν φτάσετε στο αεροδρόμιο. Συνάδελφός μας θα σας συναντήσει στην είσοδο των αναχωρήσεων και θα παραλάβει το αυτοκίνητο και τα κλειδιά.',
      return_instructions_en: 'Call us about 15 minutes before you arrive at the airport. A member of our staff will meet you at the departures entrance and collect the car and the keys.',
      return_instructions_es: 'Llámenos unos 15 minutos antes de llegar al aeropuerto. Un miembro de nuestro personal se reunirá con usted en la entrada de salidas y recogerá el coche y las llaves.',
      needs_address: 0,
      fee_cents: 2000,
      sort_order: 2,
    },
    {
      name: 'Λιμάνι',
      name_en: 'Port',
      name_es: 'Puerto',
      address: 'Επιβατικός σταθμός',
      address_en: 'Passenger terminal',
      address_es: 'Terminal de pasajeros',
      instructions: 'Σημείο συνάντησης: η έξοδος του επιβατικού σταθμού. Θα σας περιμένει συνάδελφός μας με πινακίδα με το όνομά σας. Αν καθυστερήσει το πλοίο σας, σας περιμένουμε.',
      instructions_en: 'Meeting point: the exit of the passenger terminal. A member of our staff will be waiting for you with a sign with your name. If your ferry is delayed, we will wait for you.',
      instructions_es: 'Punto de encuentro: la salida de la terminal de pasajeros. Un miembro de nuestro personal le esperará con un cartel con su nombre. Si su ferry se retrasa, le esperaremos.',
      return_instructions: 'Καλέστε μας περίπου 15 λεπτά πριν φτάσετε στο λιμάνι. Συνάδελφός μας θα σας συναντήσει στην είσοδο του επιβατικού σταθμού και θα παραλάβει το αυτοκίνητο και τα κλειδιά.',
      return_instructions_en: 'Call us about 15 minutes before you arrive at the port. A member of our staff will meet you at the entrance of the passenger terminal and collect the car and the keys.',
      return_instructions_es: 'Llámenos unos 15 minutos antes de llegar al puerto. Un miembro de nuestro personal se reunirá con usted en la entrada de la terminal de pasajeros y recogerá el coche y las llaves.',
      needs_address: 0,
      fee_cents: 1000,
      sort_order: 3,
    },
    {
      name: 'Παράδοση σε ξενοδοχείο (εντός πόλης)',
      name_en: 'Hotel delivery (within the city)',
      name_es: 'Entrega en el hotel (dentro de la ciudad)',
      address: HOTEL_ADDRESS,
      address_en: 'At the address you give us',
      address_es: 'En la dirección que nos indique',
      instructions: 'Φέρνουμε το αυτοκίνητο στη διεύθυνση που θα μας δώσετε, εντός πόλης, την ώρα της παραλαβής. Συνάδελφός μας θα σας καλέσει στο κινητό σας λίγο πριν φτάσει.',
      instructions_en: 'We bring the car to the address you give us, within the city, at the pick-up time. A member of our staff will call you on your mobile shortly before arriving.',
      instructions_es: 'Le llevamos el coche a la dirección que nos indique, dentro de la ciudad, a la hora de la recogida. Un miembro de nuestro personal le llamará al móvil poco antes de llegar.',
      return_instructions: 'Παραλαμβάνουμε το αυτοκίνητο από τη διεύθυνση που θα μας δώσετε, εντός πόλης, την ώρα της επιστροφής. Θα σας καλέσουμε λίγο πριν φτάσουμε.',
      return_instructions_en: 'We collect the car from the address you give us, within the city, at the return time. We will call you shortly before we arrive.',
      return_instructions_es: 'Recogemos el coche en la dirección que nos indique, dentro de la ciudad, a la hora de la devolución. Le llamaremos poco antes de llegar.',
      // Ο πελάτης γράφει τη διεύθυνση (ξενοδοχείο, οδός, περιοχή) στη φόρμα κράτησης.
      needs_address: 1,
      fee_cents: 1500,
      sort_order: 4,
    },
  ];
}

module.exports = { seedLocations, HOTEL_ADDRESS };
