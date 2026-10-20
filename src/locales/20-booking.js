'use strict';

// Κράτηση: φόρμα κράτησης, προσυμβατική ενημέρωση, ανάλυση τιμής, σελίδα κράτησης, εκτύπωση.
// (views/booking/*.ejs). Κλειδί: το ακριβές ελληνικό κείμενο. Τα {όνομα} μένουν όπως είναι.

module.exports = {
  en: {
    // --- _quote.ejs (ανάλυση τιμής στη φόρμα κράτησης) ---
    'Ενοικίαση (<span data-q="days">{days}</span> ημέρα)': 'Rental (<span data-q="days">{days}</span> day)',
    'Ενοικίαση (<span data-q="days">{days}</span> ημέρες)': 'Rental (<span data-q="days">{days}</span> days)',
    'Έκπτωση διάρκειας (<span data-q="discountPercent">{percent}</span>%)': 'Long-rental discount (<span data-q="discountPercent">{percent}</span>%)',
    'Χρέωση σημείου ({name})': 'Location charge ({name})',
    'Επιστροφή σε διαφορετικό σημείο': 'Return to a different location',
    'Πρόσθετα': 'Extras',
    'Σύνολο': 'Total',
    'Περιλαμβάνεται ΦΠΑ': 'VAT included',
    'Απαλλαγή (συμμετοχή σε ζημιές)': 'Excess (your contribution towards damage)',
    'Εγγύηση (δέσμευση σε πιστωτική κάρτα — όχι χρέωση)': 'Security deposit (hold on a credit card — not a charge)',

    // --- _precontract.ejs (προσυμβατική ενημέρωση) ---
    'Σημαντικές πληροφορίες πριν την κράτηση': 'Important information before you book',
    '<strong>Αυτοκίνητο:</strong> {car} ή παρόμοιο της κατηγορίας «{category}». Εγγυόμαστε την κατηγορία, όχι το μοντέλο· αν δεν είναι διαθέσιμη, σας δίνουμε ανώτερη κατηγορία χωρίς χρέωση ή σας επιστρέφουμε όλο το ποσό.':
      '<strong>Car:</strong> {car} or similar in the ‘{category}’ category. We guarantee the category, not the model; if that category is not available, we will upgrade you to a higher category at no extra charge or refund the full amount.',
    '<strong>Περιλαμβάνονται:</strong> υποχρεωτική ασφάλιση αστικής ευθύνης έναντι τρίτων, βασική κάλυψη ζημιών του οχήματος (CDW) με απαλλαγή <strong data-q="excessText">{excess}</strong>, {mileage}, ΦΠΑ {vat}%.':
      '<strong>Included:</strong> compulsory third-party liability insurance, basic cover for damage to the vehicle (CDW) with an excess of <strong data-q="excessText">{excess}</strong>, {mileage}, {vat}% VAT.',
    'Απεριόριστα χιλιόμετρα': 'Unlimited mileage',
    'Οδική βοήθεια 24/7.': 'Roadside assistance 24/7.',
    '<strong>Εγγύηση {amount}:</strong> δέσμευση (όχι χρέωση) σε πιστωτική κάρτα στο όνομα του κύριου οδηγού, στο γραφείο κατά την παραλαβή ή online (ο σύνδεσμος ενεργοποιείται {hours} ώρες πριν την παραλαβή). Χρεωστικές, προπληρωμένες κάρτες και μετρητά δεν γίνονται δεκτά για την εγγύηση. Αποδεσμεύεται μετά την επιστροφή· ο χρόνος εμφάνισης του ποσού εξαρτάται από την τράπεζά σας. Από την εγγύηση αφαιρούνται μόνο οι χρεώσεις του <a href="{url}" target="_blank">τιμοκαταλόγου</a> και, για ζημιά, μόνο με τη συναίνεσή σας και έως την απαλλαγή (εκτός από τις εξαιρέσεις των όρων §7).':
      '<strong>Security deposit of {amount}:</strong> a hold (not a charge) on a credit card in the main driver’s name, made at the office at pick-up or online (the link becomes active {hours} hours before pick-up). Debit cards, prepaid cards and cash are not accepted for the deposit. It is released after the car is returned; how long it takes for the amount to become available again depends on your bank. Only charges from the <a href="{url}" target="_blank">price list</a> are deducted from the deposit and, for damage, only with your consent and up to the excess (except for the exclusions in §7 of the terms).',
    '<strong>Καύσιμο:</strong> παραλαβή και επιστροφή με την ίδια στάθμη· αν λείπει: {perLitre}/λίτρο + {fee} τέλος ανεφοδιασμού.':
      '<strong>Fuel:</strong> return the car with the same fuel level as at pick-up; any missing fuel is charged at {perLitre}/litre plus a {fee} refuelling fee.',
    '<strong>Πλοίο ή εξωτερικό:</strong> μόνο με προηγούμενη γραπτή άδειά μας (<a href="{url}" target="_blank">όροι §6</a>).':
      '<strong>Ferries or travel abroad:</strong> only with our prior written permission (<a href="{url}" target="_blank">terms §6</a>).',
    '<strong>Δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών</strong>, επειδή πρόκειται για ενοικίαση αυτοκινήτου για συγκεκριμένες ημερομηνίες (άρθρο 3ιβ ν. 2251/1994). Ισχύει η πολιτική ακύρωσης: <strong>δωρεάν έως {hours} ώρες πριν την παραλαβή</strong>· μετά, ή σε μη εμφάνιση, παρακρατείται {fee} από ό,τι έχετε προπληρώσει (αν πληρώνετε στην παραλαβή, δεν οφείλεται χρέωση).':
      '<strong>There is no 14-day right of withdrawal</strong>, because this is a car rental for specific dates (Article 3ib of Greek Law 2251/1994). Our cancellation policy applies: <strong>free of charge up to {hours} hours before pick-up</strong>; after that, or in the event of a no-show, {fee} is retained from any amount you have prepaid (if you pay at pick-up, no charge is due).',
    'Παράπονα': 'Complaints',
    'μέσω της φόρμας επικοινωνίας': 'via the contact form',
    'διαδικασία παραπόνων & εξωδικαστική επίλυση': 'complaints procedure & out-of-court dispute resolution',
    'Εκμισθωτής': 'Lessor',
    'στοιχεία εταιρείας': 'company details',

    // --- _details.ejs (στοιχεία κράτησης: σελίδα κράτησης και εκτύπωση) ---
    'ή παρόμοιο': 'or similar',
    'Παραλαβή': 'Pick-up',
    'Επιστροφή': 'Return',
    'Οδηγός': 'Driver',
    'Πτήση/πλοίο': 'Flight/ferry',
    'Χρέωση': 'Charges',
    'Ενοικίαση ({days} ημέρα)': 'Rental ({days} day)',
    'Ενοικίαση ({days} ημέρες)': 'Rental ({days} days)',
    'Έκπτωση διάρκειας': 'Long-rental discount',
    'Χρεώσεις σημείου': 'Location charges',
    'Εγγύηση στην παραλαβή': 'Security deposit at pick-up',
    'Τρόπος πληρωμής': 'Payment method',
    'Κατάσταση πληρωμής': 'Payment status',
    'Επιστράφηκαν': 'Refunded',

    // --- new.ejs (φόρμα κράτησης) ---
    'Πίσω': 'Back',
    'Ολοκλήρωση κράτησης': 'Complete your booking',
    'Ελέγξτε τα πεδία που επισημαίνονται παρακάτω.': 'Please check the fields highlighted below.',
    'Ποσότητα: {name}': 'Quantity: {name}',
    'Προσθήκη': 'Add',
    'Στοιχεία κύριου οδηγού': 'Main driver details',
    'Έχετε λογαριασμό; <a href="{url}">Συνδεθείτε</a> για να συμπληρωθούν αυτόματα τα στοιχεία σας.':
      'Have an account? <a href="{url}">Log in</a> to have your details filled in automatically.',
    'Όνομα *': 'First name *',
    'Επώνυμο *': 'Surname *',
    'Κινητό τηλέφωνο *': 'Mobile phone *',
    'Ημερομηνία γέννησης *': 'Date of birth *',
    'Ελάχιστη ηλικία για αυτό το αυτοκίνητο: {age}': 'Minimum age for this car: {age}',
    'Δίπλωμα οδήγησης': 'Driving licence',
    'Αριθμός διπλώματος *': 'Driving licence number *',
    'Χώρα έκδοσης *': 'Country of issue *',
    'Ελλάδα': 'Greece',
    'Ημερομηνία έκδοσης *': 'Date of issue *',
    'Αριθμός πτήσης / πλοίου (προαιρετικό)': 'Flight / ferry number (optional)',
    'π.χ. A3 123': 'e.g. A3 123',
    'Για να σας περιμένουμε σε περίπτωση καθυστέρησης.': 'So that we can wait for you if you are delayed.',
    'Σημειώσεις / ειδικά αιτήματα (προαιρετικό)': 'Notes / special requests (optional)',
    'Μην αναγράφετε πληροφορίες υγείας ή αριθμούς καρτών.': 'Please do not include health information or card numbers.',
    'Ηλικία και βάρος παιδιού/παιδιών (για παιδικό κάθισμα)': 'Age and weight of the child/children (for the child seat)',
    'π.χ. 3 ετών, 15 κιλά': 'e.g. 3 years old, 15 kg',
    'Υποχρεωτικό αν επιλέξετε παιδικό κάθισμα, ώστε να σας δώσουμε την κατάλληλη κλάση (ECE R44/R129).':
      'Required if you choose a child seat, so that we can provide the right type of seat (ECE R44/R129).',
    'Χρειάζομαι τιμολόγιο (επαγγελματίες)': 'I need an invoice (business customers)',
    'Θέλω τιμολόγιο αντί για απόδειξη': 'I would like an invoice instead of a receipt',
    'Επωνυμία': 'Company name',
    'Διεύθυνση': 'Address',
    'ΔΟΥ': 'Tax office (DOY)',
    'Δραστηριότητα': 'Business activity',
    'Πληρωμή': 'Payment',
    'Κάρτα online': 'Pay online by card',
    'Ασφαλής πληρωμή μέσω {provider} (Visa, Mastercard, Apple Pay, Google Pay).': 'Secure payment via {provider} (Visa, Mastercard, Apple Pay, Google Pay).',
    'Πληρωμή κατά την παραλαβή': 'Pay at pick-up',
    'Χρεωστική ή πιστωτική κάρτα, IRIS ή μετρητά έως {amount}.': 'Debit or credit card, IRIS or cash up to {amount}.',
    'Έχω διαβάσει και αποδέχομαι τους <a href="{url}" target="_blank">όρους ενοικίασης</a> (έκδοση {version}). *':
      'I have read and accept the <a href="{url}" target="_blank">rental terms</a> (version {version}). *',
    'Πώς χρησιμοποιούμε τα στοιχεία σας: <a href="{url}" target="_blank">Πολιτική απορρήτου</a>.':
      'How we use your data: <a href="{url}" target="_blank">Privacy policy</a>.',
    '{seats} θέσεις': '{seats} seats',
    'Αλλαγή ημερομηνιών ή σημείων': 'Change dates or locations',
    'Ελέγξτε τα στοιχεία σας· μπορείτε να τα διορθώσετε πριν την υποβολή.': 'Please check your details; you can correct them before submitting.',
    // Υποχρεωτική διατύπωση του κουμπιού παραγγελίας (ν. 2251/1994, οδηγία 2011/83/ΕΕ άρθ. 8 παρ. 2).
    'Κράτηση με υποχρέωση πληρωμής': 'Book with obligation to pay',
    'Θα μεταφερθείτε στην ασφαλή σελίδα πληρωμής ({provider}). Η κράτηση ολοκληρώνεται με την επιτυχή πληρωμή.':
      'You will be taken to the secure payment page ({provider}). Your booking is complete once payment has been made successfully.',
    'Η πληρωμή γίνεται κατά την παραλαβή.': 'Payment is made at pick-up.',
    'Δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών. Δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή.':
      'There is no 14-day right of withdrawal. Free cancellation up to {hours} hours before pick-up.',

    // --- show.ejs (σελίδα κράτησης) ---
    'Κράτηση <span class="ref">{ref}</span>': 'Booking <span class="ref">{ref}</span>',
    'Εκτύπωση': 'Print',
    'Η κράτηση δεν έχει ολοκληρωθεί — εκκρεμεί η πληρωμή.': 'Your booking is not yet complete — payment is pending.',
    'Το αυτοκίνητο είναι δεσμευμένο για εσάς έως τις <strong>{time}</strong>.': 'The car is reserved for you until <strong>{time}</strong>.',
    'Πληρωμή {amount}': 'Pay {amount}',
    'Η κράτηση έληξε επειδή δεν ολοκληρώθηκε η πληρωμή. <a href="{url}">Κάντε νέα αναζήτηση</a>.':
      'This booking has expired because payment was not completed. <a href="{url}">Start a new search</a>.',
    'Η κράτησή σας είναι επιβεβαιωμένη. Σας περιμένουμε στις <strong>{date}</strong> στο σημείο «{location}».':
      'Your booking is confirmed. We look forward to seeing you on <strong>{date}</strong> at ‘{location}’.',
    'Επιστροφή {amount} στην κάρτα σας είναι σε εξέλιξη.': 'A refund of {amount} to your card is in progress.',
    'Εγγύηση': 'Security deposit',
    'κάρτα •••• {last4}': 'card •••• {last4}',
    'Παρακρατήθηκαν {captured}, αποδεσμεύτηκαν {released}.': '{captured} retained, {released} released.',
    'Χρεώσεις μετά την επιστροφή': 'Charges after return',
    'Ποσό': 'Amount',
    'Κατάσταση': 'Status',
    'Τεκμηρίωση': 'Evidence',
    'εξοφλήθηκαν {amount}': '{amount} paid',
    'Παρακαλούμε απαντήστε έως <strong>{date}</strong>. Αν διαφωνείτε, πατήστε «Αμφισβήτηση» και περιγράψτε τον λόγο — θα επικοινωνήσουμε μαζί σας.':
      'Please reply by <strong>{date}</strong>. If you disagree, click ‘Dispute’ and describe the reason — we will contact you.',
    'Αποδέχεστε τη χρέωση {amount};': 'Do you accept the charge of {amount}?',
    'Αποδέχομαι τη χρέωση {amount} για «{description}».': 'I accept the charge of {amount} for ‘{description}’.',
    'Αποδοχή': 'Accept',
    'Γιατί διαφωνείτε;': 'Why do you disagree?',
    'Αμφισβήτηση': 'Dispute',
    'Υπόλοιπο προς πληρωμή: <strong>{amount}</strong>': 'Balance due: <strong>{amount}</strong>',
    'Τι να έχετε μαζί σας': 'What to bring',
    'Δίπλωμα οδήγησης (και Διεθνή Άδεια για διπλώματα εκτός ΕΕ)': 'Driving licence (plus an International Driving Permit for licences issued outside the EU)',
    'Ταυτότητα ή διαβατήριο': 'ID card or passport',
    'Πιστωτική κάρτα στο όνομα του οδηγού για την εγγύηση': 'A credit card in the driver’s name for the security deposit',
    'Τον κωδικό κράτησης <strong>{ref}</strong>': 'Your booking reference <strong>{ref}</strong>',
    'Ακύρωση': 'Cancellation',
    'Είμαστε εντός {hours} ωρών πριν την παραλαβή: ισχύει η <strong>χρέωση ακύρωσης {fee}</strong> που γνωστοποιήθηκε στην κράτηση. Θα επιστραφούν <strong>{refund}</strong>.':
      'We are now within {hours} hours of pick-up: the <strong>cancellation charge of {fee}</strong> stated in your booking applies. <strong>{refund}</strong> will be refunded.',
    'Μπορείτε να ακυρώσετε χωρίς χρέωση, επειδή δεν έχετε προπληρώσει.': 'You can cancel free of charge, as you have not paid in advance.',
    'Μπορείτε να ακυρώσετε δωρεάν.': 'You can cancel free of charge.',
    'Το ποσό που πληρώσατε επιστρέφεται αυτόματα στην κάρτα σας.': 'The amount you paid will be refunded to your card automatically.',
    'Θα επικοινωνήσουμε μαζί σας για την επιστροφή του ποσού που πληρώσατε.': 'We will contact you to refund the amount you paid.',
    'Σίγουρα θέλετε να ακυρώσετε την κράτηση;': 'Are you sure you want to cancel this booking?',
    'Αποδέχομαι τη χρέωση ακύρωσης {fee}.': 'I accept the cancellation charge of {fee}.',
    'Ακύρωση κράτησης': 'Cancel booking',

    // --- print.ejs (εκτυπώσιμη επιβεβαίωση) ---
    'Κράτηση {ref}': 'Booking {ref}',
    'Επιβεβαίωση κράτησης <span class="ref">{ref}</span>': 'Booking confirmation <span class="ref">{ref}</span>',
    'Κατάσταση: <strong>{status}</strong>': 'Status: <strong>{status}</strong>',
    '<strong>Εγγύηση {amount}:</strong> δέσμευση (όχι χρέωση) σε πιστωτική κάρτα στο όνομα του κύριου οδηγού, κατά την παραλαβή ή online. Αποδεσμεύεται μετά την επιστροφή.':
      '<strong>Security deposit of {amount}:</strong> a hold (not a charge) on a credit card in the main driver’s name, at pick-up or online. It is released after the car is returned.',
    '<strong>Απαλλαγή ζημιών:</strong> {excess} (μέγιστη συμμετοχή σας σε ζημιές, εκτός από τις εξαιρέσεις των όρων §7).':
      '<strong>Damage excess:</strong> {excess} (the maximum you pay towards damage, except for the exclusions in §7 of the terms).',
    '<strong>Ακύρωση:</strong> δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών (ενοικίαση για συγκεκριμένες ημερομηνίες). Δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή· μετά, ή σε μη εμφάνιση, παρακρατείται {fee} από ό,τι έχετε προπληρώσει (αν πληρώνετε στην παραλαβή, δεν οφείλεται χρέωση).':
      '<strong>Cancellation:</strong> there is no 14-day right of withdrawal (rental for specific dates). Free cancellation up to {hours} hours before pick-up; after that, or in the event of a no-show, {fee} is retained from any amount you have prepaid (if you pay at pick-up, no charge is due).',
    '<strong>Ακύρωση:</strong> δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών (ενοικίαση για συγκεκριμένες ημερομηνίες). Δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή.':
      '<strong>Cancellation:</strong> there is no 14-day right of withdrawal (rental for specific dates). Free cancellation up to {hours} hours before pick-up.',
    'Όροι ενοικίασης έκδοση {version}: {url}': 'Rental terms, version {version}: {url}',
    'Το έγγραφο αυτό δεν αποτελεί φορολογικό παραστατικό. Η απόδειξη/τιμολόγιο εκδίδεται κατά την πληρωμή.':
      'This document is not a receipt or invoice for tax purposes. The receipt/invoice is issued on payment.',
  },
  es: {
    // --- _quote.ejs (ανάλυση τιμής στη φόρμα κράτησης) ---
    'Ενοικίαση (<span data-q="days">{days}</span> ημέρα)': 'Alquiler (<span data-q="days">{days}</span> día)',
    'Ενοικίαση (<span data-q="days">{days}</span> ημέρες)': 'Alquiler (<span data-q="days">{days}</span> días)',
    'Έκπτωση διάρκειας (<span data-q="discountPercent">{percent}</span>%)': 'Descuento por duración (<span data-q="discountPercent">{percent}</span>%)',
    'Χρέωση σημείου ({name})': 'Cargo por ubicación ({name})',
    'Επιστροφή σε διαφορετικό σημείο': 'Devolución en otro lugar',
    'Πρόσθετα': 'Extras',
    'Σύνολο': 'Total',
    'Περιλαμβάνεται ΦΠΑ': 'IVA incluido',
    'Απαλλαγή (συμμετοχή σε ζημιές)': 'Franquicia (importe a su cargo en caso de daños)',
    'Εγγύηση (δέσμευση σε πιστωτική κάρτα — όχι χρέωση)': 'Fianza (bloqueo en tarjeta de crédito, no es un cargo)',

    // --- _precontract.ejs (προσυμβατική ενημέρωση) ---
    'Σημαντικές πληροφορίες πριν την κράτηση': 'Información importante antes de reservar',
    '<strong>Αυτοκίνητο:</strong> {car} ή παρόμοιο της κατηγορίας «{category}». Εγγυόμαστε την κατηγορία, όχι το μοντέλο· αν δεν είναι διαθέσιμη, σας δίνουμε ανώτερη κατηγορία χωρίς χρέωση ή σας επιστρέφουμε όλο το ποσό.':
      '<strong>Coche:</strong> {car} o similar de la categoría «{category}». Garantizamos la categoría, no el modelo; si esa categoría no está disponible, le daremos una categoría superior sin coste adicional o le reembolsaremos el importe íntegro.',
    '<strong>Περιλαμβάνονται:</strong> υποχρεωτική ασφάλιση αστικής ευθύνης έναντι τρίτων, βασική κάλυψη ζημιών του οχήματος (CDW) με απαλλαγή <strong data-q="excessText">{excess}</strong>, {mileage}, ΦΠΑ {vat}%.':
      '<strong>Incluye:</strong> seguro obligatorio de responsabilidad civil frente a terceros, cobertura básica de daños del vehículo (CDW) con una franquicia de <strong data-q="excessText">{excess}</strong>, {mileage}, IVA del {vat}%.',
    'Απεριόριστα χιλιόμετρα': 'Kilometraje ilimitado',
    'Οδική βοήθεια 24/7.': 'Asistencia en carretera 24/7.',
    '<strong>Εγγύηση {amount}:</strong> δέσμευση (όχι χρέωση) σε πιστωτική κάρτα στο όνομα του κύριου οδηγού, στο γραφείο κατά την παραλαβή ή online (ο σύνδεσμος ενεργοποιείται {hours} ώρες πριν την παραλαβή). Χρεωστικές, προπληρωμένες κάρτες και μετρητά δεν γίνονται δεκτά για την εγγύηση. Αποδεσμεύεται μετά την επιστροφή· ο χρόνος εμφάνισης του ποσού εξαρτάται από την τράπεζά σας. Από την εγγύηση αφαιρούνται μόνο οι χρεώσεις του <a href="{url}" target="_blank">τιμοκαταλόγου</a> και, για ζημιά, μόνο με τη συναίνεσή σας και έως την απαλλαγή (εκτός από τις εξαιρέσεις των όρων §7).':
      '<strong>Fianza de {amount}:</strong> bloqueo (no cargo) en una tarjeta de crédito a nombre del conductor principal, en la oficina en el momento de la recogida u online (el enlace se activa {hours} horas antes de la recogida). No se aceptan tarjetas de débito, tarjetas prepago ni efectivo para la fianza. Se libera tras la devolución; el plazo en que el importe vuelve a estar disponible depende de su banco. De la fianza solo se descuentan los cargos de las <a href="{url}" target="_blank">tarifas</a> y, en caso de daños, solo con su consentimiento y hasta el importe de la franquicia (salvo las exclusiones del §7 de las condiciones).',
    '<strong>Καύσιμο:</strong> παραλαβή και επιστροφή με την ίδια στάθμη· αν λείπει: {perLitre}/λίτρο + {fee} τέλος ανεφοδιασμού.':
      '<strong>Combustible:</strong> recogida y devolución con el mismo nivel; si falta combustible, {perLitre}/litro + un cargo por repostaje de {fee}.',
    '<strong>Πλοίο ή εξωτερικό:</strong> μόνο με προηγούμενη γραπτή άδειά μας (<a href="{url}" target="_blank">όροι §6</a>).':
      '<strong>Ferry o extranjero:</strong> solo con nuestra autorización previa por escrito (<a href="{url}" target="_blank">condiciones §6</a>).',
    '<strong>Δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών</strong>, επειδή πρόκειται για ενοικίαση αυτοκινήτου για συγκεκριμένες ημερομηνίες (άρθρο 3ιβ ν. 2251/1994). Ισχύει η πολιτική ακύρωσης: <strong>δωρεάν έως {hours} ώρες πριν την παραλαβή</strong>· μετά, ή σε μη εμφάνιση, παρακρατείται {fee} από ό,τι έχετε προπληρώσει (αν πληρώνετε στην παραλαβή, δεν οφείλεται χρέωση).':
      '<strong>No existe derecho de desistimiento de 14 días</strong>, ya que se trata de un alquiler de coche para fechas concretas (artículo 3ib de la Ley griega 2251/1994). Se aplica la política de cancelación: <strong>gratuita hasta {hours} horas antes de la recogida</strong>; después, o en caso de no presentarse, se retienen {fee} de lo que haya pagado por adelantado (si paga en la recogida, no se le cobrará nada).',
    'Παράπονα': 'Reclamaciones',
    'μέσω της φόρμας επικοινωνίας': 'a través del formulario de contacto',
    'διαδικασία παραπόνων & εξωδικαστική επίλυση': 'procedimiento de reclamación y resolución extrajudicial de conflictos',
    'Εκμισθωτής': 'Arrendador',
    'στοιχεία εταιρείας': 'datos de la empresa',

    // --- _details.ejs (στοιχεία κράτησης: σελίδα κράτησης και εκτύπωση) ---
    'ή παρόμοιο': 'o similar',
    'Παραλαβή': 'Recogida',
    'Επιστροφή': 'Devolución',
    'Οδηγός': 'Conductor',
    'Πτήση/πλοίο': 'Vuelo/ferry',
    'Χρέωση': 'Cargos',
    'Ενοικίαση ({days} ημέρα)': 'Alquiler ({days} día)',
    'Ενοικίαση ({days} ημέρες)': 'Alquiler ({days} días)',
    'Έκπτωση διάρκειας': 'Descuento por duración',
    'Χρεώσεις σημείου': 'Cargos por ubicación',
    'Εγγύηση στην παραλαβή': 'Fianza en la recogida',
    'Τρόπος πληρωμής': 'Forma de pago',
    'Κατάσταση πληρωμής': 'Estado del pago',
    'Επιστράφηκαν': 'Reembolsado',

    // --- new.ejs (φόρμα κράτησης) ---
    'Πίσω': 'Volver',
    'Ολοκλήρωση κράτησης': 'Completar la reserva',
    'Ελέγξτε τα πεδία που επισημαίνονται παρακάτω.': 'Revise los campos señalados a continuación.',
    'Ποσότητα: {name}': 'Cantidad: {name}',
    'Προσθήκη': 'Añadir',
    'Στοιχεία κύριου οδηγού': 'Datos del conductor principal',
    'Έχετε λογαριασμό; <a href="{url}">Συνδεθείτε</a> για να συμπληρωθούν αυτόματα τα στοιχεία σας.':
      '¿Tiene una cuenta? <a href="{url}">Inicie sesión</a> para rellenar sus datos automáticamente.',
    'Όνομα *': 'Nombre *',
    'Επώνυμο *': 'Apellidos *',
    'Κινητό τηλέφωνο *': 'Teléfono móvil *',
    'Ημερομηνία γέννησης *': 'Fecha de nacimiento *',
    'Ελάχιστη ηλικία για αυτό το αυτοκίνητο: {age}': 'Edad mínima para este coche: {age}',
    'Δίπλωμα οδήγησης': 'Permiso de conducir',
    'Αριθμός διπλώματος *': 'Número del permiso de conducir *',
    'Χώρα έκδοσης *': 'País de expedición *',
    'Ελλάδα': 'Grecia',
    'Ημερομηνία έκδοσης *': 'Fecha de expedición *',
    'Αριθμός πτήσης / πλοίου (προαιρετικό)': 'Número de vuelo / ferry (opcional)',
    'π.χ. A3 123': 'p. ej. A3 123',
    'Για να σας περιμένουμε σε περίπτωση καθυστέρησης.': 'Para esperarle en caso de retraso.',
    'Σημειώσεις / ειδικά αιτήματα (προαιρετικό)': 'Observaciones / peticiones especiales (opcional)',
    'Μην αναγράφετε πληροφορίες υγείας ή αριθμούς καρτών.': 'No incluya datos de salud ni números de tarjeta.',
    'Ηλικία και βάρος παιδιού/παιδιών (για παιδικό κάθισμα)': 'Edad y peso del niño o niños (para la silla infantil)',
    'π.χ. 3 ετών, 15 κιλά': 'p. ej. 3 años, 15 kg',
    'Υποχρεωτικό αν επιλέξετε παιδικό κάθισμα, ώστε να σας δώσουμε την κατάλληλη κλάση (ECE R44/R129).':
      'Obligatorio si elige una silla infantil, para que podamos darle el grupo adecuado (ECE R44/R129).',
    'Χρειάζομαι τιμολόγιο (επαγγελματίες)': 'Necesito factura (empresas y profesionales)',
    'Θέλω τιμολόγιο αντί για απόδειξη': 'Deseo factura en lugar de recibo',
    'Επωνυμία': 'Razón social',
    'Διεύθυνση': 'Dirección',
    'ΔΟΥ': 'Delegación de Hacienda (DOY)',
    'Δραστηριότητα': 'Actividad',
    'Πληρωμή': 'Pago',
    'Κάρτα online': 'Pago online con tarjeta',
    'Ασφαλής πληρωμή μέσω {provider} (Visa, Mastercard, Apple Pay, Google Pay).': 'Pago seguro a través de {provider} (Visa, Mastercard, Apple Pay, Google Pay).',
    'Πληρωμή κατά την παραλαβή': 'Pago en la recogida',
    'Χρεωστική ή πιστωτική κάρτα, IRIS ή μετρητά έως {amount}.': 'Tarjeta de débito o crédito, IRIS o efectivo hasta {amount}.',
    'Έχω διαβάσει και αποδέχομαι τους <a href="{url}" target="_blank">όρους ενοικίασης</a> (έκδοση {version}). *':
      'He leído y acepto las <a href="{url}" target="_blank">condiciones de alquiler</a> (versión {version}). *',
    'Πώς χρησιμοποιούμε τα στοιχεία σας: <a href="{url}" target="_blank">Πολιτική απορρήτου</a>.':
      'Cómo utilizamos sus datos: <a href="{url}" target="_blank">Política de privacidad</a>.',
    '{seats} θέσεις': '{seats} plazas',
    'Αλλαγή ημερομηνιών ή σημείων': 'Cambiar fechas o lugares',
    'Ελέγξτε τα στοιχεία σας· μπορείτε να τα διορθώσετε πριν την υποβολή.': 'Revise sus datos; puede corregirlos antes de enviar la reserva.',
    // Υποχρεωτική διατύπωση του κουμπιού παραγγελίας (ν. 2251/1994, οδηγία 2011/83/ΕΕ άρθ. 8 παρ. 2).
    'Κράτηση με υποχρέωση πληρωμής': 'Reservar con obligación de pago',
    'Θα μεταφερθείτε στην ασφαλή σελίδα πληρωμής ({provider}). Η κράτηση ολοκληρώνεται με την επιτυχή πληρωμή.':
      'Se le redirigirá a la página de pago seguro ({provider}). La reserva se completa una vez realizado el pago correctamente.',
    'Η πληρωμή γίνεται κατά την παραλαβή.': 'El pago se realiza en la recogida.',
    'Δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών. Δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή.':
      'No existe derecho de desistimiento de 14 días. Cancelación gratuita hasta {hours} horas antes de la recogida.',

    // --- show.ejs (σελίδα κράτησης) ---
    'Κράτηση <span class="ref">{ref}</span>': 'Reserva <span class="ref">{ref}</span>',
    'Εκτύπωση': 'Imprimir',
    'Η κράτηση δεν έχει ολοκληρωθεί — εκκρεμεί η πληρωμή.': 'La reserva no se ha completado: el pago está pendiente.',
    'Το αυτοκίνητο είναι δεσμευμένο για εσάς έως τις <strong>{time}</strong>.': 'El coche queda reservado para usted hasta las <strong>{time}</strong>.',
    'Πληρωμή {amount}': 'Pagar {amount}',
    'Η κράτηση έληξε επειδή δεν ολοκληρώθηκε η πληρωμή. <a href="{url}">Κάντε νέα αναζήτηση</a>.':
      'La reserva ha caducado porque no se completó el pago. <a href="{url}">Haga una nueva búsqueda</a>.',
    'Η κράτησή σας είναι επιβεβαιωμένη. Σας περιμένουμε στις <strong>{date}</strong> στο σημείο «{location}».':
      'Su reserva está confirmada. Le esperamos el <strong>{date}</strong> en «{location}».',
    'Επιστροφή {amount} στην κάρτα σας είναι σε εξέλιξη.': 'Se está tramitando el reembolso de {amount} a su tarjeta.',
    'Εγγύηση': 'Fianza',
    'κάρτα •••• {last4}': 'tarjeta •••• {last4}',
    'Παρακρατήθηκαν {captured}, αποδεσμεύτηκαν {released}.': 'Descontado de la fianza: {captured}; liberado: {released}.',
    'Χρεώσεις μετά την επιστροφή': 'Cargos tras la devolución',
    'Ποσό': 'Importe',
    'Κατάσταση': 'Estado',
    'Τεκμηρίωση': 'Documentación',
    'εξοφλήθηκαν {amount}': 'pagado: {amount}',
    'Παρακαλούμε απαντήστε έως <strong>{date}</strong>. Αν διαφωνείτε, πατήστε «Αμφισβήτηση» και περιγράψτε τον λόγο — θα επικοινωνήσουμε μαζί σας.':
      'Le rogamos que responda a más tardar el <strong>{date}</strong>. Si no está de acuerdo, pulse «Impugnar» y explique el motivo; nos pondremos en contacto con usted.',
    'Αποδέχεστε τη χρέωση {amount};': '¿Acepta el cargo de {amount}?',
    'Αποδέχομαι τη χρέωση {amount} για «{description}».': 'Acepto el cargo de {amount} por «{description}».',
    'Αποδοχή': 'Aceptar',
    'Γιατί διαφωνείτε;': '¿Por qué no está de acuerdo?',
    'Αμφισβήτηση': 'Impugnar',
    'Υπόλοιπο προς πληρωμή: <strong>{amount}</strong>': 'Importe pendiente de pago: <strong>{amount}</strong>',
    'Τι να έχετε μαζί σας': 'Qué debe traer',
    'Δίπλωμα οδήγησης (και Διεθνή Άδεια για διπλώματα εκτός ΕΕ)': 'Permiso de conducir (y Permiso Internacional de Conducción si su permiso se expidió fuera de la UE)',
    'Ταυτότητα ή διαβατήριο': 'Documento de identidad o pasaporte',
    'Πιστωτική κάρτα στο όνομα του οδηγού για την εγγύηση': 'Una tarjeta de crédito a nombre del conductor para la fianza',
    'Τον κωδικό κράτησης <strong>{ref}</strong>': 'Su código de reserva <strong>{ref}</strong>',
    'Ακύρωση': 'Cancelación',
    'Είμαστε εντός {hours} ωρών πριν την παραλαβή: ισχύει η <strong>χρέωση ακύρωσης {fee}</strong> που γνωστοποιήθηκε στην κράτηση. Θα επιστραφούν <strong>{refund}</strong>.':
      'Faltan menos de {hours} horas para la recogida: se aplica el <strong>cargo por cancelación de {fee}</strong> indicado en la reserva. Se le reembolsarán <strong>{refund}</strong>.',
    'Μπορείτε να ακυρώσετε χωρίς χρέωση, επειδή δεν έχετε προπληρώσει.': 'Puede cancelar sin cargo, ya que no ha pagado por adelantado.',
    'Μπορείτε να ακυρώσετε δωρεάν.': 'Puede cancelar gratuitamente.',
    'Το ποσό που πληρώσατε επιστρέφεται αυτόματα στην κάρτα σας.': 'El importe pagado se le reembolsará automáticamente en su tarjeta.',
    'Θα επικοινωνήσουμε μαζί σας για την επιστροφή του ποσού που πληρώσατε.': 'Nos pondremos en contacto con usted para reembolsarle el importe pagado.',
    'Σίγουρα θέλετε να ακυρώσετε την κράτηση;': '¿Está seguro de que desea cancelar la reserva?',
    'Αποδέχομαι τη χρέωση ακύρωσης {fee}.': 'Acepto el cargo por cancelación de {fee}.',
    'Ακύρωση κράτησης': 'Cancelar la reserva',

    // --- print.ejs (εκτυπώσιμη επιβεβαίωση) ---
    'Κράτηση {ref}': 'Reserva {ref}',
    'Επιβεβαίωση κράτησης <span class="ref">{ref}</span>': 'Confirmación de reserva <span class="ref">{ref}</span>',
    'Κατάσταση: <strong>{status}</strong>': 'Estado: <strong>{status}</strong>',
    '<strong>Εγγύηση {amount}:</strong> δέσμευση (όχι χρέωση) σε πιστωτική κάρτα στο όνομα του κύριου οδηγού, κατά την παραλαβή ή online. Αποδεσμεύεται μετά την επιστροφή.':
      '<strong>Fianza de {amount}:</strong> bloqueo (no cargo) en una tarjeta de crédito a nombre del conductor principal, en la recogida u online. Se libera tras la devolución.',
    '<strong>Απαλλαγή ζημιών:</strong> {excess} (μέγιστη συμμετοχή σας σε ζημιές, εκτός από τις εξαιρέσεις των όρων §7).':
      '<strong>Franquicia por daños:</strong> {excess} (importe máximo a su cargo por daños, salvo las exclusiones del §7 de las condiciones).',
    '<strong>Ακύρωση:</strong> δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών (ενοικίαση για συγκεκριμένες ημερομηνίες). Δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή· μετά, ή σε μη εμφάνιση, παρακρατείται {fee} από ό,τι έχετε προπληρώσει (αν πληρώνετε στην παραλαβή, δεν οφείλεται χρέωση).':
      '<strong>Cancelación:</strong> no existe derecho de desistimiento de 14 días (alquiler para fechas concretas). Cancelación gratuita hasta {hours} horas antes de la recogida; después, o en caso de no presentarse, se retienen {fee} de lo que haya pagado por adelantado (si paga en la recogida, no se le cobrará nada).',
    '<strong>Ακύρωση:</strong> δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών (ενοικίαση για συγκεκριμένες ημερομηνίες). Δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή.':
      '<strong>Cancelación:</strong> no existe derecho de desistimiento de 14 días (alquiler para fechas concretas). Cancelación gratuita hasta {hours} horas antes de la recogida.',
    'Όροι ενοικίασης έκδοση {version}: {url}': 'Condiciones de alquiler, versión {version}: {url}',
    'Το έγγραφο αυτό δεν αποτελεί φορολογικό παραστατικό. Η απόδειξη/τιμολόγιο εκδίδεται κατά την πληρωμή.':
      'Este documento no es un comprobante fiscal. El recibo o la factura se emite en el momento del pago.',
  },
};
