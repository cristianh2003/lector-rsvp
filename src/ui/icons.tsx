// Íconos en línea (trazo de 1.75px, heredan el color del texto).
import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...base}>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
  </svg>
);

export const BackIcon = () => (
  <svg {...base}>
    <path d="M11 7l-5 5 5 5M18 7l-5 5 5 5" />
  </svg>
);

export const ForwardIcon = () => (
  <svg {...base}>
    <path d="M13 7l5 5-5 5M6 7l5 5-5 5" />
  </svg>
);

export const SentenceIcon = () => (
  <svg {...base}>
    <path d="M6 5v14M18 6l-8 6 8 6z" />
  </svg>
);

export const SettingsIcon = () => (
  <svg {...base}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);

export const FullscreenIcon = () => (
  <svg {...base}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

export const LibraryIcon = () => (
  <svg {...base}>
    <path d="M5 4v16M10 4v16M15 5l4 14.5" />
  </svg>
);

export const ListIcon = () => (
  <svg {...base}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const MinusIcon = () => (
  <svg {...base}>
    <path d="M6 12h12" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...base}>
    <path d="M6 12h12M12 6v12" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...base}>
    <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />
  </svg>
);
