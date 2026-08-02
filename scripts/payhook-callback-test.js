/**
 * PayHook callback end-to-end verification (test harness).
 *
 * Steps:
 *  1. Read the saved PayHook secret key from payment_config.
 *  2. Insert a PENDING payhook transaction row.
 *  3. Compute the expected HMAC-SHA256 signature (order_id|status|amount).
 *  4. Print everything so the callback can be replayed via curl.
 */
const Database = require("better-sqlite3");
const { createHmac, randomUUID } = require("crypto");
const db = new Database("data/mikhmon.db");

const cfg = db
  .prepare("SELECT payhookEnabled, payhookEnv, payhookSecretKey FROM payment_config WHERE key = ?")
  .get("default");
console.log("payhook config row:", JSON.stringify(cfg));

if (!cfg || !cfg.payhookSecretKey) {
  console.error("No payhookSecretKey configured — cannot build a valid signature.");
  process.exit(1);
}

const orderId = "E2E-TEST-PAYHOOK-" + Date.now();
const amount = 25000;
const status = "COMPLETED";
const row = {
  id: randomUUID(),
  orderId,
  reference: "",
  purpose: "other",
  referenceId: "TEST-REF",
  amount,
  paymentMethod: "QRIS",
  status: "pending",
  transactionStatus: "PENDING",
  customerName: "Test Customer",
  customerEmail: "test@example.com",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

db.prepare(
  `INSERT INTO payhook_payment_transactions
     (id, orderId, reference, purpose, referenceId, amount, paymentMethod,
      status, transactionStatus, customerName, customerEmail, createdAt, updatedAt)
   VALUES
     (@id, @orderId, @reference, @purpose, @referenceId, @amount, @paymentMethod,
      @status, @transactionStatus, @customerName, @customerEmail, @createdAt, @updatedAt)`
).run(row);

const signature = createHmac("sha256", cfg.payhookSecretKey)
  .update(`${orderId}|${status}|${amount}`)
  .digest("hex");

console.log("orderId:", orderId);
console.log("amount:", amount);
console.log("status:", status);
console.log("signature:", signature);
console.log("CALLBACK_JSON=" + JSON.stringify({ order_id: orderId, status, amount: String(amount), signature }));

db.close();

