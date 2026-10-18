'use strict';

// WhatsApp (έτοιμα μηνύματα, ώρες απάντησης, μηνύματα του γραφείου προς τον πελάτη), «Η κράτησή μου»
// με ένα πάτημα από το email (/b/<token>) και «Χρειάζεστε αλλαγή;» / αίτημα αλλαγής κράτησης.
// Ορολογία (docs/i18n.md): κράτηση = booking / reserva, κωδικός κράτησης = booking reference /
// código de reserva, σημείο παραλαβής/επιστροφής = pick-up/return location / lugar de recogida/devolución.

module.exports = {
  en: {
    // WhatsApp: έτοιμο κείμενο (σελίδες, emails) και ώρες απάντησης (src/lib/whatsapp.js)
    'Γεια σας, έχω μια ερώτηση.': 'Hello, I have a question.',
    'Γεια σας, έχω μια ερώτηση για την κράτηση {ref}.': 'Hello, I have a question about booking {ref}.',
    'Απαντάμε {from}–{to}': 'We reply {from}–{to}',
    'Συνομιλία στο WhatsApp': 'Chat on WhatsApp',
    // Μηνύματα του γραφείου στο WhatsApp του πελάτη, στη γλώσσα της κράτησης (Διαχείριση → κράτηση)
    'Γεια σας {name}, εδώ {company}. Το αυτοκίνητο της κράτησης {ref} είναι έτοιμο για την παραλαβή στις {date} ({place}).':
      'Hello {name}, this is {company}. The car for booking {ref} is ready for pick-up on {date} ({place}).',
    'Γεια σας {name}, εδώ {company}. Για την κράτηση {ref} (παραλαβή στις {date}), θα μπορούσατε να μας στείλετε τον αριθμό της πτήσης σας; Έτσι θα σας περιμένουμε ακόμη κι αν η πτήση καθυστερήσει.':
      'Hello {name}, this is {company}. For booking {ref} (pick-up on {date}), could you send us your flight number? That way we will wait for you even if the flight is delayed.',
    'Γεια σας {name}, εδώ {company}, σχετικά με την κράτησή σας {ref}.': 'Hello {name}, this is {company}, about your booking {ref}.',
    // «Η κράτησή μου» στα emails και ο σύνδεσμος /b/<token>
    'Ο σύνδεσμος ανοίγει την κράτησή σας χωρίς κωδικό· μην προωθήσετε αυτό το email.':
      'The link opens your booking without a booking reference; do not forward this email.',
    'Ο σύνδεσμος της κράτησης δεν ισχύει πλέον. Συμπληρώστε τον κωδικό και το email της κράτησης.':
      'The booking link is no longer valid. Enter the booking reference and the email address of the booking.',
    // «Χρειάζεστε αλλαγή;» (views/booking/_change.ejs) και φόρμα επικοινωνίας
    'Χρειάζεστε αλλαγή;': 'Need a change?',
    'Π.χ. άλλες ημερομηνίες ή ώρες, άλλο σημείο παραλαβής ή επιστροφής, πρόσθετα.':
      'E.g. different dates or times, a different pick-up or return location, extras.',
    'Η αλλαγή ισχύει μόνο αφού σας την επιβεβαιώσουμε· η τιμή μπορεί να αλλάξει.':
      'The change only applies once we have confirmed it to you; the price may change.',
    'Αίτημα αλλαγής': 'Request a change',
    'Αίτημα αλλαγής κράτησης': 'Booking change request',
    'Αίτημα αλλαγής κράτησης {ref}': 'Change request for booking {ref}',
    'Γράψτε τι θέλετε να αλλάξει: π.χ. ημερομηνίες, ώρες, σημείο παραλαβής ή επιστροφής, πρόσθετα.':
      'Write what you would like to change: e.g. dates, times, pick-up or return location, extras.',
    'Συμπληρώστε τον κωδικό κράτησης.': 'Enter the booking reference.',
    'Λάβαμε το αίτημα αλλαγής. Θα σας απαντήσουμε το συντομότερο· η αλλαγή ισχύει μόνο αφού σας την επιβεβαιώσουμε.':
      'We have received the change request. We will reply as soon as possible; the change only applies once we have confirmed it to you.',
  },
  es: {
    'Γεια σας, έχω μια ερώτηση.': 'Hola, tengo una pregunta.',
    'Γεια σας, έχω μια ερώτηση για την κράτηση {ref}.': 'Hola, tengo una pregunta sobre la reserva {ref}.',
    'Απαντάμε {from}–{to}': 'Respondemos de {from} a {to}',
    'Συνομιλία στο WhatsApp': 'Conversación por WhatsApp',
    'Γεια σας {name}, εδώ {company}. Το αυτοκίνητο της κράτησης {ref} είναι έτοιμο για την παραλαβή στις {date} ({place}).':
      'Hola, {name}. Le escribimos de {company}. El coche de la reserva {ref} está listo para la recogida el {date} ({place}).',
    'Γεια σας {name}, εδώ {company}. Για την κράτηση {ref} (παραλαβή στις {date}), θα μπορούσατε να μας στείλετε τον αριθμό της πτήσης σας; Έτσι θα σας περιμένουμε ακόμη κι αν η πτήση καθυστερήσει.':
      'Hola, {name}. Le escribimos de {company}. Para la reserva {ref} (recogida el {date}), ¿podría enviarnos el número de su vuelo? Así le esperaremos aunque el vuelo se retrase.',
    'Γεια σας {name}, εδώ {company}, σχετικά με την κράτησή σας {ref}.': 'Hola, {name}. Le escribimos de {company} en relación con su reserva {ref}.',
    'Ο σύνδεσμος ανοίγει την κράτησή σας χωρίς κωδικό· μην προωθήσετε αυτό το email.':
      'El enlace abre su reserva sin código de reserva; no reenvíe este correo electrónico.',
    'Ο σύνδεσμος της κράτησης δεν ισχύει πλέον. Συμπληρώστε τον κωδικό και το email της κράτησης.':
      'El enlace de la reserva ya no es válido. Indique el código de reserva y el email de la reserva.',
    'Χρειάζεστε αλλαγή;': '¿Necesita un cambio?',
    'Π.χ. άλλες ημερομηνίες ή ώρες, άλλο σημείο παραλαβής ή επιστροφής, πρόσθετα.':
      'P. ej., otras fechas u horas, otro lugar de recogida o de devolución, extras.',
    'Η αλλαγή ισχύει μόνο αφού σας την επιβεβαιώσουμε· η τιμή μπορεί να αλλάξει.':
      'El cambio solo es válido una vez que se lo hayamos confirmado; el precio puede cambiar.',
    'Αίτημα αλλαγής': 'Solicitar un cambio',
    'Αίτημα αλλαγής κράτησης': 'Solicitud de cambio de reserva',
    'Αίτημα αλλαγής κράτησης {ref}': 'Solicitud de cambio de la reserva {ref}',
    'Γράψτε τι θέλετε να αλλάξει: π.χ. ημερομηνίες, ώρες, σημείο παραλαβής ή επιστροφής, πρόσθετα.':
      'Indique qué desea cambiar: p. ej., fechas, horas, lugar de recogida o de devolución, extras.',
    'Συμπληρώστε τον κωδικό κράτησης.': 'Indique el código de reserva.',
    'Λάβαμε το αίτημα αλλαγής. Θα σας απαντήσουμε το συντομότερο· η αλλαγή ισχύει μόνο αφού σας την επιβεβαιώσουμε.':
      'Hemos recibido la solicitud de cambio. Le responderemos lo antes posible; el cambio solo es válido una vez que se lo hayamos confirmado.',
  },
};
