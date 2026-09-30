// Ícones de traço simples (24x24, currentColor), no estilo dos mockups.
const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconeInicio = () => (
  <svg {...base}>
    <path d="M12 20c-4-1.5-7-4.5-7-9 2.5 0 5 1 7 3 2-2 4.5-3 7-3 0 4.5-3 7.5-7 9Z" />
    <path d="M12 14c-1.5-2-1.5-5 0-8 1.5 3 1.5 6 0 8Z" />
  </svg>
);
export const IconeCalendario = () => (
  <svg {...base}>
    <rect x="4" y="5" width="16" height="15" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);
export const IconeHistorico = () => (
  <svg {...base}>
    <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.5" />
    <path d="M4 4v4.5h4.5M12 8v4l3 2" />
  </svg>
);
export const IconePerfil = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="10" r="3" />
    <path d="M6.5 18.2c1.3-2 3.2-3 5.5-3s4.2 1 5.5 3" />
  </svg>
);
export const IconeClientes = () => (
  <svg {...base}>
    <circle cx="9" cy="9" r="3" />
    <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" />
    <circle cx="17" cy="9.5" r="2.3" />
    <path d="M16 14.6c2.2 0 3.8 1.3 4.5 3.9" />
  </svg>
);
export const IconeEquipe = () => (
  <svg {...base}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </svg>
);
export const IconeServicos = () => (
  <svg {...base}>
    <path d="M12 20c-4-1.5-7-4.5-7-9 2.5 0 5 1 7 3 2-2 4.5-3 7-3 0 4.5-3 7.5-7 9Z" />
  </svg>
);
export const IconeMais = () => (
  <svg {...base}>
    <circle cx="6" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18" cy="12" r="1.2" fill="currentColor" />
  </svg>
);
export const IconeVoltar = () => (
  <svg {...base}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const IconeLocal = () => (
  <svg {...base}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);
export const IconeToque = () => (
  <svg {...base}>
    <rect x="7" y="3" width="10" height="18" rx="2.5" />
    <path d="M11 18h2" />
  </svg>
);
export const IconeWifi = () => (
  <svg {...base}>
    <path d="M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9.2 16.4a4 4 0 0 1 5.6 0" />
    <circle cx="12" cy="19.5" r="0.9" fill="currentColor" />
  </svg>
);
