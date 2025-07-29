import { cn } from '@/lib/utils';

type EntryListPageHeaderProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
};

export function EntityPageHeader({ title, description, icon, children }: EntryListPageHeaderProps) {
  return (
    <div
      className={cn(
        'grid z-[1] top-0 gap-y-[0.5rem] text-icon4 bg-surface2 py-[3rem]',
        '3xl:h-full 3xl:content-start 3xl:grid-rows-[auto_1fr] h-full 3xl:overflow-y-auto',
      )}
    >
      <div className={cn('grid gap-[.5rem] ', '[&>p]:text-icon4 [&>p]:text-[0.875rem] [&>p]:m-0')}>
        <div
          className={cn(
            'flex gap-[.75em] items-center',
            '[&>h1]:text-icon6 [&>h1]:text-[1.25rem] [&>h1]:font-normal',
            '[&>svg]:w-[1.4rem] [&>svg]:h-[1.4rem] [&>svg]:text-icon3',
          )}
        >
          {icon}
          <h1>{title}</h1>
        </div>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
