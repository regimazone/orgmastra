import { cn } from '@/lib/utils';
import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  as?: React.ElementType;
  className?: string;
  href?: string;
  to?: string;
  prefetch?: boolean | null;
  children: React.ReactNode;
  size?: 'md' | 'lg';
  variant?: 'default' | 'light' | 'outline' | 'ghost';
  target?: string;
}

export const Button = ({ className, as, size = 'md', variant = 'default', ...props }: ButtonProps) => {
  const Component = as || 'button';

  return (
    <Component
      className={cn(
        'text-[.875rem] inline-flex items-center justify-center rounded-md  px-[1rem] gap-[.75rem] min-h-[2.25rem] leading-0 border  bg-transparent text-[rgba(255,255,255,0.7)] border-[rgba(255,255,255,0.15)]',
        '[&:not(:disabled):hover]:border-[rgba(255,255,255,0.25)] [&:not(:disabled):hover]:text-[rgba(255,255,255,0.9)]',
        '[&>svg]:w-[1em] [&>svg]:h-[1em] [&>svg]:mx-[-0.3em] [&>svg]:opacity-70',
        className,
        {
          'cursor-not-allowed opacity-50': props.disabled,
        },
      )}
      {...props}
    />
  );
};
