'use strict';

// WhatsApp (click-to-chat): σύνδεσμοι https://wa.me/<αριθμός>?text=<μήνυμα>. Το WhatsApp ανοίγει
// συνομιλία με έτοιμο κείμενο· τίποτα δεν στέλνεται πριν πατήσει ο χρήστης «Αποστολή».
//
//  - Πελάτης → γραφείο: μόνο όταν έχει οριστεί COMPANY_WHATSAPP (config.company.whatsapp).
//    Το έτοιμο κείμενο είναι στη γλώσσα της σελίδας/του email.
//  - Γραφείο → πελάτης (Διαχείριση → κράτηση): στο τηλέφωνο της κράτησης, με σύντομο μήνυμα στη
//    γλώσσα του πελάτη (bookings.locale).

const config = require('../config');
const i18n = require('./i18n');
const format = require('./format');
const company = require('./company');
const { internationalDigits } = require('./phone');

const GENERAL_TEXT = 'Γεια σας, έχω μια ερώτηση.';
const BOOKING_TEXT = 'Γεια σας, έχω μια ερώτηση για την κράτηση {ref}.';
const HOURS_TEXT = 'Απαντάμε {from}–{to}';

function chatUrl(number, text = '') {
  const digits = internationalDigits(number);
  if (!digits) return null;
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

// Ώρες απάντησης = ωράριο του γραφείου (OPENING_HOUR / CLOSING_HOUR).
function replyHours(rules = config.rules) {
  return { from: `${String(rules.openingHour).padStart(2, '0')}:00`, to: `${String(rules.closingHour).padStart(2, '0')}:00` };
}

/**
 * Για τα templates (σελίδες και emails): null όταν δεν έχει οριστεί αριθμός, αλλιώς
 *   url(ref)  σύνδεσμος με το έτοιμο μήνυμα (με τον κωδικό κράτησης, αν δοθεί)
 *   hours     «Απαντάμε 08:00–22:00» στη γλώσσα
 *   display   ο αριθμός για ανάγνωση/εκτύπωση (+306941234567)
 */
function forLocale(locale, number = config.company.whatsapp) {
  const digits = internationalDigits(number);
  if (!digits) return null;
  const t = (key, params) => i18n.t(locale, key, params);
  return {
    number: digits,
    display: `+${digits}`,
    hours: t(HOURS_TEXT, replyHours()),
    text: (ref) => (ref ? t(BOOKING_TEXT, { ref }) : t(GENERAL_TEXT)),
    url(ref) {
      return chatUrl(digits, this.text(ref));
    },
  };
}

// Έτοιμα μηνύματα του γραφείου προς τον πελάτη (στη Διαχείριση → κράτηση).
const CUSTOMER_TEMPLATES = [
  {
    code: 'ready',
    label: 'Το αυτοκίνητο είναι έτοιμο',
    text: 'Γεια σας {name}, εδώ {company}. Το αυτοκίνητο της κράτησης {ref} είναι έτοιμο για την παραλαβή στις {date} ({place}).',
  },
  {
    code: 'flight',
    label: 'Ζητήστε τον αριθμό πτήσης',
    text: 'Γεια σας {name}, εδώ {company}. Για την κράτηση {ref} (παραλαβή στις {date}), θα μπορούσατε να μας στείλετε τον αριθμό της πτήσης σας; Έτσι θα σας περιμένουμε ακόμη κι αν η πτήση καθυστερήσει.',
  },
  {
    code: 'general',
    label: 'Γενικό μήνυμα',
    text: 'Γεια σας {name}, εδώ {company}, σχετικά με την κράτησή σας {ref}.',
  },
];

/**
 * Σύνδεσμοι «WhatsApp στον πελάτη» για μια κράτηση. { phone, links: [{ code, label, text, url }] }
 * ή { phone: null } αν το τηλέφωνο λείπει ή δεν έχει κωδικό χώρας.
 */
function customerLinks(booking) {
  const phone = internationalDigits(booking.phone);
  if (!phone) return { phone: null, links: [] };
  const locale = i18n.isLocale(booking.locale) ? booking.locale : i18n.DEFAULT_LOCALE;
  const fmt = format.forLocale(locale);
  // Παράδοση στη διεύθυνση του πελάτη (π.χ. ξενοδοχείο): αυτή, αλλιώς το σημείο παραλαβής.
  const place = booking.pickup_address
    ? require('./places').shownAddress(booking.pickup_address, (v) => i18n.t(locale, v))
    : i18n.field(booking, 'pickup_location_name', locale);
  const params = {
    name: booking.first_name,
    company: company.forLocale(locale).name,
    ref: booking.reference,
    date: fmt.dateTime(booking.pickup_at),
    place,
  };
  return {
    phone,
    links: CUSTOMER_TEMPLATES.map((tpl) => {
      const text = i18n.t(locale, tpl.text, params);
      return { code: tpl.code, label: tpl.label, text, url: chatUrl(phone, text) };
    }),
  };
}

module.exports = { chatUrl, replyHours, forLocale, customerLinks, CUSTOMER_TEMPLATES, GENERAL_TEXT, BOOKING_TEXT, HOURS_TEXT };
