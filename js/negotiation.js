// ============================================================
// MrBokou — Négociation : devis + messagerie client <-> artisan
// ============================================================

const Nego = (() => {

  async function getQuotes(requestId) {
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  // Statut du devis le plus récent pour plusieurs demandes en une seule
  // requête (évite un aller-retour par demande dans les listes de missions).
  async function getLatestQuoteStatuses(requestIds) {
    if (!requestIds || requestIds.length === 0) return {};
    const { data, error } = await supabase
      .from("quotes")
      .select("request_id, status, created_at")
      .in("request_id", requestIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const latest = {};
    for (const q of data) {
      if (!(q.request_id in latest)) latest[q.request_id] = q.status;
    }
    return latest;
  }

  async function sendQuote({ requestId, artisanId, amount, description }) {
    const { error } = await supabase.from("quotes").insert({
      request_id: requestId, artisan_id: artisanId, amount, description
    });
    if (error) throw error;
  }

  async function respondQuote(quoteId, status) {
    const { error } = await supabase.from("quotes").update({ status }).eq("id", quoteId);
    if (error) throw error;
  }

  // Accepter un devis ne pose plus directement status="accepte" (voir
  // guard_quote_update côté SQL) : ça déclenche un paiement AJV Pay, et
  // c'est la confirmation du paiement (webhook) qui accepte réellement le
  // devis. Redirige le navigateur vers la page de paiement hébergée.
  async function payQuote(quoteId) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/create-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ quoteId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Impossible de lancer le paiement.");
    window.location.href = data.payment_url;
  }

  async function getMessages(requestId) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  }

  async function sendMessage({ requestId, senderId, content, imageFile }) {
    let imagePath = null;
    if (imageFile) {
      const compressed = await compressImage(imageFile);
      imagePath = `${requestId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("request-photos")
        .upload(imagePath, compressed, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
    }
    const { error } = await supabase.from("messages").insert({
      request_id: requestId, sender_id: senderId,
      content: content || null, image_path: imagePath
    });
    if (error) throw error;
  }

  async function getPhotoUrl(path) {
    const { data, error } = await supabase.storage
      .from("request-photos")
      .createSignedUrl(path, 3600);
    if (error) return null;
    return data.signedUrl;
  }

  function subscribe(requestId, onChange) {
    const channel = supabase
      .channel(`nego-${requestId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `request_id=eq.${requestId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes", filter: `request_id=eq.${requestId}` }, onChange)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }

  return { getQuotes, getLatestQuoteStatuses, sendQuote, respondQuote, payQuote, getMessages, sendMessage, getPhotoUrl, subscribe };
})();

// ---------- UI partagée (client-dashboard.html + artisan-dashboard.html) ----------
const NegoUI = (() => {
  let state = null; // { requestId, myRole, myId, otherName, unsubscribe }

  function el(id) { return document.getElementById(id); }

  async function open(requestId, myRole) {
    if (state?.unsubscribe) state.unsubscribe();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: request, error } = await supabase
      .from("requests")
      .select("*, service_categories(name), client:client_id(full_name), artisan:artisan_id(full_name)")
      .eq("id", requestId)
      .single();
    if (error) return showToast(error.message, "error");

    state = {
      requestId,
      myRole,
      myId: user.id,
      request,
      otherName: myRole === "client" ? request.artisan?.full_name : request.client?.full_name
    };

    el("nego-modal").classList.remove("hidden");
    await render();
    state.unsubscribe = Nego.subscribe(requestId, render);
  }

  function close() {
    if (state?.unsubscribe) state.unsubscribe();
    state = null;
    el("nego-modal").classList.add("hidden");
  }

  async function render() {
    if (!state) return;
    const { requestId, myRole, request } = state;
    const [quotes, messages] = await Promise.all([Nego.getQuotes(requestId), Nego.getMessages(requestId)]);
    const latestQuote = quotes[0] || null;
    const canChat = request.status === "acceptee" || request.status === "en_cours";

    el("nego-modal-content").innerHTML = `
      <div class="modal-header">
        <h2>${Security.safeText(request.service_categories?.name || "")} · ${Security.safeText(state.otherName || "")}</h2>
        <button class="modal-close" id="nego-close">${icon("x", "icon-sm")}</button>
      </div>
      <div id="quote-panel"></div>
      <div class="nego-thread" id="nego-thread"></div>
      ${canChat ? `
      <form class="nego-composer" id="nego-composer">
        <input type="file" id="nego-photo" accept="image/*" class="hidden"/>
        <button type="button" class="btn btn-ghost btn-sm" id="nego-photo-btn">${icon("camera", "icon-sm")}</button>
        <input type="text" id="nego-text" placeholder="Écrire un message..." class="form-control" maxlength="2000"/>
        <button type="submit" class="btn btn-primary btn-sm">Envoyer</button>
      </form>` : `<p class="text-muted text-center mt-2">La discussion est close pour cette demande.</p>`}
    `;

    renderQuotePanel(latestQuote, quotes);
    renderThread(messages);

    el("nego-close").addEventListener("click", close);
    const composer = el("nego-composer");
    if (composer) {
      el("nego-photo-btn").addEventListener("click", () => el("nego-photo").click());
      composer.addEventListener("submit", onSendMessage);
    }
  }

  function renderQuotePanel(latestQuote, allQuotes) {
    const panel = el("quote-panel");
    const { myRole, requestId, request, myId } = state;
    const history = allQuotes.filter(q => q.status === "refuse");

    const historyHtml = history.length
      ? `<p class="form-hint mt-1">${history.length} devis précédent(s) refusé(s) : ${history.map(q => `${q.amount} FCFA`).join(", ")}</p>`
      : "";

    if (myRole === "artisan") {
      const canSendNewQuote = request.status === "acceptee" && (!latestQuote || latestQuote.status === "refuse");
      panel.innerHTML = `
        <div class="quote-card">
          ${latestQuote && latestQuote.status === "accepte"
            ? `<div class="quote-status accepted">${icon("checkCircle", "icon-sm")} Devis accepté : <strong>${latestQuote.amount} FCFA</strong></div>`
            : latestQuote && latestQuote.status === "en_attente"
              ? `<div class="quote-status pending">${icon("clock", "icon-sm")} Devis envoyé : <strong>${latestQuote.amount} FCFA</strong> — en attente de réponse du client.</div>`
              : canSendNewQuote
                ? `
                <div class="form-group">
                  <label class="form-label">Envoyer un devis (FCFA)</label>
                  <div class="flex gap-sm">
                    <input type="number" min="1" class="form-control" id="quote-amount" placeholder="Ex : 15000"/>
                    <button type="button" class="btn btn-accent btn-sm" id="quote-send" style="white-space:nowrap;">Envoyer</button>
                  </div>
                  <textarea class="form-control mt-1" id="quote-desc" placeholder="Détail (matériel, main d'œuvre...)" maxlength="2000"></textarea>
                </div>`
                : `<p class="text-muted">Devis déjà validé, la discussion continue ci-dessous.</p>`
          }
          ${historyHtml}
        </div>`;
      const sendBtn = el("quote-send");
      if (sendBtn) sendBtn.addEventListener("click", () => onSendQuote(requestId, myId));
    } else {
      const payingNow = latestQuote?.payment_status === "en_attente";
      panel.innerHTML = `
        <div class="quote-card">
          ${!latestQuote
            ? `<p class="text-muted">En attente du devis de l'artisan.</p>`
            : latestQuote.status === "accepte"
              ? `<div class="quote-status accepted">${icon("checkCircle", "icon-sm")} Devis payé : <strong>${latestQuote.amount} FCFA</strong></div>`
              : latestQuote.status === "refuse"
                ? `<p class="text-muted">Devis refusé, en attente d'un nouveau devis de l'artisan.</p>`
                : `
                <div class="quote-status pending">
                  <div><strong>${latestQuote.amount} FCFA</strong></div>
                  ${latestQuote.description ? `<p>${Security.safeText(latestQuote.description)}</p>` : ""}
                  ${latestQuote.payment_status === "echoue" ? `<p class="field-error">Le paiement précédent a échoué, réessayez.</p>` : ""}
                  <div class="flex gap-sm mt-1">
                    <button class="btn btn-primary btn-sm" id="quote-accept" ${payingNow ? "disabled" : ""}>${payingNow ? "Paiement en cours..." : "Accepter et payer"}</button>
                    <button class="btn btn-danger btn-sm" id="quote-refuse" ${payingNow ? "disabled" : ""}>Refuser</button>
                  </div>
                </div>`
          }
          ${historyHtml}
        </div>`;
      const acceptBtn = el("quote-accept");
      const refuseBtn = el("quote-refuse");
      if (acceptBtn) acceptBtn.addEventListener("click", () => onPayQuote(latestQuote.id));
      if (refuseBtn) refuseBtn.addEventListener("click", () => onRespondQuote(latestQuote.id, "refuse"));
    }
  }

  function renderThread(messages) {
    const thread = el("nego-thread");
    if (messages.length === 0) {
      thread.innerHTML = `<p class="text-muted text-center mt-2">Aucun message pour l'instant.</p>`;
      return;
    }
    thread.innerHTML = messages.map(m => {
      const mine = m.sender_id === state.myId;
      return `
        <div class="nego-bubble-row ${mine ? "mine" : ""}">
          <div class="nego-bubble">
            ${m.content ? `<p>${Security.safeText(m.content)}</p>` : ""}
            ${m.image_path ? `<div class="nego-photo" data-path="${m.image_path}"><span class="text-muted">Chargement de la photo...</span></div>` : ""}
            <span class="nego-time">${timeAgo(m.created_at)}</span>
          </div>
        </div>`;
    }).join("");
    thread.scrollTop = thread.scrollHeight;

    thread.querySelectorAll(".nego-photo").forEach(async (elPhoto) => {
      const url = await Nego.getPhotoUrl(elPhoto.dataset.path);
      if (url) elPhoto.innerHTML = `<img src="${url}" alt="Photo jointe"/>`;
      else elPhoto.innerHTML = `<span class="text-muted">Photo indisponible</span>`;
    });
  }

  async function onPayQuote(quoteId) {
    const btn = el("quote-accept");
    if (btn) { btn.disabled = true; btn.textContent = "Redirection..."; }
    try {
      await Nego.payQuote(quoteId);
    } catch (err) {
      showToast(err.message, "error");
      if (btn) { btn.disabled = false; btn.textContent = "Accepter et payer"; }
    }
  }

  async function onSendQuote(requestId, artisanId) {
    const amount = parseInt(el("quote-amount").value, 10);
    if (!amount || amount <= 0) return showToast("Indiquez un montant valide.", "error");
    const description = el("quote-desc").value.trim();
    try {
      await Nego.sendQuote({ requestId, artisanId, amount, description });
      showToast("Devis envoyé au client.", "success");
    } catch (err) { showToast(err.message, "error"); }
  }

  async function onRespondQuote(quoteId, status) {
    try {
      await Nego.respondQuote(quoteId, status);
      showToast(status === "accepte" ? "Devis accepté." : "Devis refusé.", "success");
    } catch (err) { showToast(err.message, "error"); }
  }

  async function onSendMessage(e) {
    e.preventDefault();
    const textInput = el("nego-text");
    const photoInput = el("nego-photo");
    const content = textInput.value.trim();
    const imageFile = photoInput.files[0] || null;
    if (!content && !imageFile) return;
    try {
      await Nego.sendMessage({ requestId: state.requestId, senderId: state.myId, content: content || null, imageFile });
      textInput.value = "";
      photoInput.value = "";
    } catch (err) { showToast(err.message, "error"); }
  }

  return { open, close };
})();
