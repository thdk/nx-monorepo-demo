import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';
import classes from './button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export const Button = ({
  variant = 'primary',
  className,
  children,
  ...rest
}: ButtonProps) => {
  const cls = cn(classes.button, classes[variant], className);
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
};
