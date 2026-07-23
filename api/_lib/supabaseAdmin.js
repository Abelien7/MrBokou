// ============================================================
// MrBokou (serveur) — Client Supabase avec la clé service_role.
// Ne JAMAIS importer ce fichier depuis du code exécuté dans le navigateur.
// ============================================================
const { createClient } = require("@supabase/supabase-js");

function supabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL || "https://evfsyxffognyqlkgcrqi.supabase.co",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

module.exports = { supabaseAdmin };
