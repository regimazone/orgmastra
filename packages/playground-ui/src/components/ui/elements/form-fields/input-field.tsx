import { cn } from '@/lib/utils';
import { TriangleAlertIcon } from 'lucide-react';
import * as React from 'react';

type InputFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  name?: string;
  testId?: string;
  label?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  value?: string;
  helpMsg?: string;
  errorMsg?: string;
};

export function InputField({
  name,
  value,
  label,
  className,
  testId,
  required,
  disabled,
  helpMsg,
  errorMsg,
  ...props
}: InputFieldProps) {
  return (
    <div
      className={cn(
        'grid gap-[.5rem] grid-rows-[auto_1fr]',
        {
          'grid-rows-[auto_1fr_auto]': helpMsg,
        },
        className,
      )}
    >
      <label className={cn('text-[0.8125rem] text-icon3 flex justify-between items-center')}>
        {label}
        {required && <i className="text-icon2">(required)</i>}
      </label>
      <div className={cn('grid w-full items-center gap-[1rem]')}>
        <input
          name={name}
          value={value}
          className={cn(
            'flex grow items-center cursor-pointer text-[0.875rem] text-[rgba(255,255,255,0.7)] border border-[rgba(255,255,255,0.15)] leading-none rounded-lg bg-transparent min-h-[2.5rem] px-[0.75rem] py-[0.5rem]',
            'focus:outline-none focus:shadow-[inset_0_0_0_1px_#18fb6f]',
            {
              'cursor-not-allowed opacity-50': disabled,
              'border-red-600': errorMsg,
            },
          )}
          data-testid={testId}
          {...props}
        />
      </div>
      {helpMsg && <p className="text-icon3 text-[0.75rem]">{helpMsg}</p>}
      {errorMsg && (
        <p
          className={cn(
            'text-[0.75rem] text-red-500 flex items-center gap-[.5rem]',
            '[&>svg]:w-[1.1em] [&>svg]:h-[1.1em] [&>svg]:opacity-70',
          )}
        >
          <TriangleAlertIcon /> {errorMsg}
        </p>
      )}
    </div>
  );
}
