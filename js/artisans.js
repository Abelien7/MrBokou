// ============================================================
// MrBokou — Module Profils Artisans
// ============================================================

const Artisans = (() => {

  async function myProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("artisan_profiles")
      .select("*, profiles!artisan_profiles_profile_id_fkey(full_name, city)")
      .eq("profile_id", user.id)
      .single();
    if (error) throw error;
    data.profiles.phone = await contactPhone(user.id);
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

  // ---------- Vérification d'identité (photo, pièce d'identité, selfie) ----------
  async function uploadDocuments({ profilePhotoFile, idDocumentFile, selfieFile }) {
    const { data: { user } } = await supabase.auth.getUser();
    const jobs = [
      ["profile.jpg", profilePhotoFile, "profile_photo_path"],
      ["id-document.jpg", idDocumentFile, "id_document_path"],
      ["selfie.jpg", selfieFile, "selfie_path"]
    ].filter(([, file]) => !!file);

    const updates = {};
    for (const [filename, file, column] of jobs) {
      const compressed = await compressImage(file);
      const path = `${user.id}/${filename}`;
      const { error: uploadError } = await supabase.storage
        .from("artisan-documents")
        .upload(path, compressed, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;
      updates[column] = path;
    }

    if (Object.keys(updates).length === 0) return;
    const { error } = await supabase
      .from("artisan_profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("profile_id", user.id);
    if (error) throw error;
  }

  async function getDocumentUrls(profile) {
    const paths = {
      profile_photo: profile.profile_photo_path,
      id_document: profile.id_document_path,
      selfie: profile.selfie_path
    };
    const urls = {};
    await Promise.all(Object.entries(paths).map(async ([key, path]) => {
      if (!path) { urls[key] = null; return; }
      const { data, error } = await supabase.storage.from("artisan-documents").createSignedUrl(path, 3600);
      urls[key] = error ? null : data.signedUrl;
    }));
    return urls;
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
      .select("*, profiles!artisan_profiles_profile_id_fkey(full_name, city)")
      .eq("status", "en_attente");
    if (error) throw error;
    await Promise.all(data.map(async a => { a.profiles.phone = await contactPhone(a.profile_id); }));
    return data;
  }

  async function allArtisans() {
    const { data, error } = await supabase
      .from("artisan_profiles")
      .select("*, profiles!artisan_profiles_profile_id_fkey(full_name, city)")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    await Promise.all(data.map(async a => { a.profiles.phone = await contactPhone(a.profile_id); }));
    return data;
  }

  async function setStatus(profileId, status) {
    const { error } = await supabase.rpc("admin_set_artisan_status", {
      p_profile_id: profileId,
      p_status: status
    });
    if (error) throw error;
  }

  return { myProfile, updateOnboarding, setAvailability, pendingApplications, allArtisans, setStatus, uploadDocuments, getDocumentUrls };
})();
