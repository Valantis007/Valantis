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

if not exist node_modules (
  echo Πρώτη εκκίνηση: εγκατάσταση των απαραίτητων αρχείων ^(1-2 λεπτά^)...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
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
call npm start
pause
