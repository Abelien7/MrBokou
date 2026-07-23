// ============================================================
// MrBokou — Module Authentification (Supabase Auth)
// ============================================================

const Auth = (() => {
  let currentUser = null;
  let currentRole = null;

  // ---------- Inscription ----------
  // Le profil (et le profil artisan) est créé côté serveur par un trigger sur
  // auth.users à partir des métadonnées ci-dessous : ça marche même quand la
  // confirmation par email est activée et qu'aucune session n'existe encore
  // au moment de l'inscription (voir sql/schema.sql : handle_new_user()).
  async function signup({ email, password, fullName, phone, city, role, categories }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone, city, role, categories: categories || [] },
        emailRedirectTo: window.location.origin + "/pages/connexion.html"
      }
    });
    if (error) throw new Error(getAuthError(error.message));

    currentUser = data.user;
    currentRole = role;
    return { user: data.user, role, needsConfirmation: !data.session };
  }

  // ---------- Connexion ----------
  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(getAuthError(error.message));
    const role = await getUserRole();
    if (!role) throw new Error("Compte sans profil. Contactez le support WhatsApp au +228 92 10 66 58.");
    currentUser = data.user;
    currentRole = role;
    return { user: data.user, role };
  }

  // ---------- Mot de passe oublié ----------
  async function requestPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/pages/reinitialiser-mot-de-passe.html"
    });
    if (error) throw new Error(getAuthError(error.message));
  }

  async function updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(getAuthError(error.message));
  }

  // ---------- Déconnexion ----------
  async function logout() {
    await supabase.auth.signOut();
    currentUser = null;
    currentRole = null;
    window.location.href = "/pages/connexion.html";
  }

  // ---------- Rôle via RPC SECURITY DEFINER (évite la récursion RLS) ----------
  async function getUserRole() {
    const { data, error } = await supabase.rpc("get_user_role");
    if (error || data === null || data === undefined) return null;
    return data;
  }

  // ---------- Garde de route : bloque le rendu tant que le rôle n'est pas confirmé ----------
  async function requireRole(...allowedRoles) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "/pages/connexion.html";
      throw new Error("Non connecté");
    }
    const role = await getUserRole();
    if (!role || !allowedRoles.includes(role)) {
      window.location.href = "/index.html";
      throw new Error("Rôle insuffisant");
    }
    currentUser = session.user;
    currentRole = role;
    return { user: session.user, role };
  }

  // ---------- Messages d'erreur en français ----------
  function getAuthError(message) {
    if (message.includes("Invalid login"))       return "Email ou mot de passe incorrect.";
    if (message.includes("Email not confirmed")) return "Confirmez votre email avant de vous connecter.";
    if (message.includes("Too many requests"))   return "Trop de tentatives. Réessayez plus tard.";
    if (message.includes("rate limit"))          return "Limite d'envoi d'emails atteinte. Réessayez dans quelques minutes.";
    if (message.includes("already registered"))  return "Cet email est déjà utilisé.";
    if (message.includes("Password should"))     return "Mot de passe trop faible (min. 6 caractères).";
    return "Erreur : " + message;
  }

  function getUser()    { return currentUser; }
  function getRole()    { return currentRole; }
  function isLoggedIn() { return !!currentUser; }

  return {
    signup, login, logout, requireRole, getUserRole,
    requestPasswordReset, updatePassword,
    getUser, getRole, isLoggedIn
  };
})();
