export function WhatsAppSymbol({ className = 'w-5 h-5' }: { className?: string }) {
  const sizeClass = className.includes('w-7')
    ? 'text-2xl'
    : className.includes('w-6')
      ? 'text-xl'
      : className.includes('w-5')
        ? 'text-lg'
        : 'text-sm';

  return (
    <span
      role="img"
      aria-label="What's up"
      className={`inline-flex items-center justify-center leading-none select-none ${sizeClass} ${className}`}
    >
      🤙
    </span>
  );
}
