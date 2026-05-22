export function ContextBarFolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
      <path
        d="M1.75 4.35C1.75 3.8 2.2 3.35 2.75 3.35H5.15C5.45 3.35 5.72 3.48 5.91 3.7L6.62 4.5H11.25C11.8 4.5 12.25 4.95 12.25 5.5V10.25C12.25 10.8 11.8 11.25 11.25 11.25H2.75C2.2 11.25 1.75 10.8 1.75 10.25V4.35Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
    </svg>
  );
}

export function ContextBarTerminalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
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
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M4 7H12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path d="M4 13H12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path d="M8 3V11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function ContextBarMoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <circle cx="4" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}
