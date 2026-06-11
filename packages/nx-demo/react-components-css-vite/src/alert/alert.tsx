import type { HTMLAttributes, ReactNode } from 'react';
import classes from './alert.module.css';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  children: ReactNode;
}

export const Alert = ({
  variant = 'info',
  title,
  className,
  children,
  ...rest
}: AlertProps) => {
  const cls = [classes.alert, classes[variant], className]
    .filter(Boolean)
    .join(' ');
  return (
    <div role="alert" className={cls} {...rest}>
      {title && <strong className={classes.title}>{title}</strong>}
      <span className={classes.body}>{children}</span>
    </div>
  );
};
