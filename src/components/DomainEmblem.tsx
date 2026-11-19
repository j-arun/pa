import type { EventCardIconType, PromptDomain } from '../types/workbench';

export function getDomainEmblemIcon(domain?: PromptDomain): EventCardIconType {
  switch (domain) {
    case 'astrology':
      return 'briefcase';
    case 'finance':
      return 'layers';
    case 'general':
      return 'heart';
    case 'health':
      return 'shield';
    default:
      return 'sparkles';
  }
}

export function EventCategoryEmblem({
  icon,
  className = 'w-9 h-9 shrink-0',
}: {
  icon: EventCardIconType;
  className?: string;
}) {
  switch (icon) {
    case 'layers':
      return (
        <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
          <path
            d="M6.5 17.5L18 7.5L29.5 17.5V29.5C29.5 30.6 28.6 31.5 27.5 31.5H8.5C7.4 31.5 6.5 30.6 6.5 29.5V17.5Z"
            fill="#F59E0B"
          />
          <path
            d="M4.5 18L18 6L31.5 18"
            stroke="#D97706"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <rect x="14.5" y="20.5" width="7" height="11" rx="1.8" fill="#FFFBEB" />
        </svg>
      );
    case 'calendar':
      return (
        <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
          <rect x="4" y="6" width="28" height="26" rx="5" fill="#2563EB" />
          <rect x="7" y="12" width="22" height="17" rx="2.5" fill="#FFFFFF" />
          <rect x="24" y="22" width="8" height="10" rx="2" fill="#10B981" />
          <rect x="4" y="22" width="7" height="10" rx="2" fill="#F59E0B" />
          <text
            x="18"
            y="24"
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="700"
            fill="#1D4ED8"
            fontFamily="system-ui, sans-serif"
          >
            31
          </text>
        </svg>
      );
    case 'compass':
      return (
        <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
          <circle cx="18" cy="18" r="14" fill="#E0F2FE" />
          <path d="M23.5 12.5L19.8 21.2L12.5 23.5L16.2 14.8L23.5 12.5Z" fill="#0284C7" />
          <path d="M23.5 12.5L19.8 21.2L16.2 14.8L23.5 12.5Z" fill="#38BDF8" />
          <circle cx="18" cy="18" r="2" fill="#FFFFFF" />
        </svg>
      );
    case 'briefcase':
      return (
        <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
          <rect x="5" y="11" width="26" height="19" rx="4.5" fill="#4F46E5" />
          <path
            d="M13 11V8.5C13 7.4 13.9 6.5 15 6.5H21C22.1 6.5 23 7.4 23 8.5V11"
            stroke="#4338CA"
            strokeWidth="2.5"
            fill="none"
          />
          <rect x="5" y="17" width="26" height="3" fill="#818CF8" opacity="0.65" />
          <rect x="15.5" y="16" width="5" height="5" rx="1.2" fill="#FFFFFF" />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
          <path
            d="M18 30.5C18 30.5 6 22.8 6 13.8C6 9.8 9.2 6.8 13 6.8C15.3 6.8 17.2 8 18 9.7C18.8 8 20.7 6.8 23 6.8C26.8 6.8 30 9.8 30 13.8C30 22.8 18 30.5 18 30.5Z"
            fill="#F43F5E"
          />
          <circle cx="12.5" cy="12" r="2.2" fill="#FDA4AF" opacity="0.7" />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
          <rect x="4" y="4" width="28" height="28" rx="9" fill="#10B981" />
          <rect x="15.25" y="9.5" width="5.5" height="17" rx="1.8" fill="#FFFFFF" />
          <rect x="9.5" y="15.25" width="17" height="5.5" rx="1.8" fill="#FFFFFF" />
        </svg>
      );
    case 'sparkles':
    default:
      return (
        <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
          <path
            d="M18 4L21.2 14.8L32 18L21.2 21.2L18 32L14.8 21.2L4 18L14.8 14.8L18 4Z"
            fill="#8B5CF6"
          />
          <circle cx="28" cy="9" r="2.5" fill="#F59E0B" />
        </svg>
      );
  }
}
