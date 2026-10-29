import type { SVGProps } from 'react';

/** Inline SVG icons: no icon font, no network, inherit `currentColor`, hidden from assistive tech (labels live on the buttons). */
type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true, focusable: false, ...p });

export const HeartIcon = (p: P) => <svg {...base(p)}><path d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.3 3 5 6.3 5c2 0 3.5 1.1 4.2 2.5.3.5.5.9 1.5.9s1.2-.4 1.5-.9C14.2 6.1 15.700 5 17.700 5 21 5 22.900 8.300 21.500 11.700 19.500 16.400 12 21 12 21z" /></svg>;
export const KeyIcon = (p: P) => <svg {...base(p)}><path d="M14.500 3a6.500 6.500 0 0 0-6.200 8.400L2 17.700V22h4.300v-2.200H8.500v-2.200h2.200l1.900-1.900A6.500 6.500 0 1 0 14.500 3zm2 4.500a1.800 1.800 0 1 1 0 3.600 1.800 1.800 0 0 1 0-3.600z" /></svg>;
export const LockIcon = (p: P) => <svg {...base(p)}><path d="M17 9V7a5 5 0 0 0-10 0v2H5v13h14V9h-2zm-8 0V7a3 3 0 0 1 6 0v2H9zm3 4.500a1.800 1.800 0 0 1 1 3.300V19h-2v-2.200a1.800 1.800 0 0 1 1-3.300z" /></svg>;
export const UnlockIcon = (p: P) => <svg {...base(p)}><path d="M17 9H9V7a3 3 0 0 1 5.800-1.100l1.900-.7A5 5 0 0 0 7 7v2H5v13h14V9h-2zm-5 4.500a1.800 1.800 0 0 1 1 3.300V19h-2v-2.200a1.800 1.800 0 0 1 1-3.300z" /></svg>;
export const PauseIcon = (p: P) => <svg {...base(p)}><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>;
export const PlayIcon = (p: P) => <svg {...base(p)}><path d="M7 4l13 8-13 8z" /></svg>;
export const SoundIcon = (p: P) => <svg {...base(p)}><path d="M3 9v6h4l5 4V5L7 9H3zm13.500 3A4.500 4.500 0 0 0 14 8v8a4.500 4.500 0 0 0 2.500-4zM14 3.200v2.100a7 7 0 0 1 0 13.400v2.100a9 9 0 0 0 0-17.600z" /></svg>;
export const MuteIcon = (p: P) => <svg {...base(p)}><path d="M3 9v6h4l5 4V5L7 9H3zm13.600 3l2.700-2.700-1.400-1.400L15.200 10.600l-2.700-2.700-1.400 1.400L13.800 12l-2.700 2.700 1.400 1.400 2.700-2.700 2.700 2.700 1.400-1.400L16.600 12z" transform="translate(0 0) scale(.9) translate(1.300 1.300)" /></svg>;
export const GearIcon = (p: P) => <svg {...base(p)}><path d="M19.400 13a7.800 7.800 0 0 0 0-2l2.100-1.600-2-3.500-2.500 1a7.600 7.600 0 0 0-1.700-1l-.4-2.700h-4l-.4 2.700a7.600 7.600 0 0 0-1.700 1l-2.500-1-2 3.500L4.600 11a7.800 7.800 0 0 0 0 2l-2.100 1.600 2 3.500 2.500-1a7.600 7.600 0 0 0 1.700 1l.4 2.700h4l.4-2.700a7.600 7.600 0 0 0 1.700-1l2.500 1 2-3.500L19.400 13zM12 15.500a3.500 3.500 0 1 1 0-7 3.500 3.500 0 0 1 0 7z" /></svg>;
export const CloseIcon = (p: P) => <svg {...base(p)}><path d="M5.300 4l6.700 6.700L18.700 4 20 5.300 13.300 12l6.700 6.700-1.300 1.300L12 13.300 5.300 20 4 18.700 10.700 12 4 5.300z" /></svg>;
export const SkullIcon = (p: P) => <svg {...base(p)}><path d="M12 2a9 9 0 0 0-9 9c0 3 1.500 5 3 6.200V21h3v-2h1v2h4v-2h1v2h3v-3.800c1.500-1.200 3-3.200 3-6.200a9 9 0 0 0-9-9zM8.500 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" /></svg>;
export const TrophyIcon = (p: P) => <svg {...base(p)}><path d="M7 3h10v2h3v3a4 4 0 0 1-3.700 4A5 5 0 0 1 13 14.900V17h3v3H8v-3h3v-2.100A5 5 0 0 1 7.700 12 4 4 0 0 1 4 8V5h3V3zM6 7v1a2 2 0 0 0 1 1.700V7H6zm12 0h-1v2.700A2 2 0 0 0 18 8V7z" /></svg>;
export const ClockIcon = (p: P) => <svg {...base(p)}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.400l3.800 2.300-.9 1.500L11 13V7h2z" /></svg>;
