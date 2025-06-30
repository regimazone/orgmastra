import { cn } from '@/lib/utils';

type PanelLayoutProps = {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function PanelLayout({ children, className, style }: PanelLayoutProps) {
  return (
    <div
      className={cn(
        'grid grid-rows-[auto_1fr] p-[1.375rem] pb-0  h-ful overflow-y-auto',
        '[&>:last-child]:mb-[3rem]',
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}
