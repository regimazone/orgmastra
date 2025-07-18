import { cn } from '@/lib/utils';
import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from '@/components/ui/select';

type SelectFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  name?: string;
  testId?: string;
  label?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  value?: string;
  helpMsg?: string;
  errorMsg?: string;
  onChange?: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({
  name,
  value,
  label,
  className,
  required,
  disabled,
  helpMsg,
  onChange,
  options,

  placeholder = 'Select an option',
}: SelectFieldProps) {
  return (
    <div
      className={cn(
        'grid gap-[.5rem]',
        {
          'grid-rows-[auto_1fr]': label,
          'grid-rows-[auto_1fr_auto]': helpMsg,
        },
        className,
      )}
    >
      {label && (
        <label className={cn('text-[0.8125rem] text-icon3 flex justify-between items-center')}>
          {label}
          {required && <i className="text-icon2">(required)</i>}
        </label>
      )}
      <Select name={name} value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="select-dataset" className="w-full border border-[rgba(255,255,255,0.15)] rounded-lg">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.label} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helpMsg && <p className="text-icon3 text-[0.75rem]">{helpMsg}</p>}
    </div>
  );
}
