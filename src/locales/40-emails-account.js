'use strict';

// Emails προς τον πελάτη (views/emails/*.ejs, εκτός admin-*, test-email, terms-document),
// σύνδεση / εγγραφή / επαναφορά κωδικού (views/auth/*.ejs) και λογαριασμός (views/account/index.ejs),
// μαζί με τα μηνύματα (σφάλματα, flash, θέματα emails, αιτίες) που παράγει ο κώδικας για αυτά.
// Κλειδί: το ακριβές ελληνικό κείμενο. Τα {όνομα} μένουν όπως είναι.
// (ΑΦΜ, ΓΕΜΗ, ΜΗΤΕ, «Όροι ενοικίασης» και «Σύνδεση» βρίσκονται στο 00-common.js.)

module.exports = {
  en: {
    // ---------- Θέματα emails (msg(...) στο src/lib/*.js και src/routes/*.js) ----------
    'Επιβεβαίωση κράτησης {ref}': 'Booking confirmation {ref}',
    'Ακύρωση κράτησης {ref}': 'Cancellation of booking {ref}',
    'Επιστροφή πληρωμής - κράτηση {ref}': 'Payment refund - booking {ref}',
    'Εγγύηση για την κράτηση {ref}': 'Security deposit for booking {ref}',
    'Δέσμευση εγγύησης - κράτηση {ref}': 'Security deposit hold - booking {ref}',
    'Εγγύηση κράτησης {ref}: εκκαθάριση': 'Security deposit for booking {ref}: settlement',
    'Εγγύηση κράτησης {ref}: αποδέσμευση': 'Security deposit for booking {ref}: release',
    'Χρέωση για αποδοχή - κράτηση {ref}': 'Charge for your approval - booking {ref}',
    'Χρέωση μετά την επιστροφή - κράτηση {ref}': 'Charge after return - booking {ref}',
    'Καλώς ήρθατε στην {company}': 'Welcome to {company}',
    'Επαναφορά κωδικού πρόσβασης': 'Password reset',
    'Λάβαμε το μήνυμά σας: {subject}': 'We have received your message: {subject}',

    // ---------- Κοινά στα emails ----------
    'Αγαπητέ/ή {name},': 'Dear {name},',
    'Γεια σας {name},': 'Hello {name},',

    // ---------- emails/_booking-table.ejs ----------
    'Κωδικός κράτησης': 'Booking reference',
    'Αυτοκίνητο': 'Car',
    '{car} ή παρόμοιο ({category})': '{car} or similar ({category})',
    'Παραλαβή': 'Pick-up',
    'Επιστροφή': 'Return',
    'Οδηγός': 'Driver',
    'Πρόσθετα': 'Extras',
    'Ενοικίαση ({days} ημέρα)': 'Rental ({days} day)',
    'Ενοικίαση ({days} ημέρες)': 'Rental ({days} days)',
    'Έκπτωση διάρκειας': 'Long-rental discount',
    'Χρεώσεις σημείου / επιστροφής σε άλλο σημείο': 'Location charges / return to a different location',
    'Σύνολο': 'Total',
    '<strong>{total}</strong> (περιλαμβάνεται ΦΠΑ {vat}%: {vatAmount})': '<strong>{total}</strong> (including {vat}% VAT: {vatAmount})',
    'Πληρώθηκαν': 'Paid',
    '(επιστράφηκαν {amount})': '({amount} refunded)',
    'Πληρωτέο': 'Amount due',
    '{amount} κατά την παραλαβή': '{amount} at pick-up',
    'Απαλλαγή ζημιών': 'Damage excess',
    'Πληρωμή': 'Payment',
    'Εγγύηση': 'Security deposit',
    '{amount}: δέσμευση (όχι χρέωση) σε πιστωτική κάρτα στο όνομα του κύριου οδηγού — όχι χρεωστική/προπληρωμένη. Αποδεσμεύεται μετά την επιστροφή.':
      '{amount}: a hold (not a charge) on a credit card in the main driver’s name — not a debit or prepaid card. It is released after the car is returned.',

    // ---------- emails/booking-confirmed.ejs ----------
    'Σας ευχαριστούμε! Η κράτησή σας <strong>επιβεβαιώθηκε</strong>.': 'Thank you! Your booking is <strong>confirmed</strong>.',
    'Τι να έχετε μαζί σας στην παραλαβή:': 'What to bring at pick-up:',
    'Δίπλωμα οδήγησης (και Διεθνή Άδεια για διπλώματα εκτός ΕΕ)': 'Driving licence (plus an International Driving Permit for licences issued outside the EU)',
    'Ταυτότητα ή διαβατήριο': 'ID card or passport',
    'Πιστωτική κάρτα στο όνομα του οδηγού για την εγγύηση': 'A credit card in the driver’s name for the security deposit',
    'Ακύρωση:': 'Cancellation:',
    'Δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών (ενοικίαση για συγκεκριμένες ημερομηνίες).':
      'There is no 14-day right of withdrawal (rental for specific dates).',
    'Δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή· μετά, ή σε μη εμφάνιση, παρακρατείται {fee} από ό,τι έχετε προπληρώσει (αν πληρώνετε στην παραλαβή, δεν οφείλεται χρέωση).':
      'Free cancellation up to {hours} hours before pick-up; after that, or in the event of a no-show, {fee} is retained from any amount you have prepaid (if you pay at pick-up, no charge is due).',
    'Δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή.': 'Free cancellation up to {hours} hours before pick-up.',
    'Για να δείτε ή να ακυρώσετε την κράτηση: <a href="{url}">{url}</a> με τον κωδικό <strong>{ref}</strong> και το email σας.':
      'To view or cancel your booking, go to <a href="{url}">{url}</a> and enter your booking reference <strong>{ref}</strong> and your email address.',
    '<strong>Εγγύηση:</strong> δεσμεύεται στο γραφείο μας κατά την παραλαβή με πιστωτική κάρτα στο όνομα του κύριου οδηγού, ή online αν σας στείλουμε σύνδεσμο (ενεργοποιείται {hours} ώρες πριν την παραλαβή).':
      '<strong>Security deposit:</strong> held at our office at pick-up on a credit card in the main driver’s name, or online if we send you a link (the link becomes active {hours} hours before pick-up).',
    'Παράπονα:': 'Complaints:',
    'Εξωδικαστική επίλυση: Συνήγορος του Καταναλωτή (www.synigoroskatanaloti.gr).':
      'Out-of-court dispute resolution: Greek Consumer Ombudsman (www.synigoroskatanaloti.gr).',
    // Στα αγγλικά/ισπανικά επισυνάπτονται η μετάφραση ΚΑΙ το ελληνικό κείμενο (src/lib/mailer.js).
    'Επισυνάπτονται οι όροι ενοικίασης (έκδοση {version}) που αποδεχθήκατε.':
      'The rental terms (version {version}) that you accepted are attached, in English and in the original Greek, which prevails in the event of any discrepancy.',
    'Οι όροι ενοικίασης (έκδοση {version}) που αποδεχθήκατε: <a href="{url}">{url}</a>':
      'The rental terms (version {version}) that you accepted: <a href="{url}">{url}</a>',
    'Καλό ταξίδι!': 'Have a good trip!',

    // ---------- emails/booking-cancelled.ejs ----------
    'Η κράτηση <strong>{ref}</strong> ({car}, {pickup}) <strong>ακυρώθηκε</strong>.': 'Booking <strong>{ref}</strong> ({car}, {pickup}) has been <strong>cancelled</strong>.',
    'Αιτία: {reason}': 'Reason: {reason}',
    'Η επιστροφή <strong>{amount}</strong> στην κάρτα σας ξεκίνησε. Το ποσό θα εμφανιστεί στον λογαριασμό σας σε 5-10 εργάσιμες ημέρες.':
      'A refund of <strong>{amount}</strong> to your card has been initiated. The amount will appear in your account within 5-10 working days.',
    'Θα επικοινωνήσουμε μαζί σας για την επιστροφή <strong>{amount}</strong> που είχατε πληρώσει.':
      'We will contact you about refunding the <strong>{amount}</strong> you paid.',
    'Αν δεν ζητήσατε εσείς την ακύρωση ή έχετε απορίες, επικοινωνήστε μαζί μας.':
      'If you did not request this cancellation or have any questions, please contact us.',
    // Αιτίες ακύρωσης (src/routes/booking.js, src/routes/admin.js)
    'Ακύρωση από τον πελάτη': 'Cancelled by the customer',
    'Ακύρωση από τον πελάτη (χρέωση ακύρωσης {amount})': 'Cancelled by the customer (cancellation charge of {amount})',
    'Ακύρωση από το γραφείο': 'Cancelled by our office',

    // ---------- emails/payment-returned.ejs ----------
    'Λάβαμε πληρωμή <strong>{amount}</strong> για την κράτηση <strong>{ref}</strong>, την οποία δεν μπορέσαμε να αντιστοιχίσουμε:':
      'We received a payment of <strong>{amount}</strong> for booking <strong>{ref}</strong> that we were unable to match to it:',
    'Το ποσό <strong>επιστρέφεται αυτόματα</strong> στην κάρτα σας και θα εμφανιστεί σε 5-10 εργάσιμες ημέρες. Δεν χρειάζεται καμία ενέργεια από εσάς. Για απορίες επικοινωνήστε μαζί μας.':
      'The amount is being <strong>refunded automatically</strong> to your card and will appear within 5-10 working days. You do not need to do anything. If you have any questions, please contact us.',
    // Αιτίες (src/lib/payments.js)
    'Το ποσό της πληρωμής δεν αντιστοιχεί στην κράτηση': 'The payment amount does not match the booking',
    'Η κράτηση είχε ήδη πληρωθεί (διπλή πληρωμή)': 'The booking had already been paid (duplicate payment)',
    'Η κράτηση είχε ήδη ακυρωθεί': 'The booking had already been cancelled',
    'Η πληρωμή ολοκληρώθηκε αφού έληξε η προσωρινή δέσμευση και το αυτοκίνητο δεν ήταν πλέον διαθέσιμο':
      'The payment was completed after the temporary reservation of the car had expired, and the car was no longer available',

    // ---------- emails/deposit-link.ejs ----------
    'Για την παραλαβή του αυτοκινήτου (κράτηση <strong>{ref}</strong>, {pickup}) απαιτείται εγγύηση <strong>{amount}</strong>.':
      'A security deposit of <strong>{amount}</strong> is required to pick up the car (booking <strong>{ref}</strong>, {pickup}).',
    'Η εγγύηση είναι <strong>δέσμευση ποσού, όχι χρέωση</strong>, σε <strong>πιστωτική κάρτα</strong> στο όνομα του οδηγού, και αποδεσμεύεται μετά την επιστροφή του αυτοκινήτου.':
      'The deposit is a <strong>hold on funds, not a charge</strong>, on a <strong>credit card</strong> in the driver’s name, and it is released after the car is returned.',
    'Έγκριση εγγύησης': 'Authorise deposit',
    'Ο σύνδεσμος μπορεί να χρησιμοποιηθεί από {from} έως την επιστροφή του αυτοκινήτου.': 'The link can be used from {from} until the car is returned.',

    // ---------- emails/deposit-held.ejs ----------
    'Επιβεβαιώνουμε τη <strong>δέσμευση</strong> (όχι χρέωση) <strong>{amount}</strong> στην κάρτα •••• {last4} ως εγγύηση για την κράτηση <strong>{ref}</strong>.':
      'We confirm the <strong>hold</strong> (not a charge) of <strong>{amount}</strong> on card •••• {last4} as a security deposit for booking <strong>{ref}</strong>.',
    'Επιβεβαιώνουμε τη <strong>δέσμευση</strong> (όχι χρέωση) <strong>{amount}</strong> ως εγγύηση για την κράτηση <strong>{ref}</strong>.':
      'We confirm the <strong>hold</strong> (not a charge) of <strong>{amount}</strong> as a security deposit for booking <strong>{ref}</strong>.',
    'Το ποσό θα αποδεσμευτεί μετά την επιστροφή του αυτοκινήτου. Αν προκύψουν χρεώσεις που προβλέπονται στους όρους (π.χ. καύσιμο, καθυστέρηση), θα λάβετε αναλυτική ενημέρωση. Για ζημιά απαιτείται η συναίνεσή σας.':
      'The amount will be released after the car is returned. If any charges provided for in the terms arise (e.g. fuel, late return), you will receive a detailed breakdown. Your consent is required for any damage charge.',

    // ---------- emails/deposit-settled.ejs ----------
    'Η εγγύηση για την κράτηση <strong>{ref}</strong> εκκαθαρίστηκε:': 'The security deposit for booking <strong>{ref}</strong> has been settled:',
    'Παρακράτηση από την εγγύηση': 'Retained from the deposit',
    'Αποδεσμεύτηκαν': 'Released',
    'Η εγγύηση <strong>{amount}</strong> για την κράτηση <strong>{ref}</strong> <strong>αποδεσμεύτηκε πλήρως</strong>, χωρίς καμία χρέωση.':
      'The security deposit of <strong>{amount}</strong> for booking <strong>{ref}</strong> has been <strong>released in full</strong>, with no charges.',
    'Η τράπεζά σας μπορεί να χρειαστεί λίγες εργάσιμες ημέρες για να εμφανίσει το ποσό ως διαθέσιμο.':
      'Your bank may take a few working days to show the amount as available.',
    'Παραμένει υπόλοιπο <strong>{amount}</strong> από αποδεκτές χρεώσεις. Μπορείτε να το εξοφλήσετε από τη σελίδα <a href="{url}">{url}</a>.':
      'An outstanding balance of <strong>{amount}</strong> remains from accepted charges. You can pay it at <a href="{url}">{url}</a>.',
    'Εκκρεμεί η απάντησή σας για {count} χρέωση/εις ζημιάς, την οποία μπορείτε να αποδεχθείτε ή να αμφισβητήσετε από τη σελίδα της κράτησης.':
      'We are still awaiting your reply on {count} damage charge(s), which you can accept or dispute on your booking page.',
    'Για απορίες ή αντιρρήσεις επικοινωνήστε μαζί μας.': 'If you have any questions or objections, please contact us.',

    // ---------- emails/charge-added.ejs ----------
    'Μετά την επιστροφή του αυτοκινήτου (κράτηση <strong>{ref}</strong>) καταχωρήθηκε η παρακάτω χρέωση, σύμφωνα με τη γραπτή συναίνεσή σας:':
      'Following the return of the car (booking <strong>{ref}</strong>), the charge below has been recorded in accordance with your written consent:',
    'Μετά την επιστροφή του αυτοκινήτου (κράτηση <strong>{ref}</strong>) καταχωρήθηκε η παρακάτω χρέωση, σύμφωνα με τον τιμοκατάλογο των όρων ενοικίασης που αποδεχθήκατε:':
      'Following the return of the car (booking <strong>{ref}</strong>), the charge below has been recorded in accordance with the price list in the rental terms you accepted:',
    'Κατηγορία': 'Category',
    'Περιγραφή': 'Description',
    'Τεκμηρίωση': 'Evidence',
    'Ποσό': 'Amount',
    'Συναίνεση': 'Consent',
    // Η συναίνεση αποθηκεύεται στα ελληνικά· μεταφράζεται το σταθερό μέρος, η σημείωση του γραφείου μένει ως έχει.
    'Γραπτή συναίνεση πελάτη: {note}': 'Customer’s written consent: {note}',
    'Το ποσό θα αφαιρεθεί από την εγγύηση (αν έχει δεσμευτεί) και το υπόλοιπο θα αποδεσμευτεί· θα λάβετε ξεχωριστό email με την εκκαθάριση.':
      'The amount will be deducted from the security deposit (if one is held) and the remainder will be released; you will receive a separate email with the deposit settlement.',
    'Ο τιμοκατάλογος: <a href="{url}">{url}</a>.': 'Price list: <a href="{url}">{url}</a>.',
    'Αν διαφωνείτε με τη χρέωση, απαντήστε σε αυτό το email ή γράψτε μας από τη <a href="{url}">φόρμα επικοινωνίας</a> (επιλέξτε «Αμφισβήτηση χρέωσης»).':
      'If you disagree with the charge, reply to this email or write to us using the <a href="{url}">contact form</a> (choose ‘Charge dispute’).',

    // ---------- emails/charge-notice.ejs ----------
    'Κατά τον έλεγχο του αυτοκινήτου μετά την επιστροφή (κράτηση <strong>{ref}</strong>) καταγράψαμε την παρακάτω χρέωση, που χρειάζεται την αποδοχή σας:':
      'When inspecting the car after its return (booking <strong>{ref}</strong>), we recorded the charge below, which requires your acceptance:',
    'Απάντηση έως': 'Reply by',
    'Η ευθύνη σας για ζημιές περιορίζεται στην απαλλαγή της κράτησής σας ({amount}), εκτός από τις εξαιρέσεις των όρων ενοικίασης (§7).':
      'Your liability for damage is limited to the excess of your booking ({amount}), except for the exclusions in the rental terms (§7).',
    'Καμία τέτοια χρέωση δεν γίνεται χωρίς τη συναίνεσή σας.': 'No such charge is made without your consent.',
    'Μπορείτε να την αποδεχθείτε ή να την αμφισβητήσετε (με τα σχόλιά σας) από τη σελίδα της κράτησης:':
      'You can accept or dispute it (with your comments) on your booking page:',
    '<a href="{url}">{url}</a> (κωδικός <strong>{ref}</strong> και το email σας).':
      '<a href="{url}">{url}</a> (booking reference <strong>{ref}</strong> and your email address).',
    'Μπορείτε επίσης να ζητήσετε τα στοιχεία τεκμηρίωσης (φωτογραφίες, εκτίμηση/τιμολόγιο επισκευής) ή να επικοινωνήσετε μαζί μας.':
      'You can also request the supporting evidence (photos, repair estimate/invoice) or contact us.',

    // ---------- emails/welcome.ejs ----------
    'Καλώς ήρθατε στην {company}! Ο λογαριασμός σας δημιουργήθηκε με το email <strong>{email}</strong>.':
      'Welcome to {company}! Your account has been created with the email address <strong>{email}</strong>.',
    'Βρείτε το αυτοκίνητο για το επόμενο ταξίδι σας': 'Find a car for your next trip',

    // ---------- emails/password-reset.ejs ----------
    'Λάβαμε αίτημα επαναφοράς του κωδικού σας. Πατήστε τον παρακάτω σύνδεσμο για να ορίσετε νέο κωδικό (ισχύει για 1 ώρα):':
      'We received a request to reset your password. Click the link below to set a new password (valid for 1 hour):',
    'Ορισμός νέου κωδικού': 'Set a new password',
    'Αν δεν ζητήσατε εσείς την επαναφορά, αγνοήστε αυτό το email — ο κωδικός σας δεν θα αλλάξει.':
      'If you did not request a password reset, please ignore this email — your password will not change.',

    // ---------- emails/contact-ack.ejs ----------
    'Λάβαμε το μήνυμά σας «{subject}» στις {date}.': 'We received your message ‘{subject}’ on {date}.',
    'Θα σας απαντήσουμε αιτιολογημένα εντός 15 ημερών.': 'We will send you a reasoned reply within 15 days.',
    'Θα σας απαντήσουμε το συντομότερο.': 'We will reply as soon as possible.',
    'Αν δεν βρεθεί λύση, μπορείτε να απευθυνθείτε στον Συνήγορο του Καταναλωτή (www.synigoroskatanaloti.gr).':
      'If no solution is found, you may contact the Greek Consumer Ombudsman (www.synigoroskatanaloti.gr).',

    // ---------- auth/login.ejs ----------
    'Κωδικός': 'Password',
    'Να με θυμάσαι για 30 ημέρες (μην το επιλέγετε σε κοινόχρηστο υπολογιστή)': 'Remember me for 30 days (do not tick this on a shared computer)',
    'Ξεχάσατε τον κωδικό;': 'Forgotten your password?',
    'Δεν έχετε λογαριασμό; <a href="{url}">Δημιουργήστε έναν</a>. Μπορείτε επίσης να κάνετε κράτηση χωρίς λογαριασμό.':
      'Don’t have an account? <a href="{url}">Create one</a>. You can also book without an account.',

    // ---------- auth/register.ejs ----------
    'Δημιουργία λογαριασμού': 'Create an account',
    'Με λογαριασμό βλέπετε όλες τις κρατήσεις σας και κλείνετε πιο γρήγορα την επόμενη.':
      'With an account, you can see all your bookings and make your next one more quickly.',
    'Όνομα': 'First name',
    'Επώνυμο': 'Surname',
    'Κινητό (προαιρετικό)': 'Mobile (optional)',
    'Τουλάχιστον 10 χαρακτήρες, με γράμματα και αριθμούς.': 'At least 10 characters, including letters and numbers.',
    'Επιβεβαίωση κωδικού': 'Confirm password',
    'Τα στοιχεία σας χρησιμοποιούνται για τον λογαριασμό και τις κρατήσεις σας, όπως περιγράφει η <a href="{url}" target="_blank">πολιτική απορρήτου</a>. Μπορείτε να τα κατεβάσετε ή να διαγράψετε τον λογαριασμό οποτεδήποτε.':
      'Your details are used for your account and your bookings, as described in our <a href="{url}" target="_blank">privacy policy</a>. You can download them or delete your account at any time.',
    'Έχετε ήδη λογαριασμό; <a href="{url}">Συνδεθείτε</a>.': 'Already have an account? <a href="{url}">Log in</a>.',

    // ---------- auth/forgot.ejs ----------
    'Ξέχασα τον κωδικό': 'Forgotten password',
    'Επαναφορά κωδικού': 'Reset your password',
    'Αν υπάρχει λογαριασμός με το email <strong>{email}</strong>, θα λάβετε σε λίγα λεπτά σύνδεσμο για να ορίσετε νέο κωδικό. Ο σύνδεσμος ισχύει για 1 ώρα.':
      'If there is an account with the email address <strong>{email}</strong>, you will receive a link to set a new password within a few minutes. The link is valid for 1 hour.',
    'Συμπληρώστε το email του λογαριασμού σας και θα σας στείλουμε σύνδεσμο επαναφοράς.':
      'Enter the email address for your account and we will send you a reset link.',
    'Αποστολή συνδέσμου': 'Send link',

    // ---------- auth/reset.ejs ----------
    'Νέος κωδικός': 'New password',
    'Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει. <a href="{url}">Ζητήστε νέο σύνδεσμο</a>.':
      'The link is invalid or has expired. <a href="{url}">Request a new link</a>.',
    'Επιβεβαίωση': 'Confirm password',
    'Αποθήκευση': 'Save',

    // ---------- account/index.ejs ----------
    'Ο λογαριασμός μου': 'My account',
    'Γεια σας, {name}': 'Hello, {name}',
    'Οι κρατήσεις μου': 'My bookings',
    'Δεν έχετε κρατήσεις ακόμη.': 'You have no bookings yet.',
    'Βρείτε αυτοκίνητο': 'Find a car',
    'Κωδικός {ref}': 'Reference {ref}',
    'Στοιχεία': 'Your details',
    'Τηλέφωνο': 'Phone',
    'Αλλαγή κωδικού': 'Change password',
    'Τρέχων κωδικός': 'Current password',
    'Τα δεδομένα μου': 'My data',
    'Κατεβάστε όλα τα δεδομένα του λογαριασμού και των κρατήσεών σας (αρχείο JSON).':
      'Download all the data from your account and your bookings (JSON file).',
    'Λήψη δεδομένων': 'Download data',
    'Διαγραφή λογαριασμού': 'Delete account',
    'Ο λογαριασμός θα διαγραφεί οριστικά. Συνέχεια;': 'Your account will be permanently deleted. Continue?',
    'Οι κρατήσεις σας θα διατηρηθούν όσο απαιτεί η φορολογική νομοθεσία, αλλά δεν θα συνδέονται πλέον με λογαριασμό. Τα στοιχεία διπλώματος, γέννησης και επικοινωνίας διαγράφονται αυτόματα {months} μήνες μετά την επιστροφή. Δεν είναι δυνατή η διαγραφή όσο εκκρεμεί κράτηση, εγγύηση ή χρέωση.':
      'Your bookings will be kept for as long as tax law requires, but they will no longer be linked to an account. Driving licence details, date of birth and contact details are deleted automatically {months} months after the car is returned. Your account cannot be deleted while a booking, security deposit or charge is pending.',
    'Οριστική διαγραφή': 'Delete permanently',

    // ---------- Μηνύματα σφάλματος και flash (src/routes/auth.js, src/routes/account.js, src/lib/validation.js, src/middleware/auth.js) ----------
    'Συνδεθείτε για να συνεχίσετε.': 'Please log in to continue.',
    'Λάθος email ή κωδικός.': 'Incorrect email address or password.',
    'Συμπληρώστε το όνομα.': 'Please enter your first name.',
    'Συμπληρώστε το επώνυμο.': 'Please enter your surname.',
    'Συμπληρώστε έγκυρο email.': 'Please enter a valid email address.',
    'Μη έγκυρο τηλέφωνο.': 'Invalid phone number.',
    'Οι κωδικοί δεν ταιριάζουν.': 'The passwords do not match.',
    'Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδεθείτε ή επαναφέρετε τον κωδικό σας.':
      'An account with this email address already exists. Please log in or reset your password.',
    'Ο κωδικός πρέπει να έχει τουλάχιστον 10 χαρακτήρες.': 'The password must be at least 10 characters long.',
    'Ο κωδικός είναι πολύ μεγάλος.': 'The password is too long.',
    'Ο κωδικός πρέπει να περιέχει γράμματα και αριθμούς.': 'The password must contain both letters and numbers.',
    'Ο τρέχων κωδικός είναι λάθος.': 'The current password is incorrect.',
    'Ο λογαριασμός σας δημιουργήθηκε.': 'Your account has been created.',
    'Ο κωδικός σας άλλαξε.': 'Your password has been changed.',
    'Τα στοιχεία σας ενημερώθηκαν.': 'Your details have been updated.',
    'Ο λογαριασμός διαχειριστή δεν μπορεί να διαγραφεί από εδώ.': 'An administrator account cannot be deleted from here.',
    'Ο κωδικός είναι λάθος. Ο λογαριασμός δεν διαγράφηκε.': 'The password is incorrect. Your account has not been deleted.',
    'Έχετε ενεργή κράτηση, εγγύηση ή εκκρεμή χρέωση. Ο λογαριασμός μπορεί να διαγραφεί μόλις ολοκληρωθούν (ή ακυρώστε πρώτα την κράτηση).':
      'You have an active booking, security deposit or pending charge. Your account can be deleted once these have been completed (or cancel the booking first).',
  },
  es: {
    // ---------- Θέματα emails (msg(...) στο src/lib/*.js και src/routes/*.js) ----------
    'Επιβεβαίωση κράτησης {ref}': 'Confirmación de la reserva {ref}',
    'Ακύρωση κράτησης {ref}': 'Cancelación de la reserva {ref}',
    'Επιστροφή πληρωμής - κράτηση {ref}': 'Reembolso del pago - reserva {ref}',
    'Εγγύηση για την κράτηση {ref}': 'Fianza de la reserva {ref}',
    'Δέσμευση εγγύησης - κράτηση {ref}': 'Bloqueo de la fianza - reserva {ref}',
    'Εγγύηση κράτησης {ref}: εκκαθάριση': 'Fianza de la reserva {ref}: liquidación',
    'Εγγύηση κράτησης {ref}: αποδέσμευση': 'Fianza de la reserva {ref}: liberación',
    'Χρέωση για αποδοχή - κράτηση {ref}': 'Cargo pendiente de su aceptación - reserva {ref}',
    'Χρέωση μετά την επιστροφή - κράτηση {ref}': 'Cargo tras la devolución - reserva {ref}',
    'Καλώς ήρθατε στην {company}': 'Bienvenido/a a {company}',
    'Επαναφορά κωδικού πρόσβασης': 'Restablecimiento de la contraseña',
    'Λάβαμε το μήνυμά σας: {subject}': 'Hemos recibido su mensaje: {subject}',

    // ---------- Κοινά στα emails ----------
    'Αγαπητέ/ή {name},': 'Estimado/a {name}:',
    'Γεια σας {name},': 'Hola, {name}:',

    // ---------- emails/_booking-table.ejs ----------
    'Κωδικός κράτησης': 'Código de reserva',
    'Αυτοκίνητο': 'Coche',
    '{car} ή παρόμοιο ({category})': '{car} o similar ({category})',
    'Παραλαβή': 'Recogida',
    'Επιστροφή': 'Devolución',
    'Οδηγός': 'Conductor',
    'Πρόσθετα': 'Extras',
    'Ενοικίαση ({days} ημέρα)': 'Alquiler ({days} día)',
    'Ενοικίαση ({days} ημέρες)': 'Alquiler ({days} días)',
    'Έκπτωση διάρκειας': 'Descuento por duración',
    'Χρεώσεις σημείου / επιστροφής σε άλλο σημείο': 'Cargos por ubicación / devolución en otro lugar',
    'Σύνολο': 'Total',
    '<strong>{total}</strong> (περιλαμβάνεται ΦΠΑ {vat}%: {vatAmount})': '<strong>{total}</strong> (IVA del {vat}% incluido: {vatAmount})',
    'Πληρώθηκαν': 'Pagado',
    '(επιστράφηκαν {amount})': '(reembolso de {amount})',
    'Πληρωτέο': 'Importe a pagar',
    '{amount} κατά την παραλαβή': '{amount} en la recogida',
    'Απαλλαγή ζημιών': 'Franquicia por daños',
    'Πληρωμή': 'Pago',
    'Εγγύηση': 'Fianza',
    '{amount}: δέσμευση (όχι χρέωση) σε πιστωτική κάρτα στο όνομα του κύριου οδηγού — όχι χρεωστική/προπληρωμένη. Αποδεσμεύεται μετά την επιστροφή.':
      '{amount}: bloqueo (no cargo) en una tarjeta de crédito a nombre del conductor principal, no de débito ni prepago. Se libera tras la devolución.',

    // ---------- emails/booking-confirmed.ejs ----------
    'Σας ευχαριστούμε! Η κράτησή σας <strong>επιβεβαιώθηκε</strong>.': '¡Gracias! Su reserva está <strong>confirmada</strong>.',
    'Τι να έχετε μαζί σας στην παραλαβή:': 'Qué debe llevar a la recogida:',
    'Δίπλωμα οδήγησης (και Διεθνή Άδεια για διπλώματα εκτός ΕΕ)': 'Permiso de conducir (y Permiso Internacional de Conducción si su permiso se expidió fuera de la UE)',
    'Ταυτότητα ή διαβατήριο': 'Documento de identidad o pasaporte',
    'Πιστωτική κάρτα στο όνομα του οδηγού για την εγγύηση': 'Una tarjeta de crédito a nombre del conductor para la fianza',
    'Ακύρωση:': 'Cancelación:',
    'Δεν υφίσταται δικαίωμα υπαναχώρησης 14 ημερών (ενοικίαση για συγκεκριμένες ημερομηνίες).':
      'No existe derecho de desistimiento de 14 días (alquiler para fechas concretas).',
    'Δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή· μετά, ή σε μη εμφάνιση, παρακρατείται {fee} από ό,τι έχετε προπληρώσει (αν πληρώνετε στην παραλαβή, δεν οφείλεται χρέωση).':
      'Cancelación gratuita hasta {hours} horas antes de la recogida; después, o en caso de no presentarse, se retienen {fee} de lo que haya pagado por adelantado (si paga en la recogida, no se le cobrará nada).',
    'Δωρεάν ακύρωση έως {hours} ώρες πριν την παραλαβή.': 'Cancelación gratuita hasta {hours} horas antes de la recogida.',
    'Για να δείτε ή να ακυρώσετε την κράτηση: <a href="{url}">{url}</a> με τον κωδικό <strong>{ref}</strong> και το email σας.':
      'Para consultar o cancelar la reserva, acceda a <a href="{url}">{url}</a> con el código <strong>{ref}</strong> y su email.',
    '<strong>Εγγύηση:</strong> δεσμεύεται στο γραφείο μας κατά την παραλαβή με πιστωτική κάρτα στο όνομα του κύριου οδηγού, ή online αν σας στείλουμε σύνδεσμο (ενεργοποιείται {hours} ώρες πριν την παραλαβή).':
      '<strong>Fianza:</strong> se bloquea en nuestra oficina en el momento de la recogida, en una tarjeta de crédito a nombre del conductor principal, u online si le enviamos un enlace (el enlace se activa {hours} horas antes de la recogida).',
    'Παράπονα:': 'Reclamaciones:',
    'Εξωδικαστική επίλυση: Συνήγορος του Καταναλωτή (www.synigoroskatanaloti.gr).':
      'Resolución extrajudicial: Defensor del Consumidor de Grecia (www.synigoroskatanaloti.gr).',
    // Στα αγγλικά/ισπανικά επισυνάπτονται η μετάφραση ΚΑΙ το ελληνικό κείμενο (src/lib/mailer.js).
    'Επισυνάπτονται οι όροι ενοικίασης (έκδοση {version}) που αποδεχθήκατε.':
      'Adjuntamos las condiciones de alquiler (versión {version}) que usted aceptó, en español y en el original griego, que prevalece en caso de discrepancia.',
    'Οι όροι ενοικίασης (έκδοση {version}) που αποδεχθήκατε: <a href="{url}">{url}</a>':
      'Las condiciones de alquiler (versión {version}) que usted aceptó: <a href="{url}">{url}</a>',
    'Καλό ταξίδι!': '¡Buen viaje!',

    // ---------- emails/booking-cancelled.ejs ----------
    'Η κράτηση <strong>{ref}</strong> ({car}, {pickup}) <strong>ακυρώθηκε</strong>.': 'La reserva <strong>{ref}</strong> ({car}, {pickup}) se ha <strong>cancelado</strong>.',
    'Αιτία: {reason}': 'Motivo: {reason}',
    'Η επιστροφή <strong>{amount}</strong> στην κάρτα σας ξεκίνησε. Το ποσό θα εμφανιστεί στον λογαριασμό σας σε 5-10 εργάσιμες ημέρες.':
      'Se ha iniciado el reembolso de <strong>{amount}</strong> en su tarjeta. El importe aparecerá en su cuenta en un plazo de 5 a 10 días hábiles.',
    'Θα επικοινωνήσουμε μαζί σας για την επιστροφή <strong>{amount}</strong> που είχατε πληρώσει.':
      'Nos pondremos en contacto con usted para reembolsarle los <strong>{amount}</strong> que había pagado.',
    'Αν δεν ζητήσατε εσείς την ακύρωση ή έχετε απορίες, επικοινωνήστε μαζί μας.':
      'Si no ha solicitado usted la cancelación o tiene alguna pregunta, póngase en contacto con nosotros.',
    // Αιτίες ακύρωσης (src/routes/booking.js, src/routes/admin.js)
    'Ακύρωση από τον πελάτη': 'Cancelada por el cliente',
    'Ακύρωση από τον πελάτη (χρέωση ακύρωσης {amount})': 'Cancelada por el cliente (cargo por cancelación de {amount})',
    'Ακύρωση από το γραφείο': 'Cancelada por nuestra oficina',

    // ---------- emails/payment-returned.ejs ----------
    'Λάβαμε πληρωμή <strong>{amount}</strong> για την κράτηση <strong>{ref}</strong>, την οποία δεν μπορέσαμε να αντιστοιχίσουμε:':
      'Hemos recibido un pago de <strong>{amount}</strong> para la reserva <strong>{ref}</strong> que no hemos podido asignar a la reserva:',
    'Το ποσό <strong>επιστρέφεται αυτόματα</strong> στην κάρτα σας και θα εμφανιστεί σε 5-10 εργάσιμες ημέρες. Δεν χρειάζεται καμία ενέργεια από εσάς. Για απορίες επικοινωνήστε μαζί μας.':
      'El importe <strong>se le reembolsa automáticamente</strong> en su tarjeta y aparecerá en un plazo de 5 a 10 días hábiles. No tiene que hacer nada. Si tiene alguna pregunta, póngase en contacto con nosotros.',
    // Αιτίες (src/lib/payments.js)
    'Το ποσό της πληρωμής δεν αντιστοιχεί στην κράτηση': 'El importe del pago no corresponde al de la reserva',
    'Η κράτηση είχε ήδη πληρωθεί (διπλή πληρωμή)': 'La reserva ya estaba pagada (pago duplicado)',
    'Η κράτηση είχε ήδη ακυρωθεί': 'La reserva ya estaba cancelada',
    'Η πληρωμή ολοκληρώθηκε αφού έληξε η προσωρινή δέσμευση και το αυτοκίνητο δεν ήταν πλέον διαθέσιμο':
      'El pago se completó cuando ya había caducado la reserva provisional del coche, que ya no estaba disponible',

    // ---------- emails/deposit-link.ejs ----------
    'Για την παραλαβή του αυτοκινήτου (κράτηση <strong>{ref}</strong>, {pickup}) απαιτείται εγγύηση <strong>{amount}</strong>.':
      'Para recoger el coche (reserva <strong>{ref}</strong>, {pickup}) se requiere una fianza de <strong>{amount}</strong>.',
    'Η εγγύηση είναι <strong>δέσμευση ποσού, όχι χρέωση</strong>, σε <strong>πιστωτική κάρτα</strong> στο όνομα του οδηγού, και αποδεσμεύεται μετά την επιστροφή του αυτοκινήτου.':
      'La fianza es un <strong>bloqueo del importe, no un cargo</strong>, en una <strong>tarjeta de crédito</strong> a nombre del conductor, y se libera tras la devolución del coche.',
    'Έγκριση εγγύησης': 'Autorizar la fianza',
    'Ο σύνδεσμος μπορεί να χρησιμοποιηθεί από {from} έως την επιστροφή του αυτοκινήτου.': 'El enlace puede utilizarse desde el {from} hasta la devolución del coche.',

    // ---------- emails/deposit-held.ejs ----------
    'Επιβεβαιώνουμε τη <strong>δέσμευση</strong> (όχι χρέωση) <strong>{amount}</strong> στην κάρτα •••• {last4} ως εγγύηση για την κράτηση <strong>{ref}</strong>.':
      'Le confirmamos el <strong>bloqueo</strong> (no cargo) de <strong>{amount}</strong> en la tarjeta •••• {last4} como fianza de la reserva <strong>{ref}</strong>.',
    'Επιβεβαιώνουμε τη <strong>δέσμευση</strong> (όχι χρέωση) <strong>{amount}</strong> ως εγγύηση για την κράτηση <strong>{ref}</strong>.':
      'Le confirmamos el <strong>bloqueo</strong> (no cargo) de <strong>{amount}</strong> como fianza de la reserva <strong>{ref}</strong>.',
    'Το ποσό θα αποδεσμευτεί μετά την επιστροφή του αυτοκινήτου. Αν προκύψουν χρεώσεις που προβλέπονται στους όρους (π.χ. καύσιμο, καθυστέρηση), θα λάβετε αναλυτική ενημέρωση. Για ζημιά απαιτείται η συναίνεσή σας.':
      'El importe se liberará tras la devolución del coche. Si se producen cargos previstos en las condiciones (p. ej., combustible o retraso), recibirá información detallada. Para cualquier cargo por daños se requiere su consentimiento.',

    // ---------- emails/deposit-settled.ejs ----------
    'Η εγγύηση για την κράτηση <strong>{ref}</strong> εκκαθαρίστηκε:': 'Se ha liquidado la fianza de la reserva <strong>{ref}</strong>:',
    'Παρακράτηση από την εγγύηση': 'Importe retenido de la fianza',
    'Αποδεσμεύτηκαν': 'Importe liberado',
    'Η εγγύηση <strong>{amount}</strong> για την κράτηση <strong>{ref}</strong> <strong>αποδεσμεύτηκε πλήρως</strong>, χωρίς καμία χρέωση.':
      'La fianza de <strong>{amount}</strong> de la reserva <strong>{ref}</strong> <strong>se ha liberado íntegramente</strong>, sin ningún cargo.',
    'Η τράπεζά σας μπορεί να χρειαστεί λίγες εργάσιμες ημέρες για να εμφανίσει το ποσό ως διαθέσιμο.':
      'Su banco puede tardar unos días hábiles en mostrar el importe como disponible.',
    'Παραμένει υπόλοιπο <strong>{amount}</strong> από αποδεκτές χρεώσεις. Μπορείτε να το εξοφλήσετε από τη σελίδα <a href="{url}">{url}</a>.':
      'Queda un saldo pendiente de <strong>{amount}</strong> por cargos aceptados. Puede abonarlo en la página <a href="{url}">{url}</a>.',
    'Εκκρεμεί η απάντησή σας για {count} χρέωση/εις ζημιάς, την οποία μπορείτε να αποδεχθείτε ή να αμφισβητήσετε από τη σελίδα της κράτησης.':
      'Seguimos a la espera de su respuesta sobre {count} cargo(s) por daños, que puede aceptar o impugnar desde la página de la reserva.',
    'Για απορίες ή αντιρρήσεις επικοινωνήστε μαζί μας.': 'Si tiene alguna pregunta u objeción, póngase en contacto con nosotros.',

    // ---------- emails/charge-added.ejs ----------
    'Μετά την επιστροφή του αυτοκινήτου (κράτηση <strong>{ref}</strong>) καταχωρήθηκε η παρακάτω χρέωση, σύμφωνα με τη γραπτή συναίνεσή σας:':
      'Tras la devolución del coche (reserva <strong>{ref}</strong>), se ha registrado el siguiente cargo, conforme a su consentimiento por escrito:',
    'Μετά την επιστροφή του αυτοκινήτου (κράτηση <strong>{ref}</strong>) καταχωρήθηκε η παρακάτω χρέωση, σύμφωνα με τον τιμοκατάλογο των όρων ενοικίασης που αποδεχθήκατε:':
      'Tras la devolución del coche (reserva <strong>{ref}</strong>), se ha registrado el siguiente cargo, conforme a las tarifas de las condiciones de alquiler que usted aceptó:',
    'Κατηγορία': 'Categoría',
    'Περιγραφή': 'Descripción',
    'Τεκμηρίωση': 'Justificación',
    'Ποσό': 'Importe',
    'Συναίνεση': 'Consentimiento',
    'Γραπτή συναίνεση πελάτη: {note}': 'Consentimiento por escrito del cliente: {note}',
    'Το ποσό θα αφαιρεθεί από την εγγύηση (αν έχει δεσμευτεί) και το υπόλοιπο θα αποδεσμευτεί· θα λάβετε ξεχωριστό email με την εκκαθάριση.':
      'El importe se descontará de la fianza (si está bloqueada) y el resto se liberará; recibirá un email aparte con la liquidación de la fianza.',
    'Ο τιμοκατάλογος: <a href="{url}">{url}</a>.': 'Tarifas: <a href="{url}">{url}</a>.',
    'Αν διαφωνείτε με τη χρέωση, απαντήστε σε αυτό το email ή γράψτε μας από τη <a href="{url}">φόρμα επικοινωνίας</a> (επιλέξτε «Αμφισβήτηση χρέωσης»).':
      'Si no está de acuerdo con el cargo, responda a este email o escríbanos mediante el <a href="{url}">formulario de contacto</a> (elija «Impugnación de un cargo»).',

    // ---------- emails/charge-notice.ejs ----------
    'Κατά τον έλεγχο του αυτοκινήτου μετά την επιστροφή (κράτηση <strong>{ref}</strong>) καταγράψαμε την παρακάτω χρέωση, που χρειάζεται την αποδοχή σας:':
      'Durante la revisión del coche tras su devolución (reserva <strong>{ref}</strong>), registramos el siguiente cargo, que requiere su aceptación:',
    'Απάντηση έως': 'Plazo de respuesta',
    'Η ευθύνη σας για ζημιές περιορίζεται στην απαλλαγή της κράτησής σας ({amount}), εκτός από τις εξαιρέσεις των όρων ενοικίασης (§7).':
      'Su responsabilidad por daños se limita a la franquicia de su reserva ({amount}), salvo las excepciones de las condiciones de alquiler (§7).',
    'Καμία τέτοια χρέωση δεν γίνεται χωρίς τη συναίνεσή σας.': 'No se realiza ningún cargo de este tipo sin su consentimiento.',
    'Μπορείτε να την αποδεχθείτε ή να την αμφισβητήσετε (με τα σχόλιά σας) από τη σελίδα της κράτησης:':
      'Puede aceptarlo o impugnarlo (con sus comentarios) desde la página de la reserva:',
    '<a href="{url}">{url}</a> (κωδικός <strong>{ref}</strong> και το email σας).': '<a href="{url}">{url}</a> (código <strong>{ref}</strong> y su email).',
    'Μπορείτε επίσης να ζητήσετε τα στοιχεία τεκμηρίωσης (φωτογραφίες, εκτίμηση/τιμολόγιο επισκευής) ή να επικοινωνήσετε μαζί μας.':
      'También puede solicitar la documentación justificativa (fotos, presupuesto/factura de reparación) o ponerse en contacto con nosotros.',

    // ---------- emails/welcome.ejs ----------
    'Καλώς ήρθατε στην {company}! Ο λογαριασμός σας δημιουργήθηκε με το email <strong>{email}</strong>.':
      '¡Bienvenido/a a {company}! Su cuenta se ha creado con el email <strong>{email}</strong>.',
    'Βρείτε το αυτοκίνητο για το επόμενο ταξίδι σας': 'Encuentre el coche para su próximo viaje',

    // ---------- emails/password-reset.ejs ----------
    'Λάβαμε αίτημα επαναφοράς του κωδικού σας. Πατήστε τον παρακάτω σύνδεσμο για να ορίσετε νέο κωδικό (ισχύει για 1 ώρα):':
      'Hemos recibido una solicitud para restablecer su contraseña. Pulse el siguiente enlace para establecer una nueva contraseña (válido durante 1 hora):',
    'Ορισμός νέου κωδικού': 'Establecer nueva contraseña',
    'Αν δεν ζητήσατε εσείς την επαναφορά, αγνοήστε αυτό το email — ο κωδικός σας δεν θα αλλάξει.':
      'Si no ha solicitado usted el restablecimiento, ignore este email: su contraseña no cambiará.',

    // ---------- emails/contact-ack.ejs ----------
    'Λάβαμε το μήνυμά σας «{subject}» στις {date}.': 'Hemos recibido su mensaje «{subject}» el {date}.',
    'Θα σας απαντήσουμε αιτιολογημένα εντός 15 ημερών.': 'Le enviaremos una respuesta motivada en un plazo de 15 días.',
    'Θα σας απαντήσουμε το συντομότερο.': 'Le responderemos lo antes posible.',
    'Αν δεν βρεθεί λύση, μπορείτε να απευθυνθείτε στον Συνήγορο του Καταναλωτή (www.synigoroskatanaloti.gr).':
      'Si no se encuentra una solución, puede dirigirse al Defensor del Consumidor de Grecia (www.synigoroskatanaloti.gr).',

    // ---------- auth/login.ejs ----------
    'Κωδικός': 'Contraseña',
    'Να με θυμάσαι για 30 ημέρες (μην το επιλέγετε σε κοινόχρηστο υπολογιστή)': 'Recordarme durante 30 días (no lo marque en un ordenador compartido)',
    'Ξεχάσατε τον κωδικό;': '¿Ha olvidado su contraseña?',
    'Δεν έχετε λογαριασμό; <a href="{url}">Δημιουργήστε έναν</a>. Μπορείτε επίσης να κάνετε κράτηση χωρίς λογαριασμό.':
      '¿No tiene cuenta? <a href="{url}">Cree una</a>. También puede reservar sin cuenta.',

    // ---------- auth/register.ejs ----------
    'Δημιουργία λογαριασμού': 'Crear una cuenta',
    'Με λογαριασμό βλέπετε όλες τις κρατήσεις σας και κλείνετε πιο γρήγορα την επόμενη.':
      'Con una cuenta puede ver todas sus reservas y hacer la siguiente más rápido.',
    'Όνομα': 'Nombre',
    'Επώνυμο': 'Apellidos',
    'Κινητό (προαιρετικό)': 'Móvil (opcional)',
    'Τουλάχιστον 10 χαρακτήρες, με γράμματα και αριθμούς.': 'Al menos 10 caracteres, con letras y números.',
    'Επιβεβαίωση κωδικού': 'Confirmar contraseña',
    'Τα στοιχεία σας χρησιμοποιούνται για τον λογαριασμό και τις κρατήσεις σας, όπως περιγράφει η <a href="{url}" target="_blank">πολιτική απορρήτου</a>. Μπορείτε να τα κατεβάσετε ή να διαγράψετε τον λογαριασμό οποτεδήποτε.':
      'Sus datos se utilizan para su cuenta y sus reservas, tal como se describe en la <a href="{url}" target="_blank">política de privacidad</a>. Puede descargarlos o eliminar su cuenta en cualquier momento.',
    'Έχετε ήδη λογαριασμό; <a href="{url}">Συνδεθείτε</a>.': '¿Ya tiene cuenta? <a href="{url}">Inicie sesión</a>.',

    // ---------- auth/forgot.ejs ----------
    'Ξέχασα τον κωδικό': 'He olvidado mi contraseña',
    'Επαναφορά κωδικού': 'Restablecer la contraseña',
    'Αν υπάρχει λογαριασμός με το email <strong>{email}</strong>, θα λάβετε σε λίγα λεπτά σύνδεσμο για να ορίσετε νέο κωδικό. Ο σύνδεσμος ισχύει για 1 ώρα.':
      'Si existe una cuenta con el email <strong>{email}</strong>, en unos minutos recibirá un enlace para establecer una nueva contraseña. El enlace es válido durante 1 hora.',
    'Συμπληρώστε το email του λογαριασμού σας και θα σας στείλουμε σύνδεσμο επαναφοράς.':
      'Indique el email de su cuenta y le enviaremos un enlace para restablecer la contraseña.',
    'Αποστολή συνδέσμου': 'Enviar enlace',

    // ---------- auth/reset.ejs ----------
    'Νέος κωδικός': 'Nueva contraseña',
    'Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει. <a href="{url}">Ζητήστε νέο σύνδεσμο</a>.':
      'El enlace no es válido o ha caducado. <a href="{url}">Solicite un nuevo enlace</a>.',
    'Επιβεβαίωση': 'Confirmar contraseña',
    'Αποθήκευση': 'Guardar',

    // ---------- account/index.ejs ----------
    'Ο λογαριασμός μου': 'Mi cuenta',
    'Γεια σας, {name}': 'Hola, {name}',
    'Οι κρατήσεις μου': 'Mis reservas',
    'Δεν έχετε κρατήσεις ακόμη.': 'Todavía no tiene reservas.',
    'Βρείτε αυτοκίνητο': 'Buscar coche',
    'Κωδικός {ref}': 'Código {ref}',
    'Στοιχεία': 'Sus datos',
    'Τηλέφωνο': 'Teléfono',
    'Αλλαγή κωδικού': 'Cambiar la contraseña',
    'Τρέχων κωδικός': 'Contraseña actual',
    'Τα δεδομένα μου': 'Mis datos',
    'Κατεβάστε όλα τα δεδομένα του λογαριασμού και των κρατήσεών σας (αρχείο JSON).':
      'Descargue todos los datos de su cuenta y de sus reservas (archivo JSON).',
    'Λήψη δεδομένων': 'Descargar datos',
    'Διαγραφή λογαριασμού': 'Eliminar la cuenta',
    'Ο λογαριασμός θα διαγραφεί οριστικά. Συνέχεια;': 'Su cuenta se eliminará definitivamente. ¿Desea continuar?',
    'Οι κρατήσεις σας θα διατηρηθούν όσο απαιτεί η φορολογική νομοθεσία, αλλά δεν θα συνδέονται πλέον με λογαριασμό. Τα στοιχεία διπλώματος, γέννησης και επικοινωνίας διαγράφονται αυτόματα {months} μήνες μετά την επιστροφή. Δεν είναι δυνατή η διαγραφή όσο εκκρεμεί κράτηση, εγγύηση ή χρέωση.':
      'Sus reservas se conservarán durante el tiempo que exija la legislación fiscal, pero ya no estarán vinculadas a ninguna cuenta. Los datos del permiso de conducir, la fecha de nacimiento y los datos de contacto se eliminan automáticamente {months} meses después de la devolución. No es posible eliminar la cuenta mientras haya una reserva, una fianza o un cargo pendiente.',
    'Οριστική διαγραφή': 'Eliminar definitivamente',

    // ---------- Μηνύματα σφάλματος και flash (src/routes/auth.js, src/routes/account.js, src/lib/validation.js, src/middleware/auth.js) ----------
    'Συνδεθείτε για να συνεχίσετε.': 'Inicie sesión para continuar.',
    'Λάθος email ή κωδικός.': 'Email o contraseña incorrectos.',
    'Συμπληρώστε το όνομα.': 'Indique su nombre.',
    'Συμπληρώστε το επώνυμο.': 'Indique sus apellidos.',
    'Συμπληρώστε έγκυρο email.': 'Indique un email válido.',
    'Μη έγκυρο τηλέφωνο.': 'Número de teléfono no válido.',
    'Οι κωδικοί δεν ταιριάζουν.': 'Las contraseñas no coinciden.',
    'Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδεθείτε ή επαναφέρετε τον κωδικό σας.':
      'Ya existe una cuenta con este email. Inicie sesión o restablezca su contraseña.',
    'Ο κωδικός πρέπει να έχει τουλάχιστον 10 χαρακτήρες.': 'La contraseña debe tener al menos 10 caracteres.',
    'Ο κωδικός είναι πολύ μεγάλος.': 'La contraseña es demasiado larga.',
    'Ο κωδικός πρέπει να περιέχει γράμματα και αριθμούς.': 'La contraseña debe contener letras y números.',
    'Ο τρέχων κωδικός είναι λάθος.': 'La contraseña actual es incorrecta.',
    'Ο λογαριασμός σας δημιουργήθηκε.': 'Su cuenta se ha creado.',
    'Ο κωδικός σας άλλαξε.': 'Su contraseña se ha cambiado.',
    'Τα στοιχεία σας ενημερώθηκαν.': 'Sus datos se han actualizado.',
    'Ο λογαριασμός διαχειριστή δεν μπορεί να διαγραφεί από εδώ.': 'Una cuenta de administrador no puede eliminarse desde aquí.',
    'Ο κωδικός είναι λάθος. Ο λογαριασμός δεν διαγράφηκε.': 'La contraseña es incorrecta. La cuenta no se ha eliminado.',
    'Έχετε ενεργή κράτηση, εγγύηση ή εκκρεμή χρέωση. Ο λογαριασμός μπορεί να διαγραφεί μόλις ολοκληρωθούν (ή ακυρώστε πρώτα την κράτηση).':
      'Tiene una reserva o una fianza activa o un cargo pendiente. Podrá eliminar la cuenta cuando se hayan completado (o cancele antes la reserva).',
  },
};
