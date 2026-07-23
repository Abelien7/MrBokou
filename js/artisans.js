// ============================================================
// MrBokou — Module Profils Artisans
// ============================================================

const Artisans = (() => {

  async function myProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("artisan_profiles")
      .select("*, profiles!artisan_profiles_profile_id_fkey(full_name, phone, city)")
      .eq("profile_id", user.id)
      .single();
    if (error) throw error;
    return data;
  }

  async function updateOnboarding({ categories, bio, ville }) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("artisan_profiles")
      .update({ categories, bio, ville, updated_at: new Date().toISOString() })
      .eq("profile_id", user.id);
    if (error) throw error;
  }

  async function setAvailability(isAvailable, coords) {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { is_available: isAvailable, updated_at: new Date().toISOString() };
    if (coords) { payload.lat = coords.lat; payload.lng = coords.lng; }
    const { error } = await supabase
      .from("artisan_profiles")
      .update(payload)
      .eq("profile_id", user.id);
    if (error) throw error;
  }

  // ---------- Admin : liste des artisans en attente de validation ----------
  async function pendingApplications() {
    const { data, error } = await supabase
      .from("artisan_profiles")
      .select("*, profiles!artisan_profiles_profile_id_fkey(full_name, phone, city)")
      .eq("status", "en_attente");
    if (error) throw error;
    return data;
  }

  async function allArtisans() {
    const { data, error } = await supabase
      .from("artisan_profiles")
      .select("*, profiles!artisan_profiles_profile_id_fkey(full_name, phone, city)")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async function setStatus(profileId, status) {
    const { error } = await supabase.rpc("admin_set_artisan_status", {
      p_profile_id: profileId,
      p_status: status
    });
    if (error) throw error;
  }

  return { myProfile, updateOnboarding, setAvailability, pendingApplications, allArtisans, setStatus };
})();
