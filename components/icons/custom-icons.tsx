import type { SVGProps } from "react";

/**
 * Meta brand circular badge icon
 */
export function MetaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      {...props}
    >
      <circle cx="512" cy="512" r="512" fill="#0467df" />
      <path
        d="M634.78 314.6c-46.25 0-82.4 34.83-115.12 79.08-45-57.26-82.58-79.08-127.59-79.08C300.31 314.6 230 434 230 560.42c0 79.09 38.26 129 102.36 129 46.13 0 79.31-21.75 138.29-124.85 0 0 24.59-43.42 41.5-73.32q8.89 14.35 18.73 30.93l27.66 46.53c53.86 90.13 83.88 120.69 138.27 120.69 62.44 0 97.19-50.57 97.19-131.31 0-132.34-71.89-243.49-159.22-243.49Zm-209.11 222c-47.82 75-64.36 91.76-91 91.76-27.4 0-43.68-24.05-43.68-66.95 0-91.76 45.75-185.59 100.29-185.59 29.53 0 54.22 17.06 92 71.18-35.87 55.1-57.61 89.64-57.61 89.64Zm180.47-9.44L573.07 472q-13.42-21.83-25.8-40.19c29.8-46 54.39-68.92 83.63-68.92 60.74 0 109.34 89.43 109.34 199.29 0 41.87-13.72 66.17-42.13 66.17-27.24.05-40.25-17.94-91.97-101.15Z"
        fill="#fff"
      />
    </svg>
  );
}

/**
 * Glass-gradient directional Arrow Right vector icon
 */
export function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      overflow="visible"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="arrow-right-glass-g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.78" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.36" />
        </linearGradient>
        <linearGradient id="arrow-right-glass-ge" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24">
          <stop offset="0" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.55" />
        </linearGradient>
        <mask id="arrow-right-glass-gm" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">
          <path d="M4 12L20 12" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 6L18.727 10.727A1.8 1.8 0 0 1 18.727 13.273L14 18" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
        <mask id="arrow-right-glass-gp" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">
          <rect x="-2" y="-2" width="28" height="28" fill="#fff" />
        </mask>
        <mask id="arrow-right-glass-go" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">
          <rect x="-2" y="-2" width="28" height="28" fill="#fff" />
        </mask>
      </defs>
      <rect x="-2" y="-2" width="28" height="28" fill="url(#arrow-right-glass-ge)" mask="url(#arrow-right-glass-gm)" />
    </svg>
  );
}
