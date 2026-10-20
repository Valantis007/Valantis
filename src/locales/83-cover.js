'use strict';

// «Κάλυψη ζημιών» στη φόρμα κράτησης (βασική κάλυψη ή Πλήρης Απαλλαγή FDW), η γραμμή της FDW στη σελίδα
// του αυτοκινήτου και η κάτω μπάρα στο κινητό (σύνολο και επόμενο βήμα).
// Ορολογία (docs/i18n.md): απαλλαγή / συμμετοχή σε ζημιές = excess / franquicia,
// εγγύηση = security deposit / fianza, Πλήρης Απαλλαγή (FDW) = Full Damage Waiver / Exención total por daños.

module.exports = {
  en: {
    // Φόρμα κράτησης (views/booking/new.ejs)
    'Κάλυψη ζημιών': 'Damage cover',
    'Βασική κάλυψη (περιλαμβάνεται)': 'Basic cover (included)',
    'Συμμετοχή σας σε ζημιές έως {excess}': 'Your excess for damage: up to {excess}',
    'Πλήρης Απαλλαγή (FDW)': 'Full Damage Waiver (FDW)',
    'Συμμετοχή σας σε ζημιές {zero}': 'Your excess for damage: {zero}',
    '<strong>+{price}/ημέρα</strong> ({total} για {n} ημέρες)': '<strong>+{price}/day</strong> ({total} for {n} days)',
    '<strong>+{price}/ημέρα</strong> ({total} για 1 ημέρα)': '<strong>+{price}/day</strong> ({total} for 1 day)',
    'Η εγγύηση στην πιστωτική κάρτα είναι {deposit} και στις δύο περιπτώσεις.':
      'The security deposit on the credit card is {deposit} in both cases.',
    'Η Πλήρης Απαλλαγή (FDW) δεν είναι ασφαλιστικό προϊόν: είναι συμβατική παραίτηση της εταιρείας από αξιώσεις για ζημιές του οχήματος.':
      'The Full Damage Waiver (FDW) is not an insurance product: it is a contractual waiver by the company of claims for damage to the vehicle.',
    'Εξαιρέσεις και για τις δύο καλύψεις: <a href="{url}" target="_blank">όροι ενοικίασης, §7</a> (π.χ. ζημιές από δόλο ή βαριά αμέλεια, οδήγηση υπό την επίδραση αλκοόλ ή ουσιών).':
      'Exclusions for both types of cover: <a href="{url}" target="_blank">rental terms, §7</a> (e.g. damage caused intentionally or through gross negligence, driving under the influence of alcohol or drugs).',
    'Σύνοψη & ολοκλήρωση': 'Summary & finish',
    // Σελίδα αυτοκινήτου (views/pages/car.ejs)
    'Βασική κάλυψη ζημιών (CDW) — απαλλαγή {amount}': 'Basic damage cover (CDW) — excess {amount}',
    'Μηδενική συμμετοχή με την Πλήρη Απαλλαγή (FDW): +{price}/ημέρα': 'Zero excess with the Full Damage Waiver (FDW): +{price}/day',
    'Μηδενική συμμετοχή με την Πλήρη Απαλλαγή (FDW): +{price} ανά ενοικίαση': 'Zero excess with the Full Damage Waiver (FDW): +{price} per rental',
    '<strong>{total}</strong> για {n} ημέρες': '<strong>{total}</strong> for {n} days',
    '<strong>{total}</strong> για 1 ημέρα': '<strong>{total}</strong> for 1 day',
    'από<br><strong>{price}</strong> / ημέρα': 'from<br><strong>{price}</strong> / day',
  },
  es: {
    'Κάλυψη ζημιών': 'Cobertura de daños',
    'Βασική κάλυψη (περιλαμβάνεται)': 'Cobertura básica (incluida)',
    'Συμμετοχή σας σε ζημιές έως {excess}': 'Su franquicia por daños: hasta {excess}',
    'Πλήρης Απαλλαγή (FDW)': 'Exención total por daños (FDW)',
    'Συμμετοχή σας σε ζημιές {zero}': 'Su franquicia por daños: {zero}',
    '<strong>+{price}/ημέρα</strong> ({total} για {n} ημέρες)': '<strong>+{price}/día</strong> ({total} por {n} días)',
    '<strong>+{price}/ημέρα</strong> ({total} για 1 ημέρα)': '<strong>+{price}/día</strong> ({total} por 1 día)',
    'Η εγγύηση στην πιστωτική κάρτα είναι {deposit} και στις δύο περιπτώσεις.':
      'La fianza en la tarjeta de crédito es de {deposit} en ambos casos.',
    'Η Πλήρης Απαλλαγή (FDW) δεν είναι ασφαλιστικό προϊόν: είναι συμβατική παραίτηση της εταιρείας από αξιώσεις για ζημιές του οχήματος.':
      'La Exención total por daños (FDW) no es un producto de seguro: es una renuncia contractual de la empresa a reclamar por los daños del vehículo.',
    'Εξαιρέσεις και για τις δύο καλύψεις: <a href="{url}" target="_blank">όροι ενοικίασης, §7</a> (π.χ. ζημιές από δόλο ή βαριά αμέλεια, οδήγηση υπό την επίδραση αλκοόλ ή ουσιών).':
      'Exclusiones para ambas coberturas: <a href="{url}" target="_blank">condiciones de alquiler, §7</a> (p. ej., daños causados con dolo o negligencia grave, conducción bajo los efectos del alcohol o de drogas).',
    'Σύνοψη & ολοκλήρωση': 'Resumen y finalizar',
    'Βασική κάλυψη ζημιών (CDW) — απαλλαγή {amount}': 'Cobertura básica de daños (CDW): franquicia de {amount}',
    'Μηδενική συμμετοχή με την Πλήρη Απαλλαγή (FDW): +{price}/ημέρα': 'Franquicia cero con la Exención total por daños (FDW): +{price}/día',
    'Μηδενική συμμετοχή με την Πλήρη Απαλλαγή (FDW): +{price} ανά ενοικίαση': 'Franquicia cero con la Exención total por daños (FDW): +{price} por alquiler',
    '<strong>{total}</strong> για {n} ημέρες': '<strong>{total}</strong> por {n} días',
    '<strong>{total}</strong> για 1 ημέρα': '<strong>{total}</strong> por 1 día',
    'από<br><strong>{price}</strong> / ημέρα': 'desde<br><strong>{price}</strong> / día',
  },
};
