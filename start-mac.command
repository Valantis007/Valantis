#!/bin/bash
# Διπλό κλικ για να ξεκινήσει η ιστοσελίδα στον υπολογιστή σας (macOS).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Δεν βρέθηκε το Node.js. Εγκαταστήστε την έκδοση LTS από https://nodejs.org και ξανατρέξτε αυτό το αρχείο."
  read -r -n 1 -p "Πατήστε ένα πλήκτρο για έξοδο..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Πρώτη εκκίνηση: εγκατάσταση των απαραίτητων αρχείων (1-2 λεπτά)..."
  npm install || { read -r -n 1 -p "Σφάλμα. Πατήστε ένα πλήκτρο..."; exit 1; }
fi

if [ ! -f .env ]; then
  cp .env.local.example .env
  echo "Δημιουργήθηκε το αρχείο ρυθμίσεων .env (για δοκιμαστικές πληρωμές βάλτε εκεί το κλειδί του Stripe)."
fi

if [ ! -f data/app.db ]; then
  echo "Δημιουργία βάσης με ενδεικτικά αυτοκίνητα..."
  npm run seed
  echo
  echo "Δημιουργία λογαριασμού διαχειριστή (για τη σελίδα /admin)."
  read -r -p "Email διαχειριστή: " ADMIN_E
  read -r -s -p "Κωδικός (10+ χαρακτήρες, γράμματα και αριθμοί): " ADMIN_P
  echo
  npm run create-admin -- "$ADMIN_E" "$ADMIN_P"
fi

echo
echo "============================================================"
echo " Η ιστοσελίδα τρέχει στο:  http://localhost:3000"
echo " Διαχείριση:               http://localhost:3000/admin"
echo
echo " ΜΗΝ κλείσετε αυτό το παράθυρο όσο τη χρησιμοποιείτε."
echo " Κλείνοντάς το, η ιστοσελίδα σταματά. Για να την ξανανοίξετε,"
echo " κάντε ξανά διπλό κλικ σε αυτό το αρχείο."
echo "============================================================"
echo
(sleep 3 && open "http://localhost:3000") &
npm start
