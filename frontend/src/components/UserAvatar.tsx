import React, { useEffect, useState } from 'react';
import { resolveMediaUrl } from '../api';

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  src?: string | null;
  country?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  alt?: string;
}

function initials(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'TH';
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  src,
  size,
  className,
  alt = '',
}) => {
  const resolvedSrc = resolveMediaUrl(avatarUrl ?? src);
  const [imgError, setImgError] = useState(false);
  const sizeClass = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-20 h-20' : 'w-12 h-12';

  useEffect(() => {
    setImgError(false);
  }, [resolvedSrc]);

  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-skyBlue to-cyan-300 font-bold text-black ${sizeClass} ${className || ''}`}>
      {resolvedSrc && !imgError ? (
        <img
          src={resolvedSrc}
          alt={alt}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
};
