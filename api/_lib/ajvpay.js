// ============================================================
// MrBokou (serveur) — Client AJV Pay
// Même mécanique que mavahi-web/src/lib/payments/ajvpay.ts : la signature
// HMAC porte sur la chaîne JSON EXACTE envoyée (jamais une resérialisation).
// ============================================================
const crypto = require("crypto");

const BASE_URL = process.env.AJVPAY_API_BASE_URL || "https://ajv-pay-mvp-production.up.railway.app";

function sign(body) {
  const secret = process.env.AJVPAY_HMAC_SECRET;
  if (!secret) throw new Error("AJVPAY_HMAC_SECRET manquant : signature refusée.");
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function ajvPayRequest(path, { method = "GET", body, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${process.env.AJVPAY_API_KEY}` };
  let bodyString;
  if (body) {
    bodyString = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
    headers["X-Signature"] = sign(bodyString);
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: bodyString });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`AJV Pay ${method} ${path} a échoué (HTTP ${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

// Crée un paiement 'fedapay' pour un devis MrBokou. La référence du devis
// est transmise dans metadata : AJV Pay la renvoie telle quelle dans le
// webhook, ce qui permet de retrouver le devis sans qu'AJV Pay connaisse
// notre schéma. Idempotency-Key = id du devis : un double clic ne crée
// jamais deux paiements pour le même devis.
async function createFedapayPayment({ amount, phoneNumber, quoteId }) {
  return ajvPayRequest("/payments", {
    method: "POST",
    body: {
      amount,
      currency: "XOF",
      method: "fedapay",
      phoneNumber,
      metadata: { mrbokou_quote_id: quoteId }
    },
    idempotencyKey: quoteId
  });
}

// Vérifie la signature d'un webhook entrant. Doit recevoir le corps BRUT
// (pas re-sérialisé depuis un objet déjà parsé).
function verifyAjvPayWebhookSignature(rawBody, signature) {
  if (!signature) return false;
  const expected = sign(rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { createFedapayPayment, verifyAjvPayWebhookSignature };
