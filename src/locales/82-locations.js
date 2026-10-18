'use strict';

// Σημεία παραλαβής/επιστροφής: «Πώς θα μας βρείτε» (οδηγίες, «Οδηγίες πορείας» στο Google Maps)
// και η διεύθυνση του πελάτη για παράδοση/παραλαβή του αυτοκινήτου (π.χ. σε ξενοδοχείο).
// Οι οδηγίες κάθε σημείου είναι περιεχόμενο της βάσης (locations.instructions_en/_es κ.λπ.), όχι εδώ.

module.exports = {
  en: {
    // Φόρμα κράτησης (views/booking/new.ejs)
    'Διεύθυνση παράδοσης (ξενοδοχείο, οδός, περιοχή) *': 'Delivery address (hotel, street, area) *',
    'Διεύθυνση από όπου θα παραλάβουμε το αυτοκίνητο *': 'Address where we will collect the car *',
    'Εντός πόλης': 'Within the city',
    'Θα παραλάβουμε το αυτοκίνητο από την ίδια διεύθυνση': 'We will collect the car from the same address',
    // Σφάλματα (src/lib/bookings.js)
    'Συμπληρώστε τη διεύθυνση παράδοσης (ξενοδοχείο, οδός, περιοχή).': 'Please enter the delivery address (hotel, street, area).',
    'Συμπληρώστε τη διεύθυνση από όπου θα παραλάβουμε το αυτοκίνητο.': 'Please enter the address where we will collect the car.',
    // Κράτηση, εκτύπωση, emails
    'Διεύθυνση παράδοσης: {address}': 'Delivery address: {address}',
    'Θα παραλάβουμε το αυτοκίνητο από: {address}': 'We will collect the car from: {address}',
    'Η κράτησή σας είναι επιβεβαιωμένη. Θα σας φέρουμε το αυτοκίνητο στις <strong>{date}</strong> στη διεύθυνση «{address}».':
      'Your booking is confirmed. We will bring the car to you on <strong>{date}</strong> at the address ‘{address}’.',
    // «Πώς θα μας βρείτε»
    'Πώς θα μας βρείτε': 'How to find us',
    'Οδηγίες πορείας': 'Directions',
    'Αν χρειαστείτε βοήθεια, καλέστε μας στο <a href="{url}">{phone}</a>.': 'If you need help, call us on <a href="{url}">{phone}</a>.',
  },
  es: {
    'Διεύθυνση παράδοσης (ξενοδοχείο, οδός, περιοχή) *': 'Dirección de entrega (hotel, calle, zona) *',
    'Διεύθυνση από όπου θα παραλάβουμε το αυτοκίνητο *': 'Dirección donde recogeremos el coche *',
    'Εντός πόλης': 'Dentro de la ciudad',
    'Θα παραλάβουμε το αυτοκίνητο από την ίδια διεύθυνση': 'Recogeremos el coche en la misma dirección',
    'Συμπληρώστε τη διεύθυνση παράδοσης (ξενοδοχείο, οδός, περιοχή).': 'Indique la dirección de entrega (hotel, calle, zona).',
    'Συμπληρώστε τη διεύθυνση από όπου θα παραλάβουμε το αυτοκίνητο.': 'Indique la dirección donde recogeremos el coche.',
    'Διεύθυνση παράδοσης: {address}': 'Dirección de entrega: {address}',
    'Θα παραλάβουμε το αυτοκίνητο από: {address}': 'Recogeremos el coche en: {address}',
    'Η κράτησή σας είναι επιβεβαιωμένη. Θα σας φέρουμε το αυτοκίνητο στις <strong>{date}</strong> στη διεύθυνση «{address}».':
      'Su reserva está confirmada. Le llevaremos el coche el <strong>{date}</strong> a la dirección «{address}».',
    'Πώς θα μας βρείτε': 'Cómo encontrarnos',
    'Οδηγίες πορείας': 'Cómo llegar',
    'Αν χρειαστείτε βοήθεια, καλέστε μας στο <a href="{url}">{phone}</a>.': 'Si necesita ayuda, llámenos al <a href="{url}">{phone}</a>.',
  },
};
