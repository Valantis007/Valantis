'use strict';

// «Όλα μεταφρασμένα»: κείμενα που διαβάζει ο πελάτης και δεν είχαν μετάφραση.
//  - Προεπιλεγμένα στοιχεία της επιχείρησης (src/config.js): η επωνυμία-υπόδειγμα και η αρμόδια αρχή.
//    Ό,τι άλλο γράφεται στο .env εμφανίζεται με λατινικούς χαρακτήρες (src/lib/company.js).
//  - Χιλιόμετρα με δομή (src/lib/mileage.js).
//  - Έτοιμες αιτίες ακύρωσης και περιγραφές χρεώσεων του γραφείου (src/lib/presets.js).

module.exports = {
  en: {
    // Στοιχεία επιχείρησης (προεπιλογές)
    'Επωνυμία Επιχείρησης': 'Company name',
    'Περιφερειακή Υπηρεσία Τουρισμού Κεντρικής Μακεδονίας - Υπουργείο Τουρισμού': 'Regional Tourism Service of Central Macedonia - Ministry of Tourism',

    // Χιλιόμετρα
    'Χιλιόμετρα': 'Mileage',
    'Όριο: {km} χλμ. ανά ημέρα': 'Limit: {km} km per day',
    'έως {km} χλμ. ανά ημέρα': 'up to {km} km per day',

    // Ακύρωση από το γραφείο
    'Βλάβη ή μη διαθεσιμότητα του αυτοκινήτου': 'Breakdown or unavailability of the car',
    'Κατόπιν αιτήματος του πελάτη': 'At the customer’s request',
    'Μη εμφάνιση κατά την παραλαβή': 'No-show at pick-up',
    'Σημείωση του γραφείου μας: {note}': 'Note from our office: {note}',

    // Χρεώσεις μετά την επιστροφή (έτοιμες περιγραφές)
    'Καύσιμο που έλειπε κατά την επιστροφή': 'Fuel missing on return',
    'Επιστροφή μετά την ώρα της κράτησης': 'Return after the booked time',
    'Ειδικός καθαρισμός του αυτοκινήτου': 'Special cleaning of the car',
    'Διαχείριση κλήσης / προστίμου': 'Handling of a traffic ticket / fine',
    'Διαχείριση διοδίων που δεν πληρώθηκαν': 'Handling of unpaid tolls',
    'Απώλεια κλειδιού του αυτοκινήτου': 'Loss of the car key',

    // Αιτίες που αποθηκεύονται από τον κώδικα (εμφανίζονται μεταφρασμένες εκεί που εμφανίζονται)
    'Αποδοχή online από τον πελάτη ({date})': 'Accepted online by the customer ({date})',
    'Οι χρεώσεις είχαν ήδη εξοφληθεί': 'The charges had already been paid',
  },
  es: {
    'Επωνυμία Επιχείρησης': 'Nombre de la empresa',
    'Περιφερειακή Υπηρεσία Τουρισμού Κεντρικής Μακεδονίας - Υπουργείο Τουρισμού': 'Servicio Regional de Turismo de Macedonia Central - Ministerio de Turismo',

    'Χιλιόμετρα': 'Kilometraje',
    'Όριο: {km} χλμ. ανά ημέρα': 'Límite: {km} km al día',
    'έως {km} χλμ. ανά ημέρα': 'hasta {km} km al día',

    'Βλάβη ή μη διαθεσιμότητα του αυτοκινήτου': 'Avería o falta de disponibilidad del coche',
    'Κατόπιν αιτήματος του πελάτη': 'A petición del cliente',
    'Μη εμφάνιση κατά την παραλαβή': 'No presentación en la recogida',
    'Σημείωση του γραφείου μας: {note}': 'Nota de nuestra oficina: {note}',

    'Καύσιμο που έλειπε κατά την επιστροφή': 'Combustible que faltaba en la devolución',
    'Επιστροφή μετά την ώρα της κράτησης': 'Devolución después de la hora reservada',
    'Ειδικός καθαρισμός του αυτοκινήτου': 'Limpieza especial del coche',
    'Διαχείριση κλήσης / προστίμου': 'Gestión de una denuncia / multa de tráfico',
    'Διαχείριση διοδίων που δεν πληρώθηκαν': 'Gestión de peajes no pagados',
    'Απώλεια κλειδιού του αυτοκινήτου': 'Pérdida de la llave del coche',

    'Αποδοχή online από τον πελάτη ({date})': 'Aceptado online por el cliente ({date})',
    'Οι χρεώσεις είχαν ήδη εξοφληθεί': 'Los cargos ya se habían pagado',
  },
};
