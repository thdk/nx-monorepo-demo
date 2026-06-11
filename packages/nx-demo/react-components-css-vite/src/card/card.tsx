import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';
import classes from './card.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  footer?: ReactNode;
  children: ReactNode;
}

export const Card = ({
  title,
  footer,
  className,
  children,
  ...rest
}: CardProps) => {
  const cls = cn(classes.card, className);
  return (
    <div className={cls} {...rest}>
      {title && <div className={classes.header}>{title}</div>}
      <div className={classes.body}>{children}</div>
      {footer && <div className={classes.footer}>{footer}</div>}
    </div>
  );
};
