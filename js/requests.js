// ============================================================
// MrBokou — Module Demandes (création, suivi, matching temps réel)
// ============================================================

const Requests = (() => {

  async function getCategories() {
    const { data, error } = await supabase.from("service_categories").select("*").order("name");
    if (error) throw error;
    return data;
  }

  // ---------- Client : créer une demande ----------
  async function create({ categoryId, description, addressText, lat, lng }) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("requests").insert({
      client_id: user.id,
      category_id: categoryId,
      description,
      address_text: addressText,
      lat, lng
    }).select().single();
    if (error) throw error;
    return data;
  }

  // ---------- Client : ses demandes (avec catégorie + artisan liés) ----------
  async function myRequestsAsClient() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("requests")
      .select("*, service_categories(name), artisan:artisan_id(full_name)")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    await Promise.all(data.map(async r => {
      if (r.artisan) r.artisan.phone = await contactPhone(r.artisan_id);
    }));
    return data;
  }

  // ---------- Client : annuler une demande en attente ----------
  async function cancel(requestId) {
    const { error } = await supabase
      .from("requests")
      .update({ status: REQUEST_STATUS.CANCELLED })
      .eq("id", requestId)
      .eq("status", REQUEST_STATUS.PENDING);
    if (error) throw error;
  }

  // ---------- Artisan : demandes en attente correspondant à ses catégories ----------
  async function pendingForArtisan(categoryIds) {
    if (!categoryIds || categoryIds.length === 0) return [];
    const { data, error } = await supabase
      .from("requests")
      .select("*, service_categories(name), client:client_id(full_name)")
      .eq("status", REQUEST_STATUS.PENDING)
      .in("category_id", categoryIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  // ---------- Artisan : ses missions acceptées / en cours / terminées ----------
  async function myMissionsAsArtisan() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("requests")
      .select("*, service_categories(name), client:client_id(full_name)")
      .eq("artisan_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    await Promise.all(data.map(async r => {
      if (r.client) r.client.phone = await contactPhone(r.client_id);
    }));
    return data;
  }

  // ---------- Artisan : accepter une demande (premier arrivé, premier servi) ----------
  // La condition .eq("status", PENDING) rend l'opération atomique : si un autre
  // artisan a déjà accepté entre-temps, 0 ligne est modifiée et data est vide.
  async function accept(requestId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("requests")
      .update({ status: REQUEST_STATUS.ACCEPTED, artisan_id: user.id, accepted_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", REQUEST_STATUS.PENDING)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Cette demande vient d'être prise par un autre artisan.");
    return data[0];
  }

  async function startWork(requestId) {
    const { error } = await supabase
      .from("requests")
      .update({ status: REQUEST_STATUS.ONGOING })
      .eq("id", requestId);
    if (error) throw error;
  }

  async function complete(requestId) {
    const { error } = await supabase
      .from("requests")
      .update({ status: REQUEST_STATUS.DONE, completed_at: new Date().toISOString() })
      .eq("id", requestId);
    if (error) throw error;
  }

  // ---------- Avis client → artisan ----------
  async function submitReview({ requestId, artisanId, rating, comment }) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("reviews").insert({
      request_id: requestId,
      client_id: user.id,
      artisan_id: artisanId,
      rating, comment
    });
    if (error) throw error;
  }

  // ---------- Abonnement temps réel sur la table requests ----------
  function subscribe(onChange) {
    const channel = supabase
      .channel("requests-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, onChange)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }

  return {
    getCategories, create, myRequestsAsClient, cancel,
    pendingForArtisan, myMissionsAsArtisan, accept, startWork, complete,
    submitReview, subscribe
  };
})();
