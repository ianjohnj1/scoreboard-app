import React from 'react';
import Avatar from './Avatar';

type UserAvatarProps = {
  display_name?: string | null;
  avatar_color?: string | null;
  avatar_url?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

export default function UserAvatar({
  display_name,
  avatar_color,
  avatar_url,
  size = 'md',
  className = '',
}: UserAvatarProps) {
  return (
    <Avatar
      name={display_name || '?'}
      color={avatar_color || '#3b82f6'}
      url={avatar_url}
      size={size}
      className={className}
    />
  );
}
