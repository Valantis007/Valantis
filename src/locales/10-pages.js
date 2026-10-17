'use strict';

// Δημόσιες σελίδες: αρχική, στόλος, αυτοκίνητο, συχνές ερωτήσεις, επικοινωνία, στοιχεία εταιρείας,
// παράπονα, «Η κράτησή μου», εγγύηση, σελίδα σφάλματος και τα partials search-form, car-specs,
// payment-means. Περιλαμβάνει και τους τίτλους / τα μηνύματα που στέλνουν οι routes σε αυτές τις σελίδες.
// Κλειδί: το ακριβές ελληνικό κείμενο. Τιμή: η μετάφραση. Τα {όνομα} και τα HTML tags μένουν όπως είναι.

module.exports = {
  en: {
    // ---------- views/pages/home.ejs ----------
    'Ενοικίαση αυτοκινήτου, απλά και με διαφάνεια': 'Car rental, simple and transparent',
    'Δείτε την τελική τιμή πριν κλείσετε. Χωρίς κρυφές χρεώσεις, με δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή.':
      'See the final price before you book. No hidden charges, and free cancellation up to {hours} hours before pick-up.',
    'Τελική τιμή από την αρχή': 'The final price from the start',
    'Η τιμή που βλέπετε περιλαμβάνει ΦΠΑ, υποχρεωτική ασφάλιση αστικής ευθύνης και βασική κάλυψη ζημιών (CDW). Χωρίς κρυφές χρεώσεις.':
      'The price you see includes VAT, compulsory third-party liability insurance and basic damage cover (CDW). No hidden charges.',
    'Δωρεάν ακύρωση': 'Free cancellation',
    'Ακυρώστε online έως {hours} ώρες πριν και παίρνετε πίσω όλο το ποσό.': 'Cancel online up to {hours} hours in advance and get the full amount back.',
    'Ασφαλής πληρωμή': 'Secure payment',
    'Πληρώστε online με κάρτα μέσω {provider} ή κατά την παραλαβή του αυτοκινήτου. Καμία επιβάρυνση για τον τρόπο πληρωμής.':
      'Pay online by card via {provider} or when you pick up the car. No surcharge for any payment method.',
    'Πληρώστε κατά την παραλαβή του αυτοκινήτου. Καμία επιβάρυνση για τον τρόπο πληρωμής.': 'Pay when you pick up the car. No surcharge for any payment method.',
    'Παράδοση όπου βρίσκεστε': 'Delivered where you are',
    'Παραλαβή από γραφείο, αεροδρόμιο, λιμάνι ή παράδοση στο ξενοδοχείο σας.': 'Pick up at our office, the airport or the port, or have the car delivered to your hotel.',
    'Ο στόλος μας': 'Our fleet',
    'Όλα τα αυτοκίνητα →': 'All cars →',
    'ή παρόμοιο': 'or similar',
    'από <strong>{price}</strong> / ημέρα': 'from <strong>{price}</strong> / day',
    'Πώς λειτουργεί': 'How it works',
    '<strong>Αναζήτηση</strong><span>Επιλέξτε ημερομηνίες και σημεία παραλαβής/επιστροφής.</span>': '<strong>Search</strong><span>Choose your dates and pick-up/return locations.</span>',
    '<strong>Επιλογή</strong><span>Διαλέξτε αυτοκίνητο και πρόσθετα — βλέπετε αμέσως την τελική τιμή.</span>':
      '<strong>Choose</strong><span>Select a car and extras — you see the final price straight away.</span>',
    '<strong>Κράτηση</strong><span>Συμπληρώστε τα στοιχεία οδηγού και λάβετε άμεσα επιβεβαίωση με email.</span>':
      "<strong>Book</strong><span>Enter the driver's details and receive instant confirmation by email.</span>",
    '<strong>Παραλαβή</strong><span>Φέρτε δίπλωμα, ταυτότητα/διαβατήριο και πιστωτική κάρτα για την εγγύηση.</span>':
      '<strong>Pick up</strong><span>Bring your driving licence, ID card/passport and a credit card for the security deposit.</span>',

    // ---------- views/partials/search-form.ejs ----------
    'Σημείο παραλαβής': 'Pick-up location',
    'Επιλέξτε...': 'Select...',
    'Σημείο επιστροφής': 'Return location',
    'Ίδιο με παραλαβή': 'Same as pick-up',
    'Παραλαβή': 'Pick-up',
    'Ώρα παραλαβής': 'Pick-up time',
    'Επιστροφή': 'Return',
    'Ώρα επιστροφής': 'Return time',
    'Αναζήτηση': 'Search',
    // Σφάλματα αναζήτησης (src/lib/search.js) που εμφανίζει η φόρμα
    'Επιλέξτε σημείο παραλαβής.': 'Please choose a pick-up location.',
    'Επιλέξτε σημείο επιστροφής.': 'Please choose a return location.',
    'Επιλέξτε έγκυρη ημερομηνία και ώρα παραλαβής.': 'Please choose a valid pick-up date and time.',
    'Επιλέξτε έγκυρη ημερομηνία και ώρα επιστροφής.': 'Please choose a valid return date and time.',
    'Η επιστροφή πρέπει να είναι μετά την παραλαβή.': 'The return must be after the pick-up.',

    // ---------- views/partials/car-specs.ejs ----------
    'Θέσεις': 'Seats',
    '{n} θέσεις': '{n} seats',
    'Κιβώτιο': 'Gearbox',
    'Καύσιμο': 'Fuel',
    'Αποσκευές': 'Luggage',
    '{n} βαλίτσα': '{n} bag',
    '{n} βαλίτσες': '{n} bags',
    'Πόρτες': 'Doors',
    '{n} πόρτες': '{n} doors',
    'Κλιματισμός': 'Air conditioning',

    // ---------- views/partials/payment-means.ejs ----------
    'Τρόποι πληρωμής:': 'Payment methods:',
    'online με κάρτα (Visa, Mastercard, Apple Pay, Google Pay) μέσω {provider}, ή κατά την παραλαβή με χρεωστική/πιστωτική κάρτα, IRIS ή μετρητά έως {cash}.':
      'online by card (Visa, Mastercard, Apple Pay, Google Pay) via {provider}, or at pick-up by debit/credit card, IRIS or cash up to {cash}.',
    'κατά την παραλαβή με χρεωστική/πιστωτική κάρτα, IRIS ή μετρητά έως {cash}.': 'at pick-up by debit/credit card, IRIS or cash up to {cash}.',
    'Καμία επιβάρυνση για τον τρόπο πληρωμής.': 'No surcharge for any payment method.',
    'Εγγύηση:': 'Security deposit:',
    'μόνο πιστωτική κάρτα στο όνομα του κύριου οδηγού — χρεωστικές και προπληρωμένες κάρτες δεν γίνονται δεκτές για την εγγύηση.':
      "credit card in the main driver's name only — debit and prepaid cards are not accepted for the deposit.",

    // ---------- views/pages/cars.ejs ----------
    'Διαθέσιμα αυτοκίνητα': 'Available cars',
    'Ενημέρωση': 'Update',
    'Φίλτρα': 'Filters',
    'Κατηγορία': 'Category',
    'Όλες': 'All',
    'Όλα': 'Any',
    'Χειροκίνητο': 'Manual',
    'Αυτόματο': 'Automatic',
    'Θέσεις (τουλάχιστον)': 'Seats (minimum)',
    'Ταξινόμηση': 'Sort by',
    'Τιμή: χαμηλή → υψηλή': 'Price: low → high',
    'Τιμή: υψηλή → χαμηλή': 'Price: high → low',
    'Περισσότερες θέσεις': 'Most seats',
    'Εφαρμογή': 'Apply',
    '<strong>{count}</strong> διαθέσιμο αυτοκίνητο': '<strong>{count}</strong> car available',
    '<strong>{count}</strong> διαθέσιμα αυτοκίνητα': '<strong>{count}</strong> cars available',
    'για <strong>{days} ημέρα</strong>': 'for <strong>{days} day</strong>',
    'για <strong>{days} ημέρες</strong>': 'for <strong>{days} days</strong>',
    '{n} δεν είναι διαθέσιμα': '{n} not available',
    'Επιλέξτε σημείο και ημερομηνίες για να δείτε διαθεσιμότητα και τελικές τιμές.': 'Choose a location and dates to see availability and final prices.',
    'Δεν βρέθηκαν διαθέσιμα αυτοκίνητα': 'No cars available',
    'Δοκιμάστε διαφορετικές ημερομηνίες ή αφαιρέστε κάποιο φίλτρο.': 'Try different dates or remove a filter.',
    'Ελάχιστη ηλικία οδηγού {age}': 'Minimum driver age {age}',
    'Απεριόριστα χιλιόμετρα': 'Unlimited mileage',
    'Απαλλαγή {amount}': 'Excess {amount}',
    'Εγγύηση {amount} (πιστωτική κάρτα)': 'Deposit {amount} (credit card)',
    'σύνολο για {n} ημέρα': 'total for {n} day',
    'σύνολο για {n} ημέρες': 'total for {n} days',
    '{price} / ημέρα': '{price} / day',
    '-{percent}% έκπτωση διάρκειας': '-{percent}% long-rental discount',
    'Κράτηση': 'Book',
    'από {price}': 'from {price}',
    'ανά ημέρα': 'per day',
    'Λεπτομέρειες': 'Details',

    // ---------- views/pages/car.ejs ----------
    '← Πίσω στα αποτελέσματα': '← Back to results',
    'Περιλαμβάνονται στην τιμή': 'Included in the price',
    'Υποχρεωτική ασφάλιση αστικής ευθύνης (έναντι τρίτων)': 'Compulsory third-party liability insurance',
    'Βασική κάλυψη ζημιών (CDW) — απαλλαγή {amount} (0 € με την Πλήρη Απαλλαγή FDW)':
      'Basic damage cover (CDW) — excess {amount} (€0 with the Full Damage Waiver, FDW)',
    'Οδική βοήθεια 24/7': '24/7 roadside assistance',
    'ΦΠΑ {vat}%': '{vat}% VAT',
    'Απαιτήσεις': 'Requirements',
    'Ελάχιστη ηλικία οδηγού: {age} ετών': 'Minimum driver age: {age} years',
    'Δίπλωμα οδήγησης τουλάχιστον {years} έτους': 'Driving licence held for at least {years} year',
    'Εγγύηση {amount}: δέσμευση (όχι χρέωση) σε <strong>πιστωτική</strong> κάρτα στο όνομα του κύριου οδηγού — όχι χρεωστική ή προπληρωμένη':
      "Security deposit of {amount}: a hold (not a charge) on a <strong>credit</strong> card in the main driver's name — not a debit or prepaid card",
    'Τιμή & διαθεσιμότητα': 'Price & availability',
    'Έλεγχος διαθεσιμότητας': 'Check availability',
    'Το αυτοκίνητο δεν είναι διαθέσιμο για αυτές τις ημερομηνίες. <a href="{url}">Δείτε διαθέσιμα αυτοκίνητα</a>.':
      'This car is not available for these dates. <a href="{url}">See available cars</a>.',
    'Συνέχεια στην κράτηση': 'Continue to booking',

    // ---------- views/pages/faq.ejs ----------
    'Τι χρειάζομαι για να παραλάβω το αυτοκίνητο;': 'What do I need to pick up the car?',
    'Δίπλωμα οδήγησης σε ισχύ (τουλάχιστον {years} έτους), ταυτότητα ή διαβατήριο και πιστωτική κάρτα στο όνομα του οδηγού για την εγγύηση. Για διπλώματα εκτός ΕΕ μπορεί να χρειαστεί Διεθνής Άδεια Οδήγησης.':
      "A valid driving licence (held for at least {years} year), an ID card or passport, and a credit card in the driver's name for the security deposit. If your licence was issued outside the EU, you may need an International Driving Permit.",
    'Η τιμή που βλέπω είναι η τελική;': 'Is the price I see the final price?',
    'Ναι. Περιλαμβάνει ΦΠΑ, υποχρεωτική ασφάλιση αστικής ευθύνης, βασική κάλυψη ζημιών (CDW) με απαλλαγή, τα χιλιόμετρα που αναγράφονται σε κάθε αυτοκίνητο και τυχόν χρεώσεις σημείου παραλαβής. Επιπλέον χρεώνονται μόνο τα πρόσθετα που επιλέγετε και, μετά την επιστροφή, μόνο οι χρεώσεις του <a href="{url}">τιμοκαταλόγου</a> (π.χ. καύσιμο που λείπει).':
      'Yes. It includes VAT, compulsory third-party liability insurance, basic damage cover (CDW) with an excess, the mileage stated for each car and any pick-up location charges. The only additional charges are the extras you choose and, after the return, only the charges in our <a href="{url}">price list</a> (e.g. missing fuel).',
    'Πώς υπολογίζονται οι ημέρες;': 'How are rental days calculated?',
    'Ανά 24ωρο από την ώρα παραλαβής. Π.χ. παραλαβή Δευτέρα 10:00 και επιστροφή Τετάρτη 10:00 = 2 ημέρες. Έχετε περιθώριο {minutes} λεπτών χωρίς επιπλέον χρέωση.':
      'Per 24-hour period from the pick-up time. For example, pick-up on Monday at 10:00 and return on Wednesday at 10:00 = 2 days. You have a grace period of {minutes} minutes at no extra charge.',
    'Μπορώ να ακυρώσω την κράτηση;': 'Can I cancel my booking?',
    'Ναι, δωρεάν έως {hours} ώρες πριν την παραλαβή, από τη σελίδα <a href="{url}">«Η κράτησή μου»</a>· αν πληρώσατε με κάρτα, το ποσό επιστρέφεται αυτόματα. Μετά το όριο αυτό (ή σε μη εμφάνιση) παρακρατείται η χρέωση ακύρωσης που αναγράφεται στην κράτησή σας. Δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών, επειδή η ενοικίαση αφορά συγκεκριμένες ημερομηνίες.':
      'Yes, free of charge up to {hours} hours before pick-up, from the <a href="{url}">‘My booking’</a> page; if you paid by card, the amount is refunded automatically. After this deadline (or in the event of a no-show), the cancellation charge stated in your booking is retained. There is no 14-day right of withdrawal, because the rental is for specific dates.',
    'Τι είναι η εγγύηση;': 'What is the security deposit?',
    'Ένα ποσό που δεσμεύεται (δεν χρεώνεται) σε <strong>πιστωτική</strong> κάρτα στο όνομα του κύριου οδηγού (όχι χρεωστική ή προπληρωμένη), στο γραφείο ή online πριν την παραλαβή. Αποδεσμεύεται μετά την επιστροφή· ο χρόνος εμφάνισης του ποσού εξαρτάται από την τράπεζά σας. Από την εγγύηση αφαιρούνται μόνο οι χρεώσεις του τιμοκαταλόγου και, για ζημιά, μόνο με τη συναίνεσή σας. Με την «Πλήρη Απαλλαγή (FDW)» η συμμετοχή σας σε ζημιές μηδενίζεται· το ποσό της εγγύησης δεν αλλάζει.':
      "An amount that is held (not charged) on a <strong>credit</strong> card in the main driver's name (not a debit or prepaid card), at our office or online before pick-up. It is released after the return; how long it takes for the amount to show as available depends on your bank. Only charges from the price list are deducted from the deposit and, for damage, only with your consent. With the ‘Full Damage Waiver (FDW)’ your excess for damage is reduced to zero; the deposit amount does not change.",
    'Μπορεί να οδηγεί και δεύτερο άτομο;': 'Can a second person drive too?',
    'Ναι, προσθέστε «Επιπλέον οδηγό» στην κράτηση. Θα πρέπει να είναι παρών στην παραλαβή με το δίπλωμά του.':
      'Yes, add an ‘Additional driver’ to your booking. They must be present at pick-up with their driving licence.',
    'Μπορώ να πάρω το αυτοκίνητο σε νησί;': 'Can I take the car to an island?',
    'Μόνο με γραπτή άδειά μας. Επικοινωνήστε μαζί μας πριν την κράτηση.': 'Only with our written permission. Please contact us before booking.',
    'Τι γίνεται αν καθυστερήσει η πτήση μου;': 'What if my flight is delayed?',
    'Δηλώστε τον αριθμό πτήσης στην κράτηση ώστε να παρακολουθούμε την άφιξή σας και να σας περιμένουμε.':
      'Enter your flight number in the booking so that we can track your arrival and wait for you.',
    'Ποιους τρόπους πληρωμής δέχεστε;': 'Which payment methods do you accept?',
    'Πώς υποβάλλω παράπονο;': 'How do I make a complaint?',
    'Από τη σελίδα <a href="{url}">«Παράπονα & επίλυση διαφορών»</a>. Επιβεβαιώνουμε τη λήψη εντός 2 εργάσιμων και απαντάμε αιτιολογημένα εντός 15 ημερών.':
      'From the <a href="{url}">‘Complaints &amp; dispute resolution’</a> page. We acknowledge receipt within 2 working days and send a reasoned reply within 15 days.',

    // ---------- views/pages/contact.ejs ----------
    'Είμαστε στη διάθεσή σας για κάθε ερώτηση σχετικά με κρατήσεις, τιμές ή ειδικά αιτήματα.':
      'We are happy to help with any question about bookings, prices or special requests.',
    'Τηλέφωνο:': 'Phone:',
    'Διεύθυνση:': 'Address:',
    'Ωράριο:': 'Opening hours:',
    'καθημερινά {from} - {to}': 'daily {from} - {to}',
    'Ιστοσελίδα': 'Website',
    'Ονοματεπώνυμο': 'Full name',
    'Τηλέφωνο (προαιρετικό)': 'Phone (optional)',
    'Είδος': 'Type of message',
    'Ερώτηση': 'Question',
    'Παράπονο': 'Complaint',
    'Αμφισβήτηση χρέωσης': 'Charge dispute',
    'Κωδικός κράτησης (αν υπάρχει)': 'Booking reference (if any)',
    'Θέμα': 'Subject',
    'Μήνυμα': 'Message',
    'Τα στοιχεία σας χρησιμοποιούνται μόνο για να απαντήσουμε στο μήνυμά σας.': 'Your details are used only to reply to your message.',
    'Πολιτική απορρήτου': 'Privacy policy',
    'Αποστολή': 'Send',
    // Μηνύματα από src/routes/public.js (POST /contact)
    'Συμπληρώστε το όνομά σας.': 'Please enter your name.',
    'Συμπληρώστε έγκυρο email.': 'Please enter a valid email address.',
    'Συμπληρώστε θέμα.': 'Please enter a subject.',
    'Γράψτε το μήνυμά σας (τουλάχιστον 10 χαρακτήρες).': 'Please write your message (at least 10 characters).',
    'Λάβαμε το μήνυμά σας. Θα σας απαντήσουμε το συντομότερο.': 'We have received your message. We will reply as soon as possible.',
    'Λάβαμε το μήνυμά σας. Θα σας απαντήσουμε αιτιολογημένα εντός 15 ημερών.': 'We have received your message. We will send you a reasoned reply within 15 days.',

    // ---------- views/pages/company.ejs ----------
    'Επωνυμία': 'Company name',
    'Διακριτικός τίτλος': 'Trading name',
    'Έδρα': 'Registered office',
    'Γραφείο': 'Office',
    'ΑΦΜ / VAT': 'VAT number',
    'Αρ. Μητρώου ΜΗΤΕ': 'Tourism registration no. (MHTE)',
    'Αρμόδια αρχή': 'Competent authority',
    'Τηλέφωνο': 'Phone',

    // ---------- views/pages/complaints.ejs ----------
    'Αν δεν είστε ικανοποιημένοι από την εξυπηρέτησή μας ή διαφωνείτε με μια χρέωση, πείτε μας:':
      'If you are not satisfied with our service or disagree with a charge, please let us know:',
    'με τη <a href="{url}">φόρμα παραπόνων</a> (επιλέξτε «Παράπονο» ή «Αμφισβήτηση χρέωσης» και γράψτε τον κωδικό κράτησης),':
      'using the <a href="{url}">complaints form</a> (choose ‘Complaint’ or ‘Charge dispute’ and enter your booking reference),',
    'με email στο <a href="mailto:{email}">{email}</a>,': 'by email to <a href="mailto:{email}">{email}</a>,',
    'τηλεφωνικά στο {phone},': 'by phone on {phone},',
    'ή στο γραφείο μας ({address}).': 'or at our office ({address}).',
    'ή στο γραφείο μας.': 'or at our office.',
    'Επιβεβαιώνουμε τη λήψη εντός 2 εργάσιμων ημερών και απαντάμε αιτιολογημένα εντός 15 ημερών.':
      'We acknowledge receipt within 2 working days and send a reasoned reply within 15 days.',
    'Για χρεώσεις ζημιάς μπορείτε επίσης να απαντήσετε (αποδοχή ή αμφισβήτηση) απευθείας από τη σελίδα <a href="{url}">«Η κράτησή μου»</a>.':
      'For damage charges you can also respond (accept or dispute) directly from the <a href="{url}">‘My booking’</a> page.',
    'Εξωδικαστική επίλυση': 'Out-of-court dispute resolution',
    'Αν δεν βρεθεί λύση, μπορείτε να απευθυνθείτε στον <strong>Συνήγορο του Καταναλωτή</strong> (www.synigoroskatanaloti.gr), φορέα Εναλλακτικής Επίλυσης Διαφορών.':
      'If no solution is found, you may refer the matter to the <strong>Greek Consumer Ombudsman</strong> (www.synigoroskatanaloti.gr), an Alternative Dispute Resolution body.',
    'Η εταιρεία δεσμεύεται να συμμετέχει στη διαδικασία.': 'The company is committed to taking part in the procedure.',
    'Η εταιρεία εξετάζει κατά περίπτωση τη συμμετοχή της στη διαδικασία.': 'The company decides on a case-by-case basis whether to take part in the procedure.',
    'Καταναλωτές από άλλα κράτη της ΕΕ μπορούν να ζητήσουν συνδρομή από το Ευρωπαϊκό Κέντρο Καταναλωτή Ελλάδας (www.eccgreece.gr).':
      'Consumers from other EU countries can seek assistance from the European Consumer Centre Greece (www.eccgreece.gr).',

    // ---------- views/pages/manage.ejs ----------
    'Διαχείριση κράτησης': 'Manage booking',
    'Συμπληρώστε τον κωδικό κράτησης (θα τον βρείτε στο email επιβεβαίωσης) και το email που δηλώσατε.':
      'Enter your booking reference (you will find it in the confirmation email) and the email address you gave us.',
    'Κωδικός κράτησης': 'Booking reference',
    'π.χ. {example}': 'e.g. {example}',
    'Εύρεση κράτησης': 'Find booking',
    'Έχετε λογαριασμό; <a href="{url}">Συνδεθείτε</a> για να δείτε όλες τις κρατήσεις σας.': 'Have an account? <a href="{url}">Log in</a> to see all your bookings.',
    // Μήνυμα από src/routes/public.js (POST /manage)
    'Δεν βρέθηκε κράτηση με αυτά τα στοιχεία. Ελέγξτε τον κωδικό και το email.':
      'No booking was found with these details. Please check the booking reference and email address.',

    // ---------- views/pages/deposit.ejs ----------
    'Εγγύηση ενοικίασης': 'Rental security deposit',
    'Κράτηση <span class="ref">{ref}</span>': 'Booking <span class="ref">{ref}</span>',
    '<strong>Τι σημαίνει η εγγύηση:</strong> το ποσό <strong>δεσμεύεται</strong> (δεν χρεώνεται) στην πιστωτική σας κάρτα για όσο διαρκεί η ενοικίαση.':
      '<strong>What the security deposit means:</strong> the amount is <strong>held</strong> (not charged) on your credit card for the duration of the rental.',
    'Γίνονται δεκτές <strong>μόνο πιστωτικές κάρτες</strong> στο όνομα του οδηγού. Χρεωστικές και προπληρωμένες κάρτες απορρίπτονται αυτόματα.':
      "<strong>Only credit cards</strong> in the driver's name are accepted. Debit and prepaid cards are declined automatically.",
    'Μετά την επιστροφή του αυτοκινήτου το ποσό <strong>αποδεσμεύεται χωρίς καθυστέρηση</strong>. Η τράπεζά σας μπορεί να χρειαστεί λίγες ημέρες για να το εμφανίσει ως διαθέσιμο.':
      'Once the car has been returned, the amount is <strong>released without delay</strong>. Your bank may take a few days to show it as available.',
    'Από την εγγύηση μπορεί να αφαιρεθούν <strong>μόνο</strong> οι χρεώσεις του <a href="{url}" target="_blank">τιμοκαταλόγου</a>, με αναλυτικό email για καθεμία: καύσιμο που λείπει ({fuel}/λίτρο + {refuel}), καθυστέρηση επιστροφής (μίσθωμα ημέρας), ειδικός καθαρισμός (έως {cleaning}), διαχείριση προστίμου ({fines} ανά πρόστιμο), χαμένο κλειδί ({key}).':
      "<strong>Only</strong> the charges in our <a href=\"{url}\" target=\"_blank\">price list</a> may be deducted from the deposit, with an itemised email for each one: missing fuel ({fuel}/litre + {refuel}), late return (one day's rental), special cleaning (up to {cleaning}), handling of a fine ({fines} per fine), lost key ({key}).",
    'Χρέωση για <strong>ζημιά</strong> ή οποιαδήποτε άλλη χρέωση γίνεται μόνο με τη συναίνεσή σας, και για ζημιά έως την απαλλαγή σας ({excess}), εκτός από τις εξαιρέσεις των όρων (§7). Θα λάβετε τεκμηρίωση και θα μπορείτε να την αμφισβητήσετε.':
      'A charge for <strong>damage</strong>, or any other charge, is made only with your consent and, for damage, up to your excess ({excess}), except for the exclusions set out in the terms (§7). You will receive supporting evidence and will be able to dispute it.',
    'Η έγκριση της εγγύησης γίνεται από <strong>{from}</strong> έως την επιστροφή του αυτοκινήτου.':
      'You can authorise the security deposit from <strong>{from}</strong> until the car is returned.',
    'Συμφωνώ να δεσμευτεί το ποσό <strong>{amount}</strong> στην πιστωτική μου κάρτα ως εγγύηση για την κράτηση {ref}, σύμφωνα με τους <a href="{url}" target="_blank">όρους ενοικίασης</a>.':
      'I agree to a hold of <strong>{amount}</strong> on my credit card as a security deposit for booking {ref}, in accordance with the <a href="{url}" target="_blank">rental terms</a>.',
    'Συνέχεια στην ασφαλή σελίδα πληρωμής': 'Continue to the secure payment page',
    'Τα στοιχεία της κάρτας σας τα καταχωρείτε στην ασφαλή σελίδα του παρόχου πληρωμών ({provider}). Δεν τα βλέπουμε και δεν τα αποθηκεύουμε.':
      'You enter your card details on the secure page of the payment provider ({provider}). We do not see or store them.',
    'Η εγγύηση <strong>{amount}</strong> δεσμεύτηκε επιτυχώς στην κάρτα •••• {last4}. Ευχαριστούμε!':
      'The security deposit of <strong>{amount}</strong> has been successfully held on card •••• {last4}. Thank you!',
    'Η εγγύηση <strong>{amount}</strong> δεσμεύτηκε επιτυχώς. Ευχαριστούμε!': 'The security deposit of <strong>{amount}</strong> has been successfully held. Thank you!',
    'Θα αποδεσμευτεί μετά την επιστροφή του αυτοκινήτου. Μπορείτε να δείτε την κράτησή σας από τη σελίδα <a href="{url}">«Η κράτησή μου»</a>.':
      'It will be released after the car is returned. You can view your booking from the <a href="{url}">‘My booking’</a> page.',
    'Η εγγύηση έχει κλείσει: {status} — παρακράτηση {amount}.': 'The security deposit has been closed: {status} — {amount} retained.',
    'Η εγγύηση έχει κλείσει: {status}.': 'The security deposit has been closed: {status}.',
    'Αυτός ο σύνδεσμος δεν ισχύει πλέον. Επικοινωνήστε μαζί μας για νέο σύνδεσμο.': 'This link is no longer valid. Please contact us for a new link.',
    // Μηνύματα από src/routes/public.js και src/lib/deposits.js που εμφανίζει η σελίδα
    'Για να συνεχίσετε πρέπει να συμφωνήσετε με τη δέσμευση του ποσού.': 'To continue, you must agree to the hold on the amount.',
    'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά.': 'We could not connect to the payment service. Please try again.',
    'Η έγκριση επεξεργάζεται. Ανανεώστε τη σελίδα σε λίγο.': 'Your authorisation is being processed. Please refresh the page shortly.',
    'Ο σύνδεσμος δεν είναι έγκυρος.': 'The link is not valid.',
    'Η εγγύηση αυτή δεν περιμένει πλέον έγκριση.': 'This security deposit is no longer awaiting authorisation.',
    'Οι online πληρωμές δεν είναι διαθέσιμες αυτή τη στιγμή.': 'Online payments are not available at the moment.',
    'Η κάρτα που χρησιμοποιήθηκε δεν είναι πιστωτική. Η δέσμευση ακυρώθηκε — δοκιμάστε με πιστωτική κάρτα.':
      'The card used is not a credit card. The hold has been cancelled — please try again with a credit card.',

    // ---------- views/pages/error.ejs (και τίτλοι σελίδων από τις routes) ----------
    'Αρχική σελίδα': 'Home page',
    'Ενοικίαση αυτοκινήτων': 'Car rental',
    'Πολλές προσπάθειες': 'Too many attempts',
    'Κάνατε πολλές προσπάθειες σε λίγο χρόνο. Περιμένετε λίγα λεπτά και δοκιμάστε ξανά.':
      'You have made too many attempts in a short time. Please wait a few minutes and try again.',
  },

  es: {
    // ---------- views/pages/home.ejs ----------
    'Ενοικίαση αυτοκινήτου, απλά και με διαφάνεια': 'Alquiler de coches, sencillo y transparente',
    'Δείτε την τελική τιμή πριν κλείσετε. Χωρίς κρυφές χρεώσεις, με δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή.':
      'Vea el precio final antes de reservar. Sin cargos ocultos y con cancelación gratuita hasta {hours} horas antes de la recogida.',
    'Τελική τιμή από την αρχή': 'El precio final desde el principio',
    'Η τιμή που βλέπετε περιλαμβάνει ΦΠΑ, υποχρεωτική ασφάλιση αστικής ευθύνης και βασική κάλυψη ζημιών (CDW). Χωρίς κρυφές χρεώσεις.':
      'El precio que ve incluye el IVA, el seguro obligatorio de responsabilidad civil y la cobertura básica de daños (CDW). Sin cargos ocultos.',
    'Δωρεάν ακύρωση': 'Cancelación gratuita',
    'Ακυρώστε online έως {hours} ώρες πριν και παίρνετε πίσω όλο το ποσό.': 'Cancele online hasta {hours} horas antes y recupere el importe íntegro.',
    'Ασφαλής πληρωμή': 'Pago seguro',
    'Πληρώστε online με κάρτα μέσω {provider} ή κατά την παραλαβή του αυτοκινήτου. Καμία επιβάρυνση για τον τρόπο πληρωμής.':
      'Pague online con tarjeta a través de {provider} o al recoger el coche. Sin recargo por el método de pago.',
    'Πληρώστε κατά την παραλαβή του αυτοκινήτου. Καμία επιβάρυνση για τον τρόπο πληρωμής.': 'Pague al recoger el coche. Sin recargo por el método de pago.',
    'Παράδοση όπου βρίσκεστε': 'Entrega donde usted esté',
    'Παραλαβή από γραφείο, αεροδρόμιο, λιμάνι ή παράδοση στο ξενοδοχείο σας.': 'Recogida en nuestra oficina, el aeropuerto o el puerto, o entrega en su hotel.',
    'Ο στόλος μας': 'Nuestra flota',
    'Όλα τα αυτοκίνητα →': 'Todos los coches →',
    'ή παρόμοιο': 'o similar',
    'από <strong>{price}</strong> / ημέρα': 'desde <strong>{price}</strong> / día',
    'Πώς λειτουργεί': 'Cómo funciona',
    '<strong>Αναζήτηση</strong><span>Επιλέξτε ημερομηνίες και σημεία παραλαβής/επιστροφής.</span>': '<strong>Busque</strong><span>Elija las fechas y los lugares de recogida y devolución.</span>',
    '<strong>Επιλογή</strong><span>Διαλέξτε αυτοκίνητο και πρόσθετα — βλέπετε αμέσως την τελική τιμή.</span>':
      '<strong>Elija</strong><span>Escoja el coche y los extras: verá al instante el precio final.</span>',
    '<strong>Κράτηση</strong><span>Συμπληρώστε τα στοιχεία οδηγού και λάβετε άμεσα επιβεβαίωση με email.</span>':
      '<strong>Reserve</strong><span>Introduzca los datos del conductor y reciba al instante la confirmación por email.</span>',
    '<strong>Παραλαβή</strong><span>Φέρτε δίπλωμα, ταυτότητα/διαβατήριο και πιστωτική κάρτα για την εγγύηση.</span>':
      '<strong>Recoja</strong><span>Traiga su permiso de conducir, documento de identidad o pasaporte y una tarjeta de crédito para la fianza.</span>',

    // ---------- views/partials/search-form.ejs ----------
    'Σημείο παραλαβής': 'Lugar de recogida',
    'Επιλέξτε...': 'Seleccione...',
    'Σημείο επιστροφής': 'Lugar de devolución',
    'Ίδιο με παραλαβή': 'El mismo que la recogida',
    'Παραλαβή': 'Recogida',
    'Ώρα παραλαβής': 'Hora de recogida',
    'Επιστροφή': 'Devolución',
    'Ώρα επιστροφής': 'Hora de devolución',
    'Αναζήτηση': 'Buscar',
    // Σφάλματα αναζήτησης (src/lib/search.js) που εμφανίζει η φόρμα
    'Επιλέξτε σημείο παραλαβής.': 'Elija un lugar de recogida.',
    'Επιλέξτε σημείο επιστροφής.': 'Elija un lugar de devolución.',
    'Επιλέξτε έγκυρη ημερομηνία και ώρα παραλαβής.': 'Elija una fecha y una hora de recogida válidas.',
    'Επιλέξτε έγκυρη ημερομηνία και ώρα επιστροφής.': 'Elija una fecha y una hora de devolución válidas.',
    'Η επιστροφή πρέπει να είναι μετά την παραλαβή.': 'La devolución debe ser posterior a la recogida.',

    // ---------- views/partials/car-specs.ejs ----------
    'Θέσεις': 'Plazas',
    '{n} θέσεις': '{n} plazas',
    'Κιβώτιο': 'Cambio',
    'Καύσιμο': 'Combustible',
    'Αποσκευές': 'Equipaje',
    '{n} βαλίτσα': '{n} maleta',
    '{n} βαλίτσες': '{n} maletas',
    'Πόρτες': 'Puertas',
    '{n} πόρτες': '{n} puertas',
    'Κλιματισμός': 'Aire acondicionado',

    // ---------- views/partials/payment-means.ejs ----------
    'Τρόποι πληρωμής:': 'Métodos de pago:',
    'online με κάρτα (Visa, Mastercard, Apple Pay, Google Pay) μέσω {provider}, ή κατά την παραλαβή με χρεωστική/πιστωτική κάρτα, IRIS ή μετρητά έως {cash}.':
      'online con tarjeta (Visa, Mastercard, Apple Pay, Google Pay) a través de {provider}, o en la recogida con tarjeta de débito/crédito, IRIS o efectivo hasta {cash}.',
    'κατά την παραλαβή με χρεωστική/πιστωτική κάρτα, IRIS ή μετρητά έως {cash}.': 'en la recogida con tarjeta de débito/crédito, IRIS o efectivo hasta {cash}.',
    'Καμία επιβάρυνση για τον τρόπο πληρωμής.': 'Sin recargo por el método de pago.',
    'Εγγύηση:': 'Fianza:',
    'μόνο πιστωτική κάρτα στο όνομα του κύριου οδηγού — χρεωστικές και προπληρωμένες κάρτες δεν γίνονται δεκτές για την εγγύηση.':
      'solo tarjeta de crédito a nombre del conductor principal; no se aceptan tarjetas de débito ni prepago para la fianza.',

    // ---------- views/pages/cars.ejs ----------
    'Διαθέσιμα αυτοκίνητα': 'Coches disponibles',
    'Ενημέρωση': 'Actualizar',
    'Φίλτρα': 'Filtros',
    'Κατηγορία': 'Categoría',
    'Όλες': 'Todas',
    'Όλα': 'Cualquiera',
    'Χειροκίνητο': 'Manual',
    'Αυτόματο': 'Automático',
    'Θέσεις (τουλάχιστον)': 'Plazas (mínimo)',
    'Ταξινόμηση': 'Ordenar por',
    'Τιμή: χαμηλή → υψηλή': 'Precio: menor → mayor',
    'Τιμή: υψηλή → χαμηλή': 'Precio: mayor → menor',
    'Περισσότερες θέσεις': 'Más plazas',
    'Εφαρμογή': 'Aplicar',
    '<strong>{count}</strong> διαθέσιμο αυτοκίνητο': '<strong>{count}</strong> coche disponible',
    '<strong>{count}</strong> διαθέσιμα αυτοκίνητα': '<strong>{count}</strong> coches disponibles',
    'για <strong>{days} ημέρα</strong>': 'para <strong>{days} día</strong>',
    'για <strong>{days} ημέρες</strong>': 'para <strong>{days} días</strong>',
    '{n} δεν είναι διαθέσιμα': '{n} sin disponibilidad',
    'Επιλέξτε σημείο και ημερομηνίες για να δείτε διαθεσιμότητα και τελικές τιμές.': 'Elija un lugar y unas fechas para ver la disponibilidad y los precios finales.',
    'Δεν βρέθηκαν διαθέσιμα αυτοκίνητα': 'No hay coches disponibles',
    'Δοκιμάστε διαφορετικές ημερομηνίες ή αφαιρέστε κάποιο φίλτρο.': 'Pruebe con otras fechas o quite algún filtro.',
    'Ελάχιστη ηλικία οδηγού {age}': 'Edad mínima del conductor: {age}',
    'Απεριόριστα χιλιόμετρα': 'Kilometraje ilimitado',
    'Απαλλαγή {amount}': 'Franquicia {amount}',
    'Εγγύηση {amount} (πιστωτική κάρτα)': 'Fianza {amount} (tarjeta de crédito)',
    'σύνολο για {n} ημέρα': 'total por {n} día',
    'σύνολο για {n} ημέρες': 'total por {n} días',
    '{price} / ημέρα': '{price} / día',
    '-{percent}% έκπτωση διάρκειας': '-{percent}% de descuento por duración',
    'Κράτηση': 'Reservar',
    'από {price}': 'desde {price}',
    'ανά ημέρα': 'por día',
    'Λεπτομέρειες': 'Detalles',

    // ---------- views/pages/car.ejs ----------
    '← Πίσω στα αποτελέσματα': '← Volver a los resultados',
    'Περιλαμβάνονται στην τιμή': 'Incluido en el precio',
    'Υποχρεωτική ασφάλιση αστικής ευθύνης (έναντι τρίτων)': 'Seguro obligatorio de responsabilidad civil (frente a terceros)',
    'Βασική κάλυψη ζημιών (CDW) — απαλλαγή {amount} (0 € με την Πλήρη Απαλλαγή FDW)':
      'Cobertura básica de daños (CDW) — franquicia de {amount} (0 € con la Exención total por daños, FDW)',
    'Οδική βοήθεια 24/7': 'Asistencia en carretera 24/7',
    'ΦΠΑ {vat}%': 'IVA del {vat}%',
    'Απαιτήσεις': 'Requisitos',
    'Ελάχιστη ηλικία οδηγού: {age} ετών': 'Edad mínima del conductor: {age} años',
    'Δίπλωμα οδήγησης τουλάχιστον {years} έτους': 'Permiso de conducir con una antigüedad mínima de {years} año',
    'Εγγύηση {amount}: δέσμευση (όχι χρέωση) σε <strong>πιστωτική</strong> κάρτα στο όνομα του κύριου οδηγού — όχι χρεωστική ή προπληρωμένη':
      'Fianza de {amount}: bloqueo (no cargo) en una tarjeta de <strong>crédito</strong> a nombre del conductor principal — no se admiten tarjetas de débito ni prepago',
    'Τιμή & διαθεσιμότητα': 'Precio y disponibilidad',
    'Έλεγχος διαθεσιμότητας': 'Comprobar disponibilidad',
    'Το αυτοκίνητο δεν είναι διαθέσιμο για αυτές τις ημερομηνίες. <a href="{url}">Δείτε διαθέσιμα αυτοκίνητα</a>.':
      'Este coche no está disponible en estas fechas. <a href="{url}">Ver coches disponibles</a>.',
    'Συνέχεια στην κράτηση': 'Continuar con la reserva',

    // ---------- views/pages/faq.ejs ----------
    'Τι χρειάζομαι για να παραλάβω το αυτοκίνητο;': '¿Qué necesito para recoger el coche?',
    'Δίπλωμα οδήγησης σε ισχύ (τουλάχιστον {years} έτους), ταυτότητα ή διαβατήριο και πιστωτική κάρτα στο όνομα του οδηγού για την εγγύηση. Για διπλώματα εκτός ΕΕ μπορεί να χρειαστεί Διεθνής Άδεια Οδήγησης.':
      'Un permiso de conducir en vigor (con una antigüedad mínima de {years} año), documento de identidad o pasaporte y una tarjeta de crédito a nombre del conductor para la fianza. Para permisos expedidos fuera de la UE puede ser necesario un Permiso Internacional de Conducción.',
    'Η τιμή που βλέπω είναι η τελική;': '¿El precio que veo es el precio final?',
    'Ναι. Περιλαμβάνει ΦΠΑ, υποχρεωτική ασφάλιση αστικής ευθύνης, βασική κάλυψη ζημιών (CDW) με απαλλαγή, τα χιλιόμετρα που αναγράφονται σε κάθε αυτοκίνητο και τυχόν χρεώσεις σημείου παραλαβής. Επιπλέον χρεώνονται μόνο τα πρόσθετα που επιλέγετε και, μετά την επιστροφή, μόνο οι χρεώσεις του <a href="{url}">τιμοκαταλόγου</a> (π.χ. καύσιμο που λείπει).':
      'Sí. Incluye el IVA, el seguro obligatorio de responsabilidad civil, la cobertura básica de daños (CDW) con franquicia, el kilometraje indicado en cada coche y los posibles cargos del lugar de recogida. Aparte solo se cobran los extras que elija y, tras la devolución, únicamente los cargos de nuestras <a href="{url}">tarifas</a> (p. ej., el combustible que falte).',
    'Πώς υπολογίζονται οι ημέρες;': '¿Cómo se calculan los días?',
    'Ανά 24ωρο από την ώρα παραλαβής. Π.χ. παραλαβή Δευτέρα 10:00 και επιστροφή Τετάρτη 10:00 = 2 ημέρες. Έχετε περιθώριο {minutes} λεπτών χωρίς επιπλέον χρέωση.':
      'Por períodos de 24 horas desde la hora de recogida. Por ejemplo, recogida el lunes a las 10:00 y devolución el miércoles a las 10:00 = 2 días. Dispone de un margen de {minutes} minutos sin cargo adicional.',
    'Μπορώ να ακυρώσω την κράτηση;': '¿Puedo cancelar la reserva?',
    'Ναι, δωρεάν έως {hours} ώρες πριν την παραλαβή, από τη σελίδα <a href="{url}">«Η κράτησή μου»</a>· αν πληρώσατε με κάρτα, το ποσό επιστρέφεται αυτόματα. Μετά το όριο αυτό (ή σε μη εμφάνιση) παρακρατείται η χρέωση ακύρωσης που αναγράφεται στην κράτησή σας. Δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών, επειδή η ενοικίαση αφορά συγκεκριμένες ημερομηνίες.':
      'Sí, de forma gratuita hasta {hours} horas antes de la recogida, desde la página <a href="{url}">«Mi reserva»</a>; si pagó con tarjeta, el importe se reembolsa automáticamente. Pasado ese plazo (o si no se presenta), se retiene el cargo de cancelación indicado en su reserva. No existe derecho de desistimiento de 14 días, ya que el alquiler corresponde a fechas concretas.',
    'Τι είναι η εγγύηση;': '¿Qué es la fianza?',
    'Ένα ποσό που δεσμεύεται (δεν χρεώνεται) σε <strong>πιστωτική</strong> κάρτα στο όνομα του κύριου οδηγού (όχι χρεωστική ή προπληρωμένη), στο γραφείο ή online πριν την παραλαβή. Αποδεσμεύεται μετά την επιστροφή· ο χρόνος εμφάνισης του ποσού εξαρτάται από την τράπεζά σας. Από την εγγύηση αφαιρούνται μόνο οι χρεώσεις του τιμοκαταλόγου και, για ζημιά, μόνο με τη συναίνεσή σας. Με την «Πλήρη Απαλλαγή (FDW)» η συμμετοχή σας σε ζημιές μηδενίζεται· το ποσό της εγγύησης δεν αλλάζει.':
      'Un importe que se bloquea (no se cobra) en una tarjeta de <strong>crédito</strong> a nombre del conductor principal (no de débito ni prepago), en la oficina u online antes de la recogida. Se libera tras la devolución; el tiempo que tarda el importe en volver a aparecer como disponible depende de su banco. De la fianza solo se descuentan los cargos de las tarifas y, en caso de daños, solo con su consentimiento. Con la «Exención total por daños (FDW)» su franquicia por daños pasa a ser cero; el importe de la fianza no cambia.',
    'Μπορεί να οδηγεί και δεύτερο άτομο;': '¿Puede conducir también una segunda persona?',
    'Ναι, προσθέστε «Επιπλέον οδηγό» στην κράτηση. Θα πρέπει να είναι παρών στην παραλαβή με το δίπλωμά του.':
      'Sí, añada un «Conductor adicional» a la reserva. Deberá estar presente en la recogida con su permiso de conducir.',
    'Μπορώ να πάρω το αυτοκίνητο σε νησί;': '¿Puedo llevar el coche a una isla?',
    'Μόνο με γραπτή άδειά μας. Επικοινωνήστε μαζί μας πριν την κράτηση.': 'Solo con nuestra autorización por escrito. Póngase en contacto con nosotros antes de reservar.',
    'Τι γίνεται αν καθυστερήσει η πτήση μου;': '¿Qué ocurre si mi vuelo se retrasa?',
    'Δηλώστε τον αριθμό πτήσης στην κράτηση ώστε να παρακολουθούμε την άφιξή σας και να σας περιμένουμε.':
      'Indique el número de vuelo en la reserva para que podamos seguir su llegada y esperarle.',
    'Ποιους τρόπους πληρωμής δέχεστε;': '¿Qué métodos de pago aceptan?',
    'Πώς υποβάλλω παράπονο;': '¿Cómo presento una reclamación?',
    'Από τη σελίδα <a href="{url}">«Παράπονα & επίλυση διαφορών»</a>. Επιβεβαιώνουμε τη λήψη εντός 2 εργάσιμων και απαντάμε αιτιολογημένα εντός 15 ημερών.':
      'Desde la página <a href="{url}">«Reclamaciones y resolución de conflictos»</a>. Acusamos recibo en un plazo de 2 días hábiles y respondemos de forma motivada en un plazo de 15 días.',

    // ---------- views/pages/contact.ejs ----------
    'Είμαστε στη διάθεσή σας για κάθε ερώτηση σχετικά με κρατήσεις, τιμές ή ειδικά αιτήματα.':
      'Estamos a su disposición para cualquier consulta sobre reservas, precios o peticiones especiales.',
    'Τηλέφωνο:': 'Teléfono:',
    'Διεύθυνση:': 'Dirección:',
    'Ωράριο:': 'Horario:',
    'καθημερινά {from} - {to}': 'todos los días, {from} - {to}',
    'Ιστοσελίδα': 'Sitio web',
    'Ονοματεπώνυμο': 'Nombre y apellidos',
    'Τηλέφωνο (προαιρετικό)': 'Teléfono (opcional)',
    'Είδος': 'Tipo de mensaje',
    'Ερώτηση': 'Consulta',
    'Παράπονο': 'Reclamación',
    'Αμφισβήτηση χρέωσης': 'Impugnación de un cargo',
    'Κωδικός κράτησης (αν υπάρχει)': 'Código de reserva (si lo tiene)',
    'Θέμα': 'Asunto',
    'Μήνυμα': 'Mensaje',
    'Τα στοιχεία σας χρησιμοποιούνται μόνο για να απαντήσουμε στο μήνυμά σας.': 'Sus datos se utilizan únicamente para responder a su mensaje.',
    'Πολιτική απορρήτου': 'Política de privacidad',
    'Αποστολή': 'Enviar',
    // Μηνύματα από src/routes/public.js (POST /contact)
    'Συμπληρώστε το όνομά σας.': 'Indique su nombre.',
    'Συμπληρώστε έγκυρο email.': 'Indique un email válido.',
    'Συμπληρώστε θέμα.': 'Indique un asunto.',
    'Γράψτε το μήνυμά σας (τουλάχιστον 10 χαρακτήρες).': 'Escriba su mensaje (al menos 10 caracteres).',
    'Λάβαμε το μήνυμά σας. Θα σας απαντήσουμε το συντομότερο.': 'Hemos recibido su mensaje. Le responderemos lo antes posible.',
    'Λάβαμε το μήνυμά σας. Θα σας απαντήσουμε αιτιολογημένα εντός 15 ημερών.': 'Hemos recibido su mensaje. Le enviaremos una respuesta motivada en un plazo de 15 días.',

    // ---------- views/pages/company.ejs ----------
    'Επωνυμία': 'Razón social',
    'Διακριτικός τίτλος': 'Nombre comercial',
    'Έδρα': 'Domicilio social',
    'Γραφείο': 'Oficina',
    'ΑΦΜ / VAT': 'NIF-IVA',
    'Αρ. Μητρώου ΜΗΤΕ': 'N.º de registro turístico (MHTE)',
    'Αρμόδια αρχή': 'Autoridad competente',
    'Τηλέφωνο': 'Teléfono',

    // ---------- views/pages/complaints.ejs ----------
    'Αν δεν είστε ικανοποιημένοι από την εξυπηρέτησή μας ή διαφωνείτε με μια χρέωση, πείτε μας:':
      'Si no está satisfecho con nuestro servicio o no está de acuerdo con un cargo, comuníquenoslo:',
    'με τη <a href="{url}">φόρμα παραπόνων</a> (επιλέξτε «Παράπονο» ή «Αμφισβήτηση χρέωσης» και γράψτε τον κωδικό κράτησης),':
      'mediante el <a href="{url}">formulario de reclamaciones</a> (elija «Reclamación» o «Impugnación de un cargo» e indique el código de reserva),',
    'με email στο <a href="mailto:{email}">{email}</a>,': 'por email a <a href="mailto:{email}">{email}</a>,',
    'τηλεφωνικά στο {phone},': 'por teléfono al {phone},',
    'ή στο γραφείο μας ({address}).': 'o en nuestra oficina ({address}).',
    'ή στο γραφείο μας.': 'o en nuestra oficina.',
    'Επιβεβαιώνουμε τη λήψη εντός 2 εργάσιμων ημερών και απαντάμε αιτιολογημένα εντός 15 ημερών.':
      'Acusamos recibo en un plazo de 2 días hábiles y respondemos de forma motivada en un plazo de 15 días.',
    'Για χρεώσεις ζημιάς μπορείτε επίσης να απαντήσετε (αποδοχή ή αμφισβήτηση) απευθείας από τη σελίδα <a href="{url}">«Η κράτησή μου»</a>.':
      'En el caso de cargos por daños, también puede responder (aceptarlos o impugnarlos) directamente desde la página <a href="{url}">«Mi reserva»</a>.',
    'Εξωδικαστική επίλυση': 'Resolución extrajudicial de conflictos',
    'Αν δεν βρεθεί λύση, μπορείτε να απευθυνθείτε στον <strong>Συνήγορο του Καταναλωτή</strong> (www.synigoroskatanaloti.gr), φορέα Εναλλακτικής Επίλυσης Διαφορών.':
      'Si no se encuentra una solución, puede dirigirse al <strong>Defensor del Consumidor de Grecia</strong> (www.synigoroskatanaloti.gr), entidad de resolución alternativa de litigios.',
    'Η εταιρεία δεσμεύεται να συμμετέχει στη διαδικασία.': 'La empresa se compromete a participar en el procedimiento.',
    'Η εταιρεία εξετάζει κατά περίπτωση τη συμμετοχή της στη διαδικασία.': 'La empresa decide en cada caso si participa en el procedimiento.',
    'Καταναλωτές από άλλα κράτη της ΕΕ μπορούν να ζητήσουν συνδρομή από το Ευρωπαϊκό Κέντρο Καταναλωτή Ελλάδας (www.eccgreece.gr).':
      'Los consumidores de otros Estados miembros de la UE pueden solicitar ayuda al Centro Europeo del Consumidor de Grecia (www.eccgreece.gr).',

    // ---------- views/pages/manage.ejs ----------
    'Διαχείριση κράτησης': 'Gestionar la reserva',
    'Συμπληρώστε τον κωδικό κράτησης (θα τον βρείτε στο email επιβεβαίωσης) και το email που δηλώσατε.':
      'Introduzca el código de reserva (lo encontrará en el email de confirmación) y el email que nos indicó.',
    'Κωδικός κράτησης': 'Código de reserva',
    'π.χ. {example}': 'p. ej. {example}',
    'Εύρεση κράτησης': 'Buscar la reserva',
    'Έχετε λογαριασμό; <a href="{url}">Συνδεθείτε</a> για να δείτε όλες τις κρατήσεις σας.': '¿Tiene una cuenta? <a href="{url}">Inicie sesión</a> para ver todas sus reservas.',
    // Μήνυμα από src/routes/public.js (POST /manage)
    'Δεν βρέθηκε κράτηση με αυτά τα στοιχεία. Ελέγξτε τον κωδικό και το email.': 'No se ha encontrado ninguna reserva con estos datos. Compruebe el código y el email.',

    // ---------- views/pages/deposit.ejs ----------
    'Εγγύηση ενοικίασης': 'Fianza del alquiler',
    'Κράτηση <span class="ref">{ref}</span>': 'Reserva <span class="ref">{ref}</span>',
    '<strong>Τι σημαίνει η εγγύηση:</strong> το ποσό <strong>δεσμεύεται</strong> (δεν χρεώνεται) στην πιστωτική σας κάρτα για όσο διαρκεί η ενοικίαση.':
      '<strong>Qué significa la fianza:</strong> el importe se <strong>bloquea</strong> (no se cobra) en su tarjeta de crédito mientras dure el alquiler.',
    'Γίνονται δεκτές <strong>μόνο πιστωτικές κάρτες</strong> στο όνομα του οδηγού. Χρεωστικές και προπληρωμένες κάρτες απορρίπτονται αυτόματα.':
      'Se aceptan <strong>solo tarjetas de crédito</strong> a nombre del conductor. Las tarjetas de débito y prepago se rechazan automáticamente.',
    'Μετά την επιστροφή του αυτοκινήτου το ποσό <strong>αποδεσμεύεται χωρίς καθυστέρηση</strong>. Η τράπεζά σας μπορεί να χρειαστεί λίγες ημέρες για να το εμφανίσει ως διαθέσιμο.':
      'Tras la devolución del coche, el importe se <strong>libera sin demora</strong>. Su banco puede tardar unos días en mostrarlo como disponible.',
    'Από την εγγύηση μπορεί να αφαιρεθούν <strong>μόνο</strong> οι χρεώσεις του <a href="{url}" target="_blank">τιμοκαταλόγου</a>, με αναλυτικό email για καθεμία: καύσιμο που λείπει ({fuel}/λίτρο + {refuel}), καθυστέρηση επιστροφής (μίσθωμα ημέρας), ειδικός καθαρισμός (έως {cleaning}), διαχείριση προστίμου ({fines} ανά πρόστιμο), χαμένο κλειδί ({key}).':
      'De la fianza <strong>solo</strong> pueden descontarse los cargos de nuestras <a href="{url}" target="_blank">tarifas</a>, con un email detallado para cada uno: combustible que falte ({fuel}/litro + {refuel}), retraso en la devolución (precio de un día de alquiler), limpieza especial (hasta {cleaning}), gestión de multas ({fines} por multa), pérdida de llave ({key}).',
    'Χρέωση για <strong>ζημιά</strong> ή οποιαδήποτε άλλη χρέωση γίνεται μόνο με τη συναίνεσή σας, και για ζημιά έως την απαλλαγή σας ({excess}), εκτός από τις εξαιρέσεις των όρων (§7). Θα λάβετε τεκμηρίωση και θα μπορείτε να την αμφισβητήσετε.':
      'Los cargos por <strong>daños</strong> o cualquier otro cargo solo se realizan con su consentimiento y, en caso de daños, hasta el importe de su franquicia ({excess}), salvo las exclusiones previstas en las condiciones (§7). Recibirá la documentación justificativa y podrá impugnarla.',
    'Η έγκριση της εγγύησης γίνεται από <strong>{from}</strong> έως την επιστροφή του αυτοκινήτου.':
      'Puede autorizar la fianza desde el <strong>{from}</strong> hasta la devolución del coche.',
    'Συμφωνώ να δεσμευτεί το ποσό <strong>{amount}</strong> στην πιστωτική μου κάρτα ως εγγύηση για την κράτηση {ref}, σύμφωνα με τους <a href="{url}" target="_blank">όρους ενοικίασης</a>.':
      'Acepto que se bloquee el importe de <strong>{amount}</strong> en mi tarjeta de crédito como fianza de la reserva {ref}, de acuerdo con las <a href="{url}" target="_blank">condiciones de alquiler</a>.',
    'Συνέχεια στην ασφαλή σελίδα πληρωμής': 'Continuar a la página de pago segura',
    'Τα στοιχεία της κάρτας σας τα καταχωρείτε στην ασφαλή σελίδα του παρόχου πληρωμών ({provider}). Δεν τα βλέπουμε και δεν τα αποθηκεύουμε.':
      'Los datos de su tarjeta se introducen en la página segura del proveedor de pagos ({provider}). No los vemos ni los guardamos.',
    'Η εγγύηση <strong>{amount}</strong> δεσμεύτηκε επιτυχώς στην κάρτα •••• {last4}. Ευχαριστούμε!':
      'La fianza de <strong>{amount}</strong> se ha bloqueado correctamente en la tarjeta •••• {last4}. ¡Gracias!',
    'Η εγγύηση <strong>{amount}</strong> δεσμεύτηκε επιτυχώς. Ευχαριστούμε!': 'La fianza de <strong>{amount}</strong> se ha bloqueado correctamente. ¡Gracias!',
    'Θα αποδεσμευτεί μετά την επιστροφή του αυτοκινήτου. Μπορείτε να δείτε την κράτησή σας από τη σελίδα <a href="{url}">«Η κράτησή μου»</a>.':
      'Se liberará tras la devolución del coche. Puede consultar su reserva desde la página <a href="{url}">«Mi reserva»</a>.',
    'Η εγγύηση έχει κλείσει: {status} — παρακράτηση {amount}.': 'La fianza se ha cerrado: {status} — importe retenido: {amount}.',
    'Η εγγύηση έχει κλείσει: {status}.': 'La fianza se ha cerrado: {status}.',
    'Αυτός ο σύνδεσμος δεν ισχύει πλέον. Επικοινωνήστε μαζί μας για νέο σύνδεσμο.': 'Este enlace ya no es válido. Póngase en contacto con nosotros para obtener uno nuevo.',
    // Μηνύματα από src/routes/public.js και src/lib/deposits.js που εμφανίζει η σελίδα
    'Για να συνεχίσετε πρέπει να συμφωνήσετε με τη δέσμευση του ποσού.': 'Para continuar, debe aceptar el bloqueo del importe.',
    'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά.': 'No ha sido posible conectar con el servicio de pagos. Inténtelo de nuevo.',
    'Η έγκριση επεξεργάζεται. Ανανεώστε τη σελίδα σε λίγο.': 'La autorización se está procesando. Actualice la página dentro de un momento.',
    'Ο σύνδεσμος δεν είναι έγκυρος.': 'El enlace no es válido.',
    'Η εγγύηση αυτή δεν περιμένει πλέον έγκριση.': 'Esta fianza ya no está pendiente de autorización.',
    'Οι online πληρωμές δεν είναι διαθέσιμες αυτή τη στιγμή.': 'Los pagos online no están disponibles en este momento.',
    'Η κάρτα που χρησιμοποιήθηκε δεν είναι πιστωτική. Η δέσμευση ακυρώθηκε — δοκιμάστε με πιστωτική κάρτα.':
      'La tarjeta utilizada no es de crédito. El bloqueo se ha anulado — inténtelo de nuevo con una tarjeta de crédito.',

    // ---------- views/pages/error.ejs (και τίτλοι σελίδων από τις routes) ----------
    'Αρχική σελίδα': 'Página de inicio',
    'Ενοικίαση αυτοκινήτων': 'Alquiler de coches',
    'Πολλές προσπάθειες': 'Demasiados intentos',
    'Κάνατε πολλές προσπάθειες σε λίγο χρόνο. Περιμένετε λίγα λεπτά και δοκιμάστε ξανά.':
      'Ha realizado demasiados intentos en poco tiempo. Espere unos minutos y vuelva a intentarlo.',
  },
};
