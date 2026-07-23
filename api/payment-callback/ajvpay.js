// ============================================================
// MrBokou (serveur) — POST /api/payment-callback/ajvpay
// Webhook AJV Pay : seule voie légitime pour faire passer un devis en
// "accepte" (voir guard_quote_update() côté SQL, qui l'impose aussi).
// ============================================================
const { verifyAjvPayWebhookSignature } = require("../_lib/ajvpay");
const { supabaseAdmin } = require("../_lib/supabaseAdmin");

const AMOUNT_TOLERANCE = 0.01;

// Corps brut requis pour vérifier la signature : on désactive le parsing
// JSON automatique de Vercel et on lit le flux nous-mêmes.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const rawBody = await readRawBody(req);
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Corps de requête invalide" });
  }

  const signature = req.headers["x-signature"];
  if (!verifyAjvPayWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: "Signature invalide" });
  }

  const quoteId = payload.metadata?.mrbokou_quote_id;
  if (!quoteId) return res.status(400).json({ error: "Référence manquante" });

  const admin = supabaseAdmin();
  const { data: quote } = await admin.from("quotes").select("id, amount, payment_status").eq("id", quoteId).single();
  if (!quote) return res.status(404).json({ error: "Devis introuvable" });
  if (quote.payment_status === "paye") return res.status(200).json({ status: "already_processed" });

  if (payload.status === "succeeded") {
    const declaredAmount = Number(payload.amount);
    if (Number.isFinite(declaredAmount) && Math.abs(declaredAmount - quote.amount) > AMOUNT_TOLERANCE) {
      return res.status(409).json({ error: "Montant incohérent" });
    }
    await admin.from("quotes").update({
      status: "accepte",
      payment_status: "paye",
      payment_id: payload.payment_id || quote.payment_id
    }).eq("id", quoteId);
    return res.status(200).json({ status: "ok" });
  }

  if (payload.status === "failed") {
    await admin.from("quotes").update({ payment_status: "echoue" }).eq("id", quoteId);
    return res.status(200).json({ status: "ok" });
  }

  return res.status(200).json({ status: "ignored" });
};
