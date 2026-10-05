/** A sine wave in a rounded square: the app's mark. */
export default function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect width="28" height="28" rx="7" fill="var(--color-accent)" />
      <path
        d="M4 14c3-8 5-8 8 0s5 8 8 0 3-4 4-4"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}