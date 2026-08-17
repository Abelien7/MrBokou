// ============================================================
// MrBokou — Module Sécurité (validation + sanitisation)
// ============================================================

const Security = (() => {

  function safeText(str) {
    const el = document.createElement("span");
    el.textContent = str;
    return el.innerHTML;
  }

  function isValidTogoPhone(phone) {
    const cleaned = (phone || "").replace(/[\s\-().]/g, "");
    return /^(00228|\+228)?[79]\d{7}$/.test(cleaned);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
  }

  function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.add("input-error");
    let errEl = document.getElementById(fieldId + "-error");
    if (!errEl) {
      errEl = document.createElement("p");
      errEl.id = fieldId + "-error";
      errEl.className = "field-error";
      errEl.setAttribute("role", "alert");
      field.parentNode.insertBefore(errEl, field.nextSibling);
    }
    errEl.textContent = message;
    field.setAttribute("aria-describedby", fieldId + "-error");
  }

  function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) field.classList.remove("input-error");
    const errEl = document.getElementById(fieldId + "-error");
    if (errEl) errEl.remove();
  }

  function clearAllErrors(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
    container.querySelectorAll(".field-error").forEach(el => el.remove());
  }

  return {
    safeText, isValidTogoPhone, isValidEmail,
    showFieldError, clearFieldError, clearAllErrors
  };
})();
