// 20px stroke icons used across the wireframes. Always paired with a visible word.
// eslint-disable-next-line react-refresh/only-export-components
export const PATHS = {
  drop: "M12 3c-3.5 4.4-6 7.7-6 10.6a6 6 0 0 0 12 0C18 10.7 15.5 7.4 12 3z",
  dropOff: "M12 3c-1.3 1.6-2.4 3-3.3 4.3M6.4 11.4A8 8 0 0 0 6 13.6a6 6 0 0 0 10.6 3.9M17.8 14.4c.1-.3.2-.5.2-.8 0-2.9-2.5-6.2-6-10.6M4 4l16 16",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
  check: "M5 12.5l4.2 4.2L19 7",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z M10 20.5a2 2 0 0 0 4 0",
  jerrycan: "M8 6h8v2.5h1.5A1.5 1.5 0 0 1 19 10v9.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5V10a1.5 1.5 0 0 1 1.5-1.5H8V6z M10 3.5h4V6h-4z",
  chevronLeft: "M15 5l-7 7 7 7",
  chevronRight: "M9 5l7 7-7 7",
  chevronUp: "M5 15l7-7 7 7",
  chevronDown: "M5 9l7 7 7-7",
  alert: "M12 4l9 16H3l9-16z M12 10v4.5 M12 17.4v.1",
  truck: "M2.5 6h10.5v10.5H2.5z M13 9.5h4.2l3.3 3.3v3.7H13z M4.2 17.8a1.9 1.9 0 1 0 3.8 0 1.9 1.9 0 1 0-3.8 0z M15 17.8a1.9 1.9 0 1 0 3.8 0 1.9 1.9 0 1 0-3.8 0z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3 2",
  cloudCheck: "M7 18.5h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 9a4.75 4.75 0 0 0 0 9.5z M9.5 14l2 2 3.5-3.5",
  cloudRain: "M7 15h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 5.5a4.75 4.75 0 0 0 0 9.5z M8 18l-1 2.5 M12 18l-1 2.5 M16 18l-1 2.5",
  gauge: "M4 15a8 8 0 0 1 16 0 M12 15l3.5-4 M4 19h16",
  history: "M4 12a8 8 0 1 0 2.4-5.7L4 8.5 M4 4v4.5h4.5 M12 8v4l3 2",
  wifiOff: "M2 8.8a15 15 0 0 1 4.3-2.5M10 5.1a15 15 0 0 1 12 3.7M5.5 12.3a10 10 0 0 1 4-2M14.5 10.4a10 10 0 0 1 4 1.9M9 15.8a5 5 0 0 1 6 0M12 19.5v.1M3 3l18 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M16 16l4.5 4.5",
  download:"M12 4v11 M7 10l5 5 5-5 M5 20h14",
  tap: "M5 7h11a3 3 0 0 1 3 3v1 M9 7V4h4v3 M19 13v3 M19 19v.1",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  circle:"M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  fit: "M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5",
  building: "M12 3v3 M12 3h3 M4 9l8-3 8 3H4z M6 9v9 M10 9v9 M14 9v9 M18 9v9 M4 21h16 M5 18h14",
  home: "M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-5.5h4V20",
  store: "M4 9l1.5-5h13L20 9 M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9 M5 12v8h14v-8 M10 20v-4h4v4",
  factory: "M3 20V10l5 3V10l5 3V10l5 3V4h3v16H3z M7 17h2 M12 17h2",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className = "", strokeWidth = 2 }: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
