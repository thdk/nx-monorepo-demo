import type { HTMLAttributes } from 'react';
import classes from './avatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  initials?: string;
  size?: AvatarSize;
}

export const Avatar = ({
  src,
  alt = '',
  initials,
  size = 'md',
  className,
  ...rest
}: AvatarProps) => {
  const cls = [classes.avatar, classes[size], className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} {...rest}>
      {src ? (
        <img className={classes.image} src={src} alt={alt} />
      ) : (
        <span className={classes.initials}>
          {initials?.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
};
