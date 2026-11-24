import React from 'react';
import { BadgeCheck, Building2 } from 'lucide-react';

interface AccountBadgeProps {
  accountType?: string | null;
  isVerified?: boolean | null;
  isAdmin?: boolean | null;
  compact?: boolean;
}

export const AccountBadge: React.FC<AccountBadgeProps> = ({
  accountType,
  isVerified,
  isAdmin,
  compact = false,
}) => (
  <span className="inline-flex items-center gap-1">
    {accountType === 'organization' && (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold text-violet-300">
        <Building2 className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        Organization
        {isVerified && <BadgeCheck className="h-3 w-3 text-sky-400" aria-label="Verified organization" />}
      </span>
    )}
    {isAdmin && (
      <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
        Super Admin
      </span>
    )}
  </span>
);
