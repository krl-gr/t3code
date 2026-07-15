export function ContextBarTerminalIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 16 16">
      <path
        d="M4.25 5.25L6.75 8L4.25 10.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path d="M8.4 10.75H12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
    </svg>
  );
}

export function ContextBarDiffIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 16 16">
      <path d="M4 7H12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path d="M4 13H12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path d="M8 3V11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function ContextBarMoreIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 16 16">
      <circle cx="4" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}
