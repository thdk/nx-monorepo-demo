import type { HTMLAttributes, ReactNode } from 'react';
import classes from './badge.module.css';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

export const Badge = ({
  tone = 'neutral',
  className,
  children,
  ...rest
}: BadgeProps) => {
  const cls = [classes.badge, classes[tone], className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
};
