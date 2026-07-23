// ============================================================
// MrBokou (serveur) — POST /api/create-payment
// Le client accepte un devis : on crée le paiement AJV Pay correspondant
// et on renvoie l'URL de paiement hébergée vers laquelle rediriger.
// L'acceptation réelle du devis (quotes.status = 'accepte') n'a lieu qu'à
// la confirmation du webhook, jamais ici.
// ============================================================
const { createClient } = require("@supabase/supabase-js");
const { createFedapayPayment } = require("./_lib/ajvpay");
const { supabaseAdmin } = require("./_lib/supabaseAdmin");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { quoteId } = req.body || {};
  if (!quoteId) return res.status(400).json({ error: "quoteId requis" });

  // Client scopé RLS avec le token de l'appelant : il ne verra le devis que
  // s'il en est vraiment le client (ou l'artisan/admin, exclus juste après).
  // Clé anon publique (identique à js/supabase-config.js) : pas un secret,
  // sa portée est déjà limitée par les policies RLS.
  const supabaseAsUser = createClient(
    process.env.SUPABASE_URL || "https://evfsyxffognyqlkgcrqi.supabase.co",
    "sb_publishable_wAt72pWmS9MyWmxtWbtjeQ_7m8b-wH-",
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  );

  const { data: { user }, error: userError } = await supabaseAsUser.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ error: "Session invalide" });

  const { data: quote, error: quoteError } = await supabaseAsUser
    .from("quotes")
    .select("id, amount, status, request_id, requests!inner(client_id)")
    .eq("id", quoteId)
    .single();
  if (quoteError || !quote) return res.status(404).json({ error: "Devis introuvable" });
  if (quote.requests.client_id !== user.id) return res.status(403).json({ error: "Accès refusé" });
  if (quote.status !== "en_attente") return res.status(409).json({ error: "Ce devis n'est plus en attente." });

  const { data: profile } = await supabaseAsUser.from("profiles").select("phone").eq("id", user.id).single();
  if (!profile?.phone) return res.status(400).json({ error: "Numéro de téléphone manquant sur le profil." });

  try {
    const payment = await createFedapayPayment({
      amount: quote.amount,
      phoneNumber: profile.phone,
      quoteId: quote.id
    });

    const admin = supabaseAdmin();
    await admin.from("quotes").update({
      payment_id: payment.id,
      payment_status: "en_attente"
    }).eq("id", quote.id);

    return res.status(200).json({ payment_url: payment.redirect_url });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};
