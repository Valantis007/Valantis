'use strict';

// Μηνύματα από τον κώδικα (src/lib, src/routes): ετικέτες του format.js, σφάλματα επικύρωσης
// (αναζήτηση, στοιχεία οδηγού), σφάλματα κράτησης/πληρωμής/εγγύησης, μηνύματα flash και τίτλοι σελίδων.
// Κλειδί: το ακριβές ελληνικό κείμενο. Τα {όνομα} μένουν όπως είναι.
// Δεν επαναλαμβάνονται κλειδιά άλλων λεξικών: π.χ. 'Κράτηση {ref}', 'Επιλέξτε σημείο παραλαβής.' (10-pages, 20-booking),
// θέματα emails, αιτίες ακύρωσης/επιστροφής πληρωμής και μηνύματα σύνδεσης/λογαριασμού/κωδικού (40-emails-account).

module.exports = {
  en: {
    // ---- src/lib/format.js: ετικέτες ----
    // category
    'Μίνι': 'Mini',
    'Οικονομικό': 'Economy',
    'Compact': 'Compact',
    'Οικογενειακό': 'Family',
    'SUV': 'SUV',
    'Van / 7-9 θέσεων': 'Van / 7-9 seater',
    'Πολυτελείας': 'Luxury',
    'Cabrio': 'Convertible',
    // fuel
    'Βενζίνη': 'Petrol',
    'Diesel': 'Diesel',
    'Υβριδικό': 'Hybrid',
    'Ηλεκτρικό': 'Electric',
    'Υγραέριο': 'LPG',
    // status (κράτηση) — και κοινές τιμές για depositStatus / refundStatus
    'Αναμονή πληρωμής': 'Awaiting payment',
    'Επιβεβαιωμένη': 'Confirmed',
    'Σε εξέλιξη': 'In progress',
    'Ολοκληρώθηκε': 'Completed',
    'Ακυρώθηκε': 'Cancelled',
    'Έληξε': 'Expired',
    // paymentMethod
    'Κάρτα (online)': 'Card (online)',
    'Κατά την παραλαβή': 'Pay at pick-up',
    // paymentStatus
    'Απλήρωτη': 'Unpaid',
    'Εξοφλημένη': 'Paid',
    'Επιστράφηκαν τα χρήματα': 'Refunded',
    'Μερική επιστροφή': 'Partially refunded',
    // pricing ('ανά ημέρα' στο 10-pages.js)
    'ανά ενοικίαση': 'per rental',
    // depositStatus
    'Αναμονή έγκρισης από τον πελάτη': 'Awaiting customer authorisation',
    'Δεσμευμένη': 'Held',
    'Αποδεσμεύτηκε': 'Released',
    'Εκκαθαρίστηκε (με παρακράτηση)': 'Settled (with deduction)',
    'Απέτυχε': 'Failed',
    // depositMethod
    'POS γραφείου': 'Card terminal at our office',
    'Online (Stripe)': 'Online (Stripe)',
    'Online (Revolut)': 'Online (Revolut)',
    // chargeCategory ('Καύσιμο' στο 10-pages.js)
    'Καθυστέρηση επιστροφής': 'Late return',
    'Ειδικός καθαρισμός': 'Special cleaning',
    'Διαχείριση προστίμου / διοδίων': 'Fine / toll administration',
    'Ζημιά': 'Damage',
    'Άλλη χρέωση (με αποδοχή πελάτη)': 'Other charge (subject to customer acceptance)',
    // chargeStatus
    'Αναμονή απάντησης πελάτη': 'Awaiting customer response',
    'Αποδεκτή': 'Accepted',
    'Αμφισβητείται': 'Disputed',
    'Αποσύρθηκε': 'Withdrawn',
    'Εξοφλήθηκε': 'Paid',

    // ---- src/lib/search.js: κριτήρια αναζήτησης ----
    'Οι παραλαβές γίνονται {from} - {to}.': 'Pick-ups are available between {from} and {to}.',
    'Οι επιστροφές γίνονται {from} - {to}.': 'Returns are available between {from} and {to}.',
    'Η παραλαβή πρέπει να είναι τουλάχιστον {hours} ώρες από τώρα.': 'Pick-up must be at least {hours} hours from now.',
    'Δεχόμαστε κρατήσεις έως {days} ημέρες μπροστά.': 'We accept bookings up to {days} days in advance.',
    'Η μέγιστη διάρκεια ενοικίασης είναι {days} ημέρες.': 'The maximum rental period is {days} days.',

    // ---- src/lib/bookings.js: στοιχεία οδηγού (validateDriver) ----
    'Συμπληρώστε έγκυρο τηλέφωνο (π.χ. +30 69XXXXXXXX).': 'Please enter a valid phone number (e.g. +44 7700 900123).',
    'Συμπληρώστε την ημερομηνία γέννησης.': 'Please enter the date of birth.',
    'Για αυτό το αυτοκίνητο ο οδηγός πρέπει να είναι τουλάχιστον {age} ετών κατά την παραλαβή.':
      'For this car, the driver must be at least {age} years old at pick-up.',
    'Ελέγξτε την ημερομηνία γέννησης.': 'Please check the date of birth.',
    'Συμπληρώστε τον αριθμό διπλώματος.': 'Please enter the driving licence number.',
    'Συμπληρώστε τη χώρα έκδοσης.': 'Please enter the country of issue.',
    'Συμπληρώστε την ημερομηνία έκδοσης του διπλώματος.': 'Please enter the driving licence issue date.',
    'Η ημερομηνία έκδοσης δεν μπορεί να είναι μεταγενέστερη της παραλαβής.': 'The issue date cannot be later than the pick-up date.',
    'Απαιτείται δίπλωμα τουλάχιστον {years} έτους.': 'A driving licence held for at least {years} year is required.',
    'Απαιτείται δίπλωμα τουλάχιστον {years} ετών.': 'A driving licence held for at least {years} years is required.',
    'Η ημερομηνία έκδοσης είναι πριν τη γέννηση.': 'The issue date cannot be earlier than the date of birth.',
    'Συμπληρώστε ηλικία και βάρος του παιδιού, ώστε να σας δώσουμε το κατάλληλο κάθισμα.':
      'Please enter the child’s age and weight so that we can provide the right seat.',
    'Μη έγκυρος ΑΦΜ.': 'Invalid Greek VAT number (AFM).',
    'Συμπληρώστε την επωνυμία.': 'Please enter the company name.',
    'Συμπληρώστε τη διεύθυνση.': 'Please enter the address.',
    'Συμπληρώστε τη ΔΟΥ.': 'Please enter the tax office (DOY).',
    'Συμπληρώστε τη δραστηριότητα.': 'Please enter the business activity.',
    'Επιλέξτε τρόπο πληρωμής.': 'Please choose a payment method.',
    'Πρέπει να αποδεχθείτε τους όρους ενοικίασης.': 'You must accept the rental terms.',
    // createBooking / customerCancellation
    'Το αυτοκίνητο δεν είναι πλέον διαθέσιμο.': 'The car is no longer available.',
    'Δυστυχώς το αυτοκίνητο μόλις κρατήθηκε για αυτές τις ημερομηνίες. Δοκιμάστε άλλο αυτοκίνητο.':
      'Unfortunately, the car has just been booked for these dates. Please try another car.',
    'Η κράτηση δεν μπορεί πλέον να ακυρωθεί online.': 'This booking can no longer be cancelled online.',
    'Η ώρα παραλαβής έχει περάσει. Επικοινωνήστε μαζί μας.': 'The pick-up time has passed. Please contact us.',

    // ---- src/lib/deposits.js: εγγύηση και χρεώσεις ----
    'Η δέσμευση της εγγύησης γίνεται από {from} έως την επιστροφή του αυτοκινήτου.':
      'The security deposit can be held from {from} until the car is returned.',
    'Εγγύηση ενοικίασης - δέσμευση ποσού (όχι χρέωση)': 'Rental security deposit - hold only (not a charge)',
    'Η χρέωση δεν περιμένει απάντηση.': 'This charge is no longer awaiting a response.',
    'Ο πάροχος δεν επιβεβαίωσε ότι η κάρτα είναι πιστωτική — ελέγξτε την κάρτα στην παραλαβή.':
      'The payment provider did not confirm that the card is a credit card — the card must be checked at pick-up.',
    'Η δέσμευση έληξε ή ακυρώθηκε από την τράπεζα / τον πάροχο.': 'The hold expired or was cancelled by the bank / payment provider.',

    // ---- src/lib/payments.js: πληρωμές, επιστροφές, ακύρωση ----
    'Ενοικίαση {car} - {days} ημέρα': '{car} rental - {days} day',
    'Ενοικίαση {car} - {days} ημέρες': '{car} rental - {days} days',
    'Χρεώσεις μετά την επιστροφή του αυτοκινήτου': 'Charges after the return of the car',
    'Η πληρωμή δεν είναι πλέον δυνατή για αυτή την κράτηση.': 'Payment is no longer possible for this booking.',
    'Το αυτοκίνητο δεν είναι πλέον διαθέσιμο για αυτές τις ημερομηνίες.': 'The car is no longer available for these dates.',
    'Οι online πληρωμές δεν είναι διαθέσιμες. Επικοινωνήστε μαζί μας.': 'Online payments are not available. Please contact us.',
    'Δεν υπάρχουν χρεώσεις προς πληρωμή.': 'There are no charges to pay.',
    'Οι χρεώσεις θα αφαιρεθούν πρώτα από την εγγύηση. Θα σας ενημερώσουμε για τυχόν υπόλοιπο.':
      'The charges will first be deducted from the security deposit. We will let you know of any remaining balance.',
    'Η κράτηση δεν μπορεί να ακυρωθεί σε αυτή την κατάσταση.': 'The booking cannot be cancelled in its current status.',
    'Η κράτηση άλλαξε στο μεταξύ. Ανανεώστε τη σελίδα.': 'The booking has changed in the meantime. Please refresh the page.',

    // ---- src/routes/booking.js ----
    'Επιλέξτε ημερομηνίες και σημεία παραλαβής/επιστροφής.': 'Please choose dates and pick-up/return locations.',
    'Το αυτοκίνητο δεν είναι διαθέσιμο για αυτές τις ημερομηνίες.': 'The car is not available for these dates.',
    'Το αυτοκίνητο δεν βρέθηκε.': 'The car was not found.',
    'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά ή επιλέξτε πληρωμή κατά την παραλαβή.':
      'We could not connect to the payment service. Please try again or choose to pay at pick-up.',
    'Η κράτησή σας επιβεβαιώθηκε! Σας στείλαμε email με όλες τις λεπτομέρειες.': 'Your booking is confirmed! We have sent you an email with all the details.',
    'Για να δείτε την κράτηση, συμπληρώστε τον κωδικό και το email της.': 'To view your booking, please enter the booking reference and email address.',
    'Επιβεβαιώστε ότι αποδέχεστε τη χρέωση ακύρωσης {amount}.': 'Please confirm that you accept the cancellation charge of {amount}.',
    'Η κράτηση ακυρώθηκε.': 'The booking has been cancelled.',
    'Η επιστροφή {amount} στην κάρτα σας ξεκίνησε και θα εμφανιστεί σε 5-10 εργάσιμες ημέρες.':
      'A refund of {amount} to your card has been initiated and will appear within 5-10 working days.',
    'Η επιστροφή {amount} καθυστερεί λόγω προσωρινού προβλήματος του παρόχου πληρωμών· θα ολοκληρωθεί αυτόματα μόλις αποκατασταθεί.':
      'The refund of {amount} is delayed due to a temporary problem with the payment provider; it will be completed automatically once the problem is resolved.',
    'Θα επικοινωνήσουμε μαζί σας για την επιστροφή {amount}.': 'We will contact you about the refund of {amount}.',
    'Δεν ήταν δυνατή η ακύρωση. Επικοινωνήστε μαζί μας.': 'The booking could not be cancelled. Please contact us.',
    'Η πληρωμή δεν είναι πλέον δυνατή για αυτή την κράτηση. Κάντε νέα αναζήτηση.': 'Payment is no longer possible for this booking. Please start a new search.',
    'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά σε λίγο.': 'We could not connect to the payment service. Please try again shortly.',
    'Η πληρωμή ολοκληρώθηκε και η κράτησή σας επιβεβαιώθηκε! Σας στείλαμε email με τις λεπτομέρειες.':
      'Your payment is complete and your booking is confirmed! We have sent you an email with the details.',
    'Η πληρωμή σας δεν μπορούσε να αντιστοιχιστεί στην κράτηση (π.χ. είχε ήδη πληρωθεί ή ακυρωθεί) και επιστρέφεται αυτόματα στην κάρτα σας.':
      'Your payment could not be matched to the booking (e.g. the booking had already been paid for or cancelled) and is being refunded automatically to your card.',
    'Η πληρωμή σας επεξεργάζεται. Θα λάβετε email μόλις επιβεβαιωθεί.': 'Your payment is being processed. You will receive an email once it is confirmed.',
    'Η πληρωμή καταχωρήθηκε. Ευχαριστούμε!': 'Your payment has been recorded. Thank you!',
    'Η πληρωμή δεν ολοκληρώθηκε. Το αυτοκίνητο παραμένει δεσμευμένο για λίγα λεπτά — μπορείτε να δοκιμάσετε ξανά.':
      'The payment was not completed. The car remains reserved for a few minutes — you can try again.',
    'Επιλέξτε αποδοχή ή αμφισβήτηση.': 'Please choose to accept or dispute the charge.',
    'Επιβεβαιώστε ότι αποδέχεστε τη χρέωση.': 'Please confirm that you accept the charge.',
    'Η αποδοχή από το γραφείο καταχωρείται από τη διαχείριση, με την περιγραφή της γραπτής συναίνεσης του πελάτη.':
      'Acceptance by the office is recorded in the admin area, with a description of the customer’s written consent.',
    'Ευχαριστούμε. Η αποδοχή σας καταχωρήθηκε.': 'Thank you. Your acceptance has been recorded.',
    'Η αμφισβήτησή σας καταχωρήθηκε. Θα επικοινωνήσουμε μαζί σας.': 'Your dispute has been recorded. We will contact you.',
    'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών.': 'We could not connect to the payment service.',

    // ---- src/routes/public.js ----
    'Μη έγκυρα στοιχεία αναζήτησης.': 'Invalid search criteria.',
  },

  es: {
    // ---- src/lib/format.js: ετικέτες ----
    // category
    'Μίνι': 'Mini',
    'Οικονομικό': 'Económico',
    'Compact': 'Compacto',
    'Οικογενειακό': 'Familiar',
    'SUV': 'SUV',
    'Van / 7-9 θέσεων': 'Monovolumen / 7-9 plazas',
    'Πολυτελείας': 'De lujo',
    'Cabrio': 'Descapotable',
    // fuel
    'Βενζίνη': 'Gasolina',
    'Diesel': 'Diésel',
    'Υβριδικό': 'Híbrido',
    'Ηλεκτρικό': 'Eléctrico',
    'Υγραέριο': 'GLP',
    // status (κράτηση) — και κοινές τιμές για depositStatus / refundStatus
    'Αναμονή πληρωμής': 'Pendiente de pago',
    'Επιβεβαιωμένη': 'Confirmada',
    'Σε εξέλιξη': 'En curso',
    'Ολοκληρώθηκε': 'Completada',
    'Ακυρώθηκε': 'Cancelada',
    'Έληξε': 'Caducada',
    // paymentMethod
    'Κάρτα (online)': 'Tarjeta (online)',
    'Κατά την παραλαβή': 'En la recogida',
    // paymentStatus
    'Απλήρωτη': 'Pendiente',
    'Εξοφλημένη': 'Pagado',
    'Επιστράφηκαν τα χρήματα': 'Reembolsado',
    'Μερική επιστροφή': 'Reembolso parcial',
    // pricing
    'ανά ενοικίαση': 'por alquiler',
    // depositStatus
    'Αναμονή έγκρισης από τον πελάτη': 'Pendiente de autorización del cliente',
    'Δεσμευμένη': 'Bloqueada',
    'Αποδεσμεύτηκε': 'Liberada',
    'Εκκαθαρίστηκε (με παρακράτηση)': 'Liquidada (con deducción)',
    'Απέτυχε': 'Fallida',
    // depositMethod
    'POS γραφείου': 'TPV de la oficina',
    'Online (Stripe)': 'Online (Stripe)',
    'Online (Revolut)': 'Online (Revolut)',
    // chargeCategory
    'Καθυστέρηση επιστροφής': 'Retraso en la devolución',
    'Ειδικός καθαρισμός': 'Limpieza especial',
    'Διαχείριση προστίμου / διοδίων': 'Gestión de multas / peajes',
    'Ζημιά': 'Daños',
    'Άλλη χρέωση (με αποδοχή πελάτη)': 'Otro cargo (sujeto a la aceptación del cliente)',
    // chargeStatus
    'Αναμονή απάντησης πελάτη': 'Pendiente de respuesta del cliente',
    'Αποδεκτή': 'Aceptado',
    'Αμφισβητείται': 'Impugnado',
    'Αποσύρθηκε': 'Retirado',
    'Εξοφλήθηκε': 'Pagado',

    // ---- src/lib/search.js: κριτήρια αναζήτησης ----
    'Οι παραλαβές γίνονται {from} - {to}.': 'Las recogidas se realizan entre las {from} y las {to}.',
    'Οι επιστροφές γίνονται {from} - {to}.': 'Las devoluciones se realizan entre las {from} y las {to}.',
    'Η παραλαβή πρέπει να είναι τουλάχιστον {hours} ώρες από τώρα.': 'La recogida debe programarse con al menos {hours} horas de antelación.',
    'Δεχόμαστε κρατήσεις έως {days} ημέρες μπροστά.': 'Aceptamos reservas con hasta {days} días de antelación.',
    'Η μέγιστη διάρκεια ενοικίασης είναι {days} ημέρες.': 'La duración máxima del alquiler es de {days} días.',

    // ---- src/lib/bookings.js: στοιχεία οδηγού (validateDriver) ----
    'Συμπληρώστε έγκυρο τηλέφωνο (π.χ. +30 69XXXXXXXX).': 'Indique un número de teléfono válido, con el prefijo internacional (p. ej., +34 612 345 678).',
    'Συμπληρώστε την ημερομηνία γέννησης.': 'Indique la fecha de nacimiento.',
    'Για αυτό το αυτοκίνητο ο οδηγός πρέπει να είναι τουλάχιστον {age} ετών κατά την παραλαβή.':
      'Para este coche, el conductor debe tener al menos {age} años en el momento de la recogida.',
    'Ελέγξτε την ημερομηνία γέννησης.': 'Compruebe la fecha de nacimiento.',
    'Συμπληρώστε τον αριθμό διπλώματος.': 'Indique el número del permiso de conducir.',
    'Συμπληρώστε τη χώρα έκδοσης.': 'Indique el país de expedición.',
    'Συμπληρώστε την ημερομηνία έκδοσης του διπλώματος.': 'Indique la fecha de expedición del permiso de conducir.',
    'Η ημερομηνία έκδοσης δεν μπορεί να είναι μεταγενέστερη της παραλαβής.': 'La fecha de expedición no puede ser posterior a la de recogida.',
    'Απαιτείται δίπλωμα τουλάχιστον {years} έτους.': 'Se requiere un permiso de conducir con una antigüedad mínima de {years} año.',
    'Απαιτείται δίπλωμα τουλάχιστον {years} ετών.': 'Se requiere un permiso de conducir con una antigüedad mínima de {years} años.',
    'Η ημερομηνία έκδοσης είναι πριν τη γέννηση.': 'La fecha de expedición no puede ser anterior a la fecha de nacimiento.',
    'Συμπληρώστε ηλικία και βάρος του παιδιού, ώστε να σας δώσουμε το κατάλληλο κάθισμα.':
      'Indique la edad y el peso del niño para que podamos facilitarle la silla adecuada.',
    'Μη έγκυρος ΑΦΜ.': 'NIF griego (AFM) no válido.',
    'Συμπληρώστε την επωνυμία.': 'Indique la razón social.',
    'Συμπληρώστε τη διεύθυνση.': 'Indique la dirección.',
    'Συμπληρώστε τη ΔΟΥ.': 'Indique la delegación de Hacienda (DOY).',
    'Συμπληρώστε τη δραστηριότητα.': 'Indique la actividad.',
    'Επιλέξτε τρόπο πληρωμής.': 'Elija un método de pago.',
    'Πρέπει να αποδεχθείτε τους όρους ενοικίασης.': 'Debe aceptar las condiciones de alquiler.',
    // createBooking / customerCancellation
    'Το αυτοκίνητο δεν είναι πλέον διαθέσιμο.': 'El coche ya no está disponible.',
    'Δυστυχώς το αυτοκίνητο μόλις κρατήθηκε για αυτές τις ημερομηνίες. Δοκιμάστε άλλο αυτοκίνητο.':
      'Lamentablemente, el coche acaba de reservarse para estas fechas. Pruebe con otro coche.',
    'Η κράτηση δεν μπορεί πλέον να ακυρωθεί online.': 'Esta reserva ya no se puede cancelar online.',
    'Η ώρα παραλαβής έχει περάσει. Επικοινωνήστε μαζί μας.': 'La hora de recogida ya ha pasado. Póngase en contacto con nosotros.',

    // ---- src/lib/deposits.js: εγγύηση και χρεώσεις ----
    'Η δέσμευση της εγγύησης γίνεται από {from} έως την επιστροφή του αυτοκινήτου.':
      'El bloqueo de la fianza puede realizarse desde el {from} hasta la devolución del coche.',
    'Εγγύηση ενοικίασης - δέσμευση ποσού (όχι χρέωση)': 'Fianza del alquiler - bloqueo del importe (no es un cargo)',
    'Η χρέωση δεν περιμένει απάντηση.': 'Este cargo ya no está pendiente de respuesta.',
    'Ο πάροχος δεν επιβεβαίωσε ότι η κάρτα είναι πιστωτική — ελέγξτε την κάρτα στην παραλαβή.':
      'El proveedor de pagos no ha confirmado que la tarjeta sea de crédito; se comprobará en la recogida.',
    'Η δέσμευση έληξε ή ακυρώθηκε από την τράπεζα / τον πάροχο.': 'El bloqueo ha caducado o ha sido anulado por el banco / el proveedor de pagos.',

    // ---- src/lib/payments.js: πληρωμές, επιστροφές, ακύρωση ----
    'Ενοικίαση {car} - {days} ημέρα': 'Alquiler de {car} - {days} día',
    'Ενοικίαση {car} - {days} ημέρες': 'Alquiler de {car} - {days} días',
    'Χρεώσεις μετά την επιστροφή του αυτοκινήτου': 'Cargos tras la devolución del coche',
    'Η πληρωμή δεν είναι πλέον δυνατή για αυτή την κράτηση.': 'Ya no es posible pagar esta reserva.',
    'Το αυτοκίνητο δεν είναι πλέον διαθέσιμο για αυτές τις ημερομηνίες.': 'El coche ya no está disponible para estas fechas.',
    'Οι online πληρωμές δεν είναι διαθέσιμες. Επικοινωνήστε μαζί μας.': 'Los pagos online no están disponibles. Póngase en contacto con nosotros.',
    'Δεν υπάρχουν χρεώσεις προς πληρωμή.': 'No hay cargos pendientes de pago.',
    'Οι χρεώσεις θα αφαιρεθούν πρώτα από την εγγύηση. Θα σας ενημερώσουμε για τυχόν υπόλοιπο.':
      'Los cargos se descontarán primero de la fianza. Le informaremos de cualquier importe restante.',
    'Η κράτηση δεν μπορεί να ακυρωθεί σε αυτή την κατάσταση.': 'La reserva no se puede cancelar en su estado actual.',
    'Η κράτηση άλλαξε στο μεταξύ. Ανανεώστε τη σελίδα.': 'La reserva se ha modificado entretanto. Actualice la página.',

    // ---- src/routes/booking.js ----
    'Επιλέξτε ημερομηνίες και σημεία παραλαβής/επιστροφής.': 'Elija las fechas y los lugares de recogida y devolución.',
    'Το αυτοκίνητο δεν είναι διαθέσιμο για αυτές τις ημερομηνίες.': 'El coche no está disponible para estas fechas.',
    'Το αυτοκίνητο δεν βρέθηκε.': 'No se ha encontrado el coche.',
    'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά ή επιλέξτε πληρωμή κατά την παραλαβή.':
      'No ha sido posible conectar con el servicio de pagos. Inténtelo de nuevo o elija pagar en la recogida.',
    'Η κράτησή σας επιβεβαιώθηκε! Σας στείλαμε email με όλες τις λεπτομέρειες.': '¡Su reserva está confirmada! Le hemos enviado un email con todos los detalles.',
    'Για να δείτε την κράτηση, συμπληρώστε τον κωδικό και το email της.': 'Para ver la reserva, indique su código de reserva y su email.',
    'Επιβεβαιώστε ότι αποδέχεστε τη χρέωση ακύρωσης {amount}.': 'Confirme que acepta el cargo por cancelación de {amount}.',
    'Η κράτηση ακυρώθηκε.': 'La reserva se ha cancelado.',
    'Η επιστροφή {amount} στην κάρτα σας ξεκίνησε και θα εμφανιστεί σε 5-10 εργάσιμες ημέρες.':
      'Se ha iniciado el reembolso de {amount} en su tarjeta, que aparecerá en un plazo de 5 a 10 días hábiles.',
    'Η επιστροφή {amount} καθυστερεί λόγω προσωρινού προβλήματος του παρόχου πληρωμών· θα ολοκληρωθεί αυτόματα μόλις αποκατασταθεί.':
      'El reembolso de {amount} se está retrasando por un problema temporal del proveedor de pagos; se completará automáticamente en cuanto se resuelva.',
    'Θα επικοινωνήσουμε μαζί σας για την επιστροφή {amount}.': 'Nos pondremos en contacto con usted para el reembolso de {amount}.',
    'Δεν ήταν δυνατή η ακύρωση. Επικοινωνήστε μαζί μας.': 'No ha sido posible cancelar la reserva. Póngase en contacto con nosotros.',
    'Η πληρωμή δεν είναι πλέον δυνατή για αυτή την κράτηση. Κάντε νέα αναζήτηση.': 'Ya no es posible pagar esta reserva. Realice una nueva búsqueda.',
    'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά σε λίγο.': 'No ha sido posible conectar con el servicio de pagos. Inténtelo de nuevo en unos instantes.',
    'Η πληρωμή ολοκληρώθηκε και η κράτησή σας επιβεβαιώθηκε! Σας στείλαμε email με τις λεπτομέρειες.':
      '¡El pago se ha completado y su reserva está confirmada! Le hemos enviado un email con los detalles.',
    'Η πληρωμή σας δεν μπορούσε να αντιστοιχιστεί στην κράτηση (π.χ. είχε ήδη πληρωθεί ή ακυρωθεί) και επιστρέφεται αυτόματα στην κάρτα σας.':
      'Su pago no se ha podido asignar a la reserva (p. ej., porque ya estaba pagada o cancelada) y se le reembolsará automáticamente en su tarjeta.',
    'Η πληρωμή σας επεξεργάζεται. Θα λάβετε email μόλις επιβεβαιωθεί.': 'Su pago se está procesando. Recibirá un email en cuanto se confirme.',
    'Η πληρωμή καταχωρήθηκε. Ευχαριστούμε!': 'Su pago se ha registrado. ¡Gracias!',
    'Η πληρωμή δεν ολοκληρώθηκε. Το αυτοκίνητο παραμένει δεσμευμένο για λίγα λεπτά — μπορείτε να δοκιμάσετε ξανά.':
      'El pago no se ha completado. El coche seguirá reservado durante unos minutos: puede intentarlo de nuevo.',
    'Επιλέξτε αποδοχή ή αμφισβήτηση.': 'Elija si acepta o impugna el cargo.',
    'Επιβεβαιώστε ότι αποδέχεστε τη χρέωση.': 'Confirme que acepta el cargo.',
    'Η αποδοχή από το γραφείο καταχωρείται από τη διαχείριση, με την περιγραφή της γραπτής συναίνεσης του πελάτη.':
      'La aceptación por parte de la oficina se registra desde la administración, con la descripción del consentimiento por escrito del cliente.',
    'Ευχαριστούμε. Η αποδοχή σας καταχωρήθηκε.': 'Gracias. Su aceptación se ha registrado.',
    'Η αμφισβήτησή σας καταχωρήθηκε. Θα επικοινωνήσουμε μαζί σας.': 'Su impugnación se ha registrado. Nos pondremos en contacto con usted.',
    'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών.': 'No ha sido posible conectar con el servicio de pagos.',

    // ---- src/routes/public.js ----
    'Μη έγκυρα στοιχεία αναζήτησης.': 'Datos de búsqueda no válidos.',
  },
};
