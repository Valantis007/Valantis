#!/bin/bash
# Διπλό κλικ για να ξεκινήσει η ιστοσελίδα στον υπολογιστή σας (macOS).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Δεν βρέθηκε το Node.js. Εγκαταστήστε την έκδοση LTS από https://nodejs.org και ξανατρέξτε αυτό το αρχείο."
  read -r -n 1 -p "Πατήστε ένα πλήκτρο για έξοδο..."
  exit 1
fi

# Εγκατάσταση (ή ενημέρωση μετά από νέα έκδοση) των απαραίτητων αρχείων.
if ! cmp -s package-lock.json node_modules/.installed-lock; then
  echo "Εγκατάσταση των απαραίτητων αρχείων (1-2 λεπτά)..."
  npm install || { read -r -n 1 -p "Σφάλμα. Πατήστε ένα πλήκτρο..."; exit 1; }
  cp package-lock.json node_modules/.installed-lock
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

# Αν τρέχει ήδη η ιστοσελίδα (π.χ. παλιά έκδοση σε άλλο παράθυρο), κλείνει πρώτα· αλλιώς η παλιά
# έκδοση θα απαντούσε με τα νέα αρχεία και θα έβγαζε «Σφάλμα 500».
OLDPID=$(lsof -ti tcp:3000 -sTCP:LISTEN 2>/dev/null | head -n 1)
if [ -n "$OLDPID" ]; then
  if ps -p "$OLDPID" -o comm= | grep -qi node; then
    echo "Η ιστοσελίδα έτρεχε ήδη σε άλλο παράθυρο: κλείνει και ξεκινά η νέα."
    kill "$OLDPID"; sleep 2
  else
    echo "Η θύρα 3000 χρησιμοποιείται από άλλο πρόγραμμα. Κλείστε το και ξαναδοκιμάστε."
    read -r -n 1 -p "Πατήστε ένα πλήκτρο για έξοδο..."; exit 1
  fi
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
# Κωδικός 75: ζητήθηκε επανεκκίνηση από τη Διαχείριση (π.χ. μετά από αλλαγή ρυθμίσεων).
while true; do
  node --disable-warning=ExperimentalWarning src/server.js
  [ $? -eq 75 ] || break
  echo "Επανεκκίνηση με τις νέες ρυθμίσεις..."
done
