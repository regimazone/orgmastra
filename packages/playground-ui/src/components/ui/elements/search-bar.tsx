import { Breadcrumb, Crumb } from '@/ds/components/Breadcrumb';
import { HeaderGroup } from '@/ds/components/Header';
import { Button } from '@/ds/components/Button';
import { DividerIcon } from '@/ds/icons/DividerIcon';
import React from 'react';
import { SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '../input';

type SearchBarProps = {
  value: string;
  onSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  style?: React.CSSProperties;
};

export function SearchBar({ value, onSearch, className, style }: SearchBarProps) {
  return (
    <div className={cn('grid relative', className)} style={style}>
      <SearchIcon className="absolute w-[1rem] h-[1rem] translate-x-[0.9rem] translate-y-[0.75rem] text-icon3" />
      <Input
        type="text"
        placeholder="Search for a tool"
        value={value}
        customSize={'lg'}
        onChange={onSearch}
        className="pl-[2.5rem]"
      />
    </div>
  );
}
