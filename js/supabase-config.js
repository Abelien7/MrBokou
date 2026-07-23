// ============================================================
// MrBokou — Configuration Supabase
// Remplacez les deux valeurs ci-dessous par celles de votre projet :
//   Dashboard Supabase → Settings → API
// ============================================================

const SUPABASE_URL      = "https://evfsyxffognyqlkgcrqi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wAt72pWmS9MyWmxtWbtjeQ_7m8b-wH-";

// Sauvegarder la référence à la librairie avant de réaffecter le global
const _supabaseLib = window.supabase;
// Réaffecter sans const/let pour éviter le conflit de déclaration avec le CDN
supabase = _supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Rôles ────────────────────────────────────────────────────
const ROLES = {
  CLIENT:  "client",
  ARTISAN: "artisan",
  ADMIN:   "admin"
};

// ── Statuts demandes ────────────────────────────────────────
const REQUEST_STATUS = {
  PENDING:   "en_attente",
  ACCEPTED:  "acceptee",
  ONGOING:   "en_cours",
  DONE:      "terminee",
  CANCELLED: "annulee"
};

const REQUEST_STATUS_LABELS = {
  en_attente: "En attente d'un artisan",
  acceptee:   "Acceptée",
  en_cours:   "En cours",
  terminee:   "Terminée",
  annulee:    "Annulée"
};

// ── Icônes par catégorie (SVG, voir js/icons.js) ──────────────
const CATEGORY_ICONS = {
  "Electricité":    "bolt",
  "Plomberie":      "droplet",
  "Maçonnerie":     "wall",
  "Peinture":       "roller",
  "Climatisation":  "snow",
  "Menuiserie":     "hammer"
};

function categoryIcon(name) {
  return icon(CATEGORY_ICONS[name] || "tool", "cat-icon");
}
