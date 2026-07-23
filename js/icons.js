// ============================================================
// MrBokou — Icônes SVG (remplace les emojis, style trait fin)
// ============================================================

const ICONS = {
  bolt: `<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>`,
  droplet: `<path d="M12 3c4 5 7 8.7 7 12.2A7 7 0 1 1 5 15.2C5 11.7 8 8 12 3z"/>`,
  wall: `<rect x="3" y="4" width="8" height="4"/><rect x="13" y="4" width="8" height="4"/><rect x="3" y="10" width="4" height="4"/><rect x="9" y="10" width="8" height="4"/><rect x="19" y="10" width="2" height="4"/><rect x="3" y="16" width="8" height="4"/><rect x="13" y="16" width="8" height="4"/>`,
  roller: `<rect x="4" y="4" width="13" height="6" rx="1"/><line x1="8" y1="10" x2="8" y2="15"/><rect x="6" y="15" width="4" height="6" rx="1"/>`,
  snow: `<line x1="12" y1="2" x2="12" y2="22"/><line x1="4.5" y1="7" x2="19.5" y2="17"/><line x1="19.5" y1="7" x2="4.5" y2="17"/><path d="M12 2l-2 2m2-2 2 2M12 22l-2-2m2 2 2-2M4.5 7l.7 2.6M4.5 7l2.6-.7M19.5 7l-2.6-.7M19.5 7l-.7 2.6M4.5 17l2.6.7M4.5 17l.7-2.6M19.5 17l-.7-2.6M19.5 17l-2.6.7"/>`,
  hammer: `<g transform="rotate(45 12 12)"><rect x="9" y="2.5" width="6" height="8" rx="1.2"/><rect x="10.4" y="10.5" width="3.2" height="11" rx="1"/></g>`,
  tool: `<circle cx="12" cy="12" r="9"/><path d="M9 12h6M12 9v6"/>`,

  pin: `<path d="M12 22s7-7.2 7-13a7 7 0 1 0-14 0c0 5.8 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/>`,
  inbox: `<path d="M4 12h4l2 3h4l2-3h4"/><path d="M5.5 5h13l2 7v6a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-6z"/>`,
  x: `<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>`,
  shield: `<path d="M12 2 4 5v6c0 5 3.5 9.3 8 11 4.5-1.7 8-6 8-11V5z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>`,
  arrowRight: `<line x1="4" y1="12" x2="19" y2="12"/><path d="M13 6l6 6-6 6"/>`,
  menu: `<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`,
  checkCircle: `<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`,
  ban: `<circle cx="12" cy="12" r="9"/><line x1="6" y1="6" x2="18" y2="18"/>`,
  clipboard: `<rect x="6" y="4" width="12" height="17" rx="1.5"/><rect x="9" y="2" width="6" height="4" rx="1"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/>`,
  users: `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15 14.3c2.9.5 5 3 5 5.7"/>`,
  camera: `<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>`,
};

function icon(name, cls = "") {
  const body = ICONS[name] || ICONS.tool;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
