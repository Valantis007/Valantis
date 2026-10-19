'use strict';

// Διάσωση πληρωμών με κάρτα που δεν ολοκληρώθηκαν (src/lib/payment-rescue.js): «Πληρωμή κατά την
// παραλαβή» σε κράτηση που περιμένει πληρωμή, email «Η κράτησή σας δεν έχει ολοκληρωθεί», email για
// πληρωμή με κάρτα που ολοκληρώθηκε μετά την αλλαγή σε πληρωμή κατά την παραλαβή.
// Ορολογία (docs/i18n.md): κράτηση = booking / reserva, παραλαβή = pick-up / recogida. Τα κουμπιά
// της σελίδας: «Πληρωμή {amount}» = ‘Pay {amount}’ / «Pagar {amount}», «Πληρωμή κατά την παραλαβή» =
// ‘Pay at pick-up’ / «Pago en la recogida» (src/locales/20-booking.js).

module.exports = {
  en: {
    // Σελίδα κράτησης που περιμένει πληρωμή (views/booking/show.ejs)
    'Με την «Πληρωμή κατά την παραλαβή» η κράτησή σας επιβεβαιώνεται αμέσως και πληρώνετε {amount} κατά την παραλαβή: χρεωστική ή πιστωτική κάρτα, IRIS ή μετρητά έως {cash}.':
      'With ‘Pay at pick-up’ your booking is confirmed straight away and you pay {amount} at pick-up: debit or credit card, IRIS or cash up to {cash}.',
    // Μηνύματα μετά την αλλαγή σε πληρωμή κατά την παραλαβή (src/routes/booking.js)
    'Η κράτησή σας επιβεβαιώθηκε με πληρωμή κατά την παραλαβή. Σας στείλαμε email με όλες τις λεπτομέρειες.':
      'Your booking has been confirmed with payment at pick-up. We have sent you an email with all the details.',
    'Η πληρωμή σας με κάρτα είχε ήδη ολοκληρωθεί και η κράτησή σας επιβεβαιώθηκε. Δεν χρειάζεται να πληρώσετε κατά την παραλαβή.':
      'Your card payment had already been completed and your booking has been confirmed. You do not need to pay at pick-up.',
    'Η πληρωμή κατά την παραλαβή δεν είναι πλέον δυνατή για αυτή την κράτηση.': 'Payment at pick-up is no longer possible for this booking.',
    'Δεν ήταν δυνατή η αλλαγή του τρόπου πληρωμής. Δοκιμάστε ξανά ή επικοινωνήστε μαζί μας.':
      'The payment method could not be changed. Please try again or contact us.',
    'Η πληρωμή δεν ολοκληρώθηκε. Το αυτοκίνητο παραμένει δεσμευμένο για λίγα λεπτά — μπορείτε να δοκιμάσετε ξανά ή να επιλέξετε πληρωμή κατά την παραλαβή.':
      'The payment was not completed. The car remains reserved for a few minutes — you can try again or choose to pay at pick-up.',

    // Email «Η κράτησή σας δεν έχει ολοκληρωθεί» (views/emails/payment-reminder.ejs)
    'Η κράτησή σας δεν έχει ολοκληρωθεί - κράτηση {ref}': 'Your booking has not been completed - booking {ref}',
    'Η κράτησή σας <strong>{ref}</strong> δεν έχει ολοκληρωθεί: δεν έχουμε λάβει ακόμη την πληρωμή <strong>{amount}</strong>.':
      'Your booking <strong>{ref}</strong> has not been completed: we have not yet received the payment of <strong>{amount}</strong>.',
    'Το αυτοκίνητο είναι δεσμευμένο για εσάς έως τις <strong>{time}</strong> (ώρα Ελλάδας). Μετά από αυτή την ώρα η κράτηση λήγει και το αυτοκίνητο αποδεσμεύεται.':
      'The car is reserved for you until <strong>{time}</strong> (Greek time). After that time the booking expires and the car is released.',
    'Το αυτοκίνητο είναι δεσμευμένο για εσάς έως τις <strong>{time}</strong>. Μετά από αυτή την ώρα η κράτηση λήγει και το αυτοκίνητο αποδεσμεύεται.':
      'The car is reserved for you until <strong>{time}</strong>. After that time the booking expires and the car is released.',
    'Για να ολοκληρώσετε την κράτηση, ανοίξτε τη σελίδα της κράτησης και επιλέξτε:': 'To complete the booking, open the booking page and choose:',
    '<strong>«Πληρωμή {amount}»</strong>: πληρώνετε τώρα online με κάρτα.': '<strong>‘Pay {amount}’</strong>: you pay online by card now.',
    '<strong>«Πληρωμή κατά την παραλαβή»</strong>: η κράτησή σας επιβεβαιώνεται αμέσως και πληρώνετε {amount} κατά την παραλαβή, με χρεωστική ή πιστωτική κάρτα, IRIS ή μετρητά έως {cash}.':
      '<strong>‘Pay at pick-up’</strong>: your booking is confirmed straight away and you pay {amount} at pick-up, by debit or credit card, IRIS or cash up to {cash}.',
    'Αν έχετε ήδη πληρώσει, δεν χρειάζεται να κάνετε τίποτα: θα λάβετε email επιβεβαίωσης.':
      'If you have already paid, you do not need to do anything: you will receive a confirmation email.',
    'Αν δεν θέλετε πλέον την κράτηση, δεν χρειάζεται να κάνετε τίποτα: δεν θα χρεωθείτε.':
      'If you no longer want the booking, you do not need to do anything: you will not be charged.',

    // Email για πληρωμή με κάρτα που ολοκληρώθηκε μετά την αλλαγή (views/emails/payment-received.ejs)
    'Λάβαμε την πληρωμή σας - κράτηση {ref}': 'We have received your payment - booking {ref}',
    'Λάβαμε την πληρωμή σας <strong>{amount}</strong> με κάρτα για την κράτηση <strong>{ref}</strong>.':
      'We have received your card payment of <strong>{amount}</strong> for booking <strong>{ref}</strong>.',
    '<strong>Δεν χρειάζεται να πληρώσετε το ποσό της ενοικίασης κατά την παραλαβή.</strong> Η κράτησή σας παραμένει επιβεβαιωμένη, χωρίς άλλη αλλαγή.':
      '<strong>You do not need to pay the rental amount at pick-up.</strong> Your booking remains confirmed, with no other change.',
  },
  es: {
    'Με την «Πληρωμή κατά την παραλαβή» η κράτησή σας επιβεβαιώνεται αμέσως και πληρώνετε {amount} κατά την παραλαβή: χρεωστική ή πιστωτική κάρτα, IRIS ή μετρητά έως {cash}.':
      'Con «Pago en la recogida», su reserva se confirma de inmediato y usted paga {amount} en la recogida: tarjeta de débito o crédito, IRIS o efectivo hasta {cash}.',
    'Η κράτησή σας επιβεβαιώθηκε με πληρωμή κατά την παραλαβή. Σας στείλαμε email με όλες τις λεπτομέρειες.':
      'Su reserva se ha confirmado con pago en la recogida. Le hemos enviado un email con todos los detalles.',
    'Η πληρωμή σας με κάρτα είχε ήδη ολοκληρωθεί και η κράτησή σας επιβεβαιώθηκε. Δεν χρειάζεται να πληρώσετε κατά την παραλαβή.':
      'Su pago con tarjeta ya se había completado y su reserva se ha confirmado. No tiene que pagar en la recogida.',
    'Η πληρωμή κατά την παραλαβή δεν είναι πλέον δυνατή για αυτή την κράτηση.': 'El pago en la recogida ya no es posible para esta reserva.',
    'Δεν ήταν δυνατή η αλλαγή του τρόπου πληρωμής. Δοκιμάστε ξανά ή επικοινωνήστε μαζί μας.':
      'No ha sido posible cambiar la forma de pago. Inténtelo de nuevo o póngase en contacto con nosotros.',
    'Η πληρωμή δεν ολοκληρώθηκε. Το αυτοκίνητο παραμένει δεσμευμένο για λίγα λεπτά — μπορείτε να δοκιμάσετε ξανά ή να επιλέξετε πληρωμή κατά την παραλαβή.':
      'El pago no se ha completado. El coche seguirá reservado durante unos minutos: puede intentarlo de nuevo o elegir el pago en la recogida.',

    'Η κράτησή σας δεν έχει ολοκληρωθεί - κράτηση {ref}': 'Su reserva no se ha completado - reserva {ref}',
    'Η κράτησή σας <strong>{ref}</strong> δεν έχει ολοκληρωθεί: δεν έχουμε λάβει ακόμη την πληρωμή <strong>{amount}</strong>.':
      'Su reserva <strong>{ref}</strong> no se ha completado: todavía no hemos recibido el pago de <strong>{amount}</strong>.',
    'Το αυτοκίνητο είναι δεσμευμένο για εσάς έως τις <strong>{time}</strong> (ώρα Ελλάδας). Μετά από αυτή την ώρα η κράτηση λήγει και το αυτοκίνητο αποδεσμεύεται.':
      'El coche queda reservado para usted hasta las <strong>{time}</strong> (hora de Grecia). Después de esa hora, la reserva caduca y el coche se libera.',
    'Το αυτοκίνητο είναι δεσμευμένο για εσάς έως τις <strong>{time}</strong>. Μετά από αυτή την ώρα η κράτηση λήγει και το αυτοκίνητο αποδεσμεύεται.':
      'El coche queda reservado para usted hasta las <strong>{time}</strong>. Después de esa hora, la reserva caduca y el coche se libera.',
    'Για να ολοκληρώσετε την κράτηση, ανοίξτε τη σελίδα της κράτησης και επιλέξτε:': 'Para completar la reserva, abra la página de la reserva y elija:',
    '<strong>«Πληρωμή {amount}»</strong>: πληρώνετε τώρα online με κάρτα.': '<strong>«Pagar {amount}»</strong>: paga ahora online con tarjeta.',
    '<strong>«Πληρωμή κατά την παραλαβή»</strong>: η κράτησή σας επιβεβαιώνεται αμέσως και πληρώνετε {amount} κατά την παραλαβή, με χρεωστική ή πιστωτική κάρτα, IRIS ή μετρητά έως {cash}.':
      '<strong>«Pago en la recogida»</strong>: su reserva se confirma de inmediato y usted paga {amount} en la recogida, con tarjeta de débito o crédito, IRIS o efectivo hasta {cash}.',
    'Αν έχετε ήδη πληρώσει, δεν χρειάζεται να κάνετε τίποτα: θα λάβετε email επιβεβαίωσης.':
      'Si ya ha pagado, no tiene que hacer nada: recibirá un email de confirmación.',
    'Αν δεν θέλετε πλέον την κράτηση, δεν χρειάζεται να κάνετε τίποτα: δεν θα χρεωθείτε.':
      'Si ya no desea la reserva, no tiene que hacer nada: no se le cobrará.',

    'Λάβαμε την πληρωμή σας - κράτηση {ref}': 'Hemos recibido su pago - reserva {ref}',
    'Λάβαμε την πληρωμή σας <strong>{amount}</strong> με κάρτα για την κράτηση <strong>{ref}</strong>.':
      'Hemos recibido su pago con tarjeta de <strong>{amount}</strong> para la reserva <strong>{ref}</strong>.',
    '<strong>Δεν χρειάζεται να πληρώσετε το ποσό της ενοικίασης κατά την παραλαβή.</strong> Η κράτησή σας παραμένει επιβεβαιωμένη, χωρίς άλλη αλλαγή.':
      '<strong>No tiene que pagar el importe del alquiler en la recogida.</strong> Su reserva sigue confirmada, sin ningún otro cambio.',
  },
};
