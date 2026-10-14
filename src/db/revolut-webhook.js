'use strict';

// Χρήση: npm run revolut:webhook
// Εγγράφει στο Revolut τη διεύθυνση https://<BASE_URL>/webhooks/revolut και εμφανίζει
// το signing secret που πρέπει να μπει στο REVOLUT_WEBHOOK_SECRET του αρχείου .env.

const config = require('../config');
const { createClient } = require('../lib/providers/revolut-client');

const EVENTS = ['ORDER_COMPLETED', 'ORDER_AUTHORISED', 'ORDER_CANCELLED', 'ORDER_FAILED'];

async function main() {
  if (!config.revolut.secretKey) throw new Error('Ορίστε πρώτα το REVOLUT_SECRET_KEY στο .env');
  if (!config.baseUrl.startsWith('https://')) throw new Error('Το BASE_URL πρέπει να είναι δημόσια διεύθυνση https://');
  const client = createClient({ secretKey: config.revolut.secretKey, sandbox: config.revolut.sandbox });
  const url = `${config.baseUrl}/webhooks/revolut`;
  const list = await client.listWebhooks();
  const existing = Array.isArray(list) ? list : (list && list.webhooks) || [];
  const found = existing.find((w) => w.url === url);
  // Η λίστα δεν περιέχει το signing secret: το διαβάζουμε από το συγκεκριμένο webhook.
  const hook = found ? await client.getWebhook(found.id) : await client.createWebhook(url, EVENTS);
  console.log(found ? 'Το webhook υπάρχει ήδη:' : 'Δημιουργήθηκε webhook:', url);
  console.log('\nΒάλτε στο αρχείο .env:\nREVOLUT_WEBHOOK_SECRET=' + hook.signing_secret);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
