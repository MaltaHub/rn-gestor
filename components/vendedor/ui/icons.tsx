import type { SVGProps } from "react";

/**
 * Ícones de traço (24×24, currentColor) da área do vendedor e do editor Word.
 * Substituem emojis e glifos Unicode, que mudavam de cara em cada sistema.
 */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  car: "M5 16v3M19 16v3M3 12l2-5.5A2 2 0 0 1 6.9 5h10.2a2 2 0 0 1 1.9 1.5L21 12v4H3zM3 12h18M7 14.5h.01M17 14.5h.01",
  sale: "M20 12V8l-8-5-8 5v8l8 5 4-2.5M15 15l2 2 4-4",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4",
  fileplus: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14h6",
  user: "M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  close: "M18 6 6 18M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  chevronLeft: "m15 18-6-6 6-6",
  chevronRight: "m9 18 6-6-6-6",
  chevronDown: "m6 9 6 6 6-6",
  arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  info: "M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20",
  printer: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  copy: "M8 8h12v12H8zM4 16V4h12",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  unlock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2",
  calendar: "M3 5h18v16H3zM16 3v4M8 3v4M3 10h18",
  key: "M15.5 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M12 11v10M12 17h3M12 14h2",
  refresh: "M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5",
  menu: "M4 6h16M4 12h16M4 18h16",
  panel: "M3 4h18v16H3zM9 4v16",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  receipt: "M5 3v18l2-1.5L9 21l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5V3l-2 1.5L15 3l-2 1.5L11 3 9 4.5 7 3zM9 9h6M9 13h6",
  branch: "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 9a9 9 0 0 1-9 9",
  brush: "M18.4 2.6a2 2 0 0 1 3 3L12 15l-3-3zM9 12l-2.5 2.5a3 3 0 0 0-.8 1.5L5 21l4-1a3 3 0 0 0 1.6-.8L13 17",
  image: "M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 15l-5-5L5 21",
  logo: "M4 4h16v16H4zM8 15l2.5-3 2 2.5L15 11l3 4",
  signature: "M3 17c3-1 4-6 6-6s1 6 3 6 2-3 4-3 2 2 5 2M3 21h18",
  columns: "M3 4h18v16H3zM12 4v16",
  pagebreak: "M5 3v5h14V3M5 21v-5h14v5M3 12h2M8 12h2M13 12h2M18 12h3",
  bold: "M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z",
  italic: "M19 4h-9M14 20H5M15 4 9 20",
  underline: "M6 4v6a6 6 0 0 0 12 0V4M4 21h16",
  strike: "M16 6a4 4 0 0 0-4-2c-2.5 0-4 1.3-4 3.2 0 4 8 2.8 8 7.3 0 2-1.8 3.5-4.5 3.5A5 5 0 0 1 7 16M4 12h16",
  alignLeft: "M3 6h18M3 10h12M3 14h18M3 18h12",
  alignCenter: "M3 6h18M6 10h12M3 14h18M6 18h12",
  alignRight: "M3 6h18M9 10h12M3 14h18M9 18h12",
  alignJustify: "M3 6h18M3 10h18M3 14h18M3 18h18",
  list: "M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01",
  listOrdered: "M10 6h11M10 12h11M10 18h11M4 4v4M3 18h3l-3 3h3M3.5 12h2l-2 2.5h2",
  move: "M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20",
  anchor: "M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 8v14M5 12H2a10 10 0 0 0 20 0h-3",
  zoom: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3M11 8v6M8 11h6",
  zoomOut: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3M8 11h6",
  minus: "M5 12h14",
  fitWidth: "M3 5v14M21 5v14M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3",
  fitPage: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  sortAz: "M3 17 6 7l3 10M4 14h4M14 7h6l-6 10h6",
  whatsapp: "M3 21l1.6-4.8A9 9 0 1 1 8 19.5zM8.5 9.5c.5 2.5 3.5 5.5 6 6l1.5-1.5-2-1-1 1c-1-.5-2.5-2-3-3l1-1-1-2z",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, strokeWidth = 1.8, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
