'use strict';

// Μεταγραφή ελληνικών σε λατινικούς χαρακτήρες κατά ΕΛΟΤ 743 (το πρότυπο των ελληνικών
// διαβατηρίων): «Θεσσαλονίκη» → "Thessaloniki", «Ι.Κ.Ε.» → "I.K.E.", «Μπάμπης» → "Bampis".
// Χρησιμοποιείται ως τελευταία λύση στις ξένες γλώσσες, ώστε ο πελάτης να μη δει ποτέ ελληνικά
// γράμματα σε στοιχεία που δεν έχουν μετάφραση (π.χ. διεύθυνση της επιχείρησης από το .env).

const SINGLE = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm',
  ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};
// Πριν από άηχα σύμφωνα (και στο τέλος της λέξης) τα αυ/ευ/ηυ γράφονται af/ef/if, αλλιώς av/ev/iv.
const VOICELESS = new Set(['θ', 'κ', 'ξ', 'π', 'σ', 'ς', 'τ', 'φ', 'χ', 'ψ']);
const VOWEL_PAIRS = { αι: 'ai', ει: 'ei', οι: 'oi', ου: 'ou', υι: 'yi' };
const V_PAIRS = { αυ: 'a', ευ: 'e', ηυ: 'i' };
const CONSONANT_PAIRS = { γγ: 'ng', γκ: 'gk', γξ: 'nx', γχ: 'nch' };
// Σημεία στίξης του ελληνικού block του Unicode.
const PUNCTUATION = { ';': ';', '·': '·', 'ʹ': "'", '͵': ',', '΄': "'", '΅': "'" };

// Οποιοδήποτε ελληνικό γράμμα (και πολυτονικό).
const GREEK_RE = /[Ͱ-Ͽἀ-῿]/;
// Ελληνικά που δεν μοιάζουν με λατινικά: πεζά ή κεφαλαία όπως Γ, Δ, Λ, Ω. Οι πινακίδες
// (π.χ. «ΝΒΑ1001») έχουν μόνο κεφαλαία που μοιάζουν με λατινικά και δεν μετράνε ως ελληνικό κείμενο.
const GREEK_TEXT_RE = /[ά-ώἀ-῿ΓΔΘΛΞΠΣΦΨΩΆΈ-ΏΐΪΫ]/;

function hasGreek(text) {
  return GREEK_RE.test(String(text ?? ''));
}

function looksGreek(text) {
  return GREEK_TEXT_RE.test(String(text ?? ''));
}

function info(ch) {
  const d = ch.normalize('NFD');
  const base = d[0];
  const lower = base.toLowerCase();
  return {
    ch,
    lower,
    greek: Object.hasOwn(SINGLE, lower),
    letter: /\p{L}/u.test(base),
    upper: base !== lower,
    accent: d.includes('́'),
    diaeresis: d.includes('̈'),
  };
}

function transliterate(text) {
  if (text === null || text === undefined) return '';
  const source = String(text).replace(/[\u0374\u0375\u037E\u0384\u0385\u0387]/g, (c) => PUNCTUATION[c]);
  const chars = [...source.normalize('NFKC')].map(info);
  // Λέξη γραμμένη όλη με κεφαλαία («ΘΕΣΣΑΛΟΝΙΚΗ» → "THESSALONIKI"· «Θεσσαλονίκη» → "Thessaloniki").
  const allCaps = new Array(chars.length).fill(false);
  for (let i = 0; i < chars.length; ) {
    if (!chars[i].letter) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < chars.length && chars[j].letter) j += 1;
    const word = chars.slice(i, j);
    const caps = word.length > 1 && word.every((c) => c.upper || !c.greek);
    for (let k = i; k < j; k += 1) allCaps[k] = caps;
    i = j;
  }
  const isLetter = (i) => i >= 0 && i < chars.length && chars[i].letter;
  let out = '';
  const emit = (latin, i) => {
    const c = chars[i];
    if (!c.upper) out += latin;
    else out += allCaps[i] ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
  };
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i];
    if (!c.greek) {
      out += c.ch;
      continue;
    }
    const next = chars[i + 1];
    if (next && next.greek) {
      const pair = c.lower + next.lower;
      // Δίψηφα φωνήεντα: όχι όταν τονίζεται το πρώτο ή όταν το δεύτερο έχει διαλυτικά («άυλος», «αϋπνία»).
      const joined = !c.accent && !next.diaeresis;
      if (joined && VOWEL_PAIRS[pair]) {
        emit(VOWEL_PAIRS[pair], i);
        i += 1;
        continue;
      }
      if (joined && V_PAIRS[pair]) {
        const after = chars[i + 2];
        const f = !after || !after.letter || (after.greek && VOICELESS.has(after.lower));
        emit(`${V_PAIRS[pair]}${f ? 'f' : 'v'}`, i);
        i += 1;
        continue;
      }
      if (CONSONANT_PAIRS[pair]) {
        emit(CONSONANT_PAIRS[pair], i);
        i += 1;
        continue;
      }
      // «μπ» = b στην αρχή και στο τέλος της λέξης, mp στη μέση («Μπάμπης» → "Bampis").
      if (pair === 'μπ') {
        emit(!isLetter(i - 1) || !isLetter(i + 2) ? 'b' : 'mp', i);
        i += 1;
        continue;
      }
    }
    emit(SINGLE[c.lower], i);
  }
  return out;
}

module.exports = { transliterate, hasGreek, looksGreek };
