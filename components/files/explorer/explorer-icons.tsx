const PATHS = {
  back: "M15 18l-6-6 6-6",
  forward: "M9 18l6-6-6-6",
  up: "M12 19V5M5 12l7-7 7 7",
  refresh: "M4 12a8 8 0 0 1 13.5-5.8L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.5 5.8L4 16M4 20v-4h4",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  folderPlus: "M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.5 2h9a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18zM12 11v5M9.5 13.5h5",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  download: "M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  cut: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12",
  paste: "M9 4h6v3H9zM8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2",
  rename: "M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  move: "M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.5 2h9a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18zM10 14h6M13.5 11.5L16 14l-2.5 2.5",
  sort: "M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4",
  viewDetails: "M4 6h16M4 12h16M4 18h16",
  viewList: "M4 6h2M10 6h10M4 12h2M10 12h10M4 18h2M10 18h10",
  viewTiles: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  viewLarge: "M3 4h18v12H3zM6 20h12",
  pane: "M3 5h18v14H3zM15 5v14",
  tree: "M3 5h18v14H3zM9 5v14",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  open: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  check: "M5 12l5 5L20 7",
  home: "M3 11l9-7 9 7M5 10v10h14V10",
  menu: "M4 6h16M4 12h16M4 18h16",
  car: "M5 17h14M6 17v2M18 17v2M4 13l2-5a2 2 0 0 1 1.9-1.3h8.2A2 2 0 0 1 18 8l2 5v4H4zM7.5 14h.01M16.5 14h.01",
  scan: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10",
  pause: "M8 5v14M16 5v14",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM12 15v2",
  select: "M4 6l2 2 4-4M4 14l2 2 4-4M13 6h7M13 15h7",
  play: "M7 5l12 7-12 7z"
} as const;

export type ExplorerIconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: ExplorerIconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
