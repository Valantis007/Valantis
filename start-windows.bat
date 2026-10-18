@echo off
chcp 65001 >nul
title Rent a Car - τοπική ιστοσελίδα
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Δεν βρέθηκε το Node.js. Εγκαταστήστε την έκδοση LTS από https://nodejs.org και ξανατρέξτε αυτό το αρχείο.
  pause
  exit /b 1
)

rem Εγκατάσταση (ή ενημέρωση μετά από νέα έκδοση) των απαραίτητων αρχείων.
fc /b package-lock.json node_modules\.installed-lock >nul 2>nul
if errorlevel 1 (
  echo Εγκατάσταση των απαραίτητων αρχείων ^(1-2 λεπτά^)...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
  copy /y package-lock.json node_modules\.installed-lock >nul
)

if not exist .env (
  copy .env.local.example .env >nul
  echo Δημιουργήθηκε το αρχείο ρυθμίσεων .env ^(για δοκιμαστικές πληρωμές βάλτε εκεί το κλειδί του Stripe^).
)

if exist data\app.db goto run
echo Δημιουργία βάσης με ενδεικτικά αυτοκίνητα...
call npm run seed
echo.
echo Δημιουργία λογαριασμού διαχειριστή (για τη σελίδα /admin).
set /p ADMIN_E=Email διαχειριστή: 
set /p ADMIN_P=Κωδικός (10+ χαρακτήρες, γράμματα και αριθμοί): 
call npm run create-admin -- "%ADMIN_E%" "%ADMIN_P%"

:run

rem Αν τρέχει ήδη η ιστοσελίδα (π.χ. παλιά έκδοση σε άλλο παράθυρο), κλείνει πρώτα· αλλιώς η παλιά
rem έκδοση θα απαντούσε με τα νέα αρχεία και θα έβγαζε «Σφάλμα 500».
set OLDPID=
for /f "usebackq" %%p in (`powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess"`) do set OLDPID=%%p
if not defined OLDPID goto start
tasklist /fi "PID eq %OLDPID%" | find /i "node.exe" >nul
if errorlevel 1 (
  echo.
  echo Η θύρα 3000 χρησιμοποιείται από άλλο πρόγραμμα. Κλείστε το ή επανεκκινήστε τον υπολογιστή και ξαναδοκιμάστε.
  pause
  exit /b 1
)
echo Η ιστοσελίδα έτρεχε ήδη σε άλλο παράθυρο: κλείνει και ξεκινά η νέα.
taskkill /pid %OLDPID% /f >nul
timeout /t 2 >nul

:start
echo.
echo ============================================================
echo  Η ιστοσελίδα τρέχει στο:  http://localhost:3000
echo  Διαχείριση:               http://localhost:3000/admin
echo.
echo  ΜΗΝ κλείσετε αυτό το παράθυρο όσο τη χρησιμοποιείτε.
echo  Κλείνοντάς το, η ιστοσελίδα σταματά. Για να την ξανανοίξετε,
echo  κάντε ξανά διπλό κλικ σε αυτό το αρχείο.
echo ============================================================
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"

:server
node --disable-warning=ExperimentalWarning src\server.js
rem Κωδικός 75: ζητήθηκε επανεκκίνηση από τη Διαχείριση (π.χ. μετά από αλλαγή ρυθμίσεων).
if %errorlevel%==75 (
  echo.
  echo Επανεκκίνηση με τις νέες ρυθμίσεις...
  goto server
)
pause
