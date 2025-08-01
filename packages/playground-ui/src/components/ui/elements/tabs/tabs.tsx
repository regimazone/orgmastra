import { useState } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

type TabsProps<T extends string> = {
  children: React.ReactNode;
  defaultTab: T;
  value?: T;
  onValueChange?: (value: T) => void;
  className?: string;
};

type TabListProps = {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'buttons';
};

type TabProps = {
  children: React.ReactNode;
  value: string;
  onClick?: () => void;
  className?: string;
};

type TabContentProps = {
  children: React.ReactNode;
  value: string;
  className?: string;
};

const Tabs = <T extends string>({ children, defaultTab, value, onValueChange, className }: TabsProps<T>) => {
  const [internalTab, setInternalTab] = useState<T>(defaultTab);

  // Use controlled mode if value and onValueChange are provided
  const isControlled = value !== undefined && onValueChange !== undefined;
  const currentTab = isControlled ? value : internalTab;
  const handleTabChange = (newValue: string) => {
    const typedValue = newValue as T;
    if (isControlled) {
      onValueChange(typedValue);
    } else {
      setInternalTab(typedValue);
    }
  };

  return (
    <RadixTabs.Root value={currentTab} onValueChange={handleTabChange} className={cn('h-full', className)}>
      {children}
    </RadixTabs.Root>
  );
};

const TabList = ({ children, variant, className }: TabListProps) => {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <RadixTabs.List
        className={cn(
          'mb-[1.75rem] flex items-center',
          {
            'border-b border-border1 text-[0.9375rem]': variant === 'default',
            'border border-border1 flex justify-stretch rounded-md overflow-hidden text-[0.875rem] ':
              variant === 'buttons',
            '[&>button]:flex-1 [&>button]:py-[0.5rem] [&>button]:px-[1rem] [&>button]:text-icon3':
              variant === 'buttons',
            '[&>button[data-state=active]]:text-icon5 [&>button[data-state=active]]:bg-[#222]': variant === 'buttons',
          },
          className,
        )}
      >
        {children}
      </RadixTabs.List>
    </div>
  );
};

const Tab = ({ children, value, onClick, className }: TabProps) => {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cn(
        //     'py-[0.5rem] px-[1.5rem] font-normal text-icon3 border-b-[3px] border-transparent',
        //     'data-[state=active]:text-icon5 data-[state=active]:transition-colors data-[state=active]:duration-200  data-[state=active]:border-icon3',
        'hover:text-icon5',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </RadixTabs.Trigger>
  );
};

const TabContent = ({ children, value, className }: TabContentProps) => {
  return (
    <RadixTabs.Content
      value={value}
      className={cn(
        'grid gap-[1.75rem] mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      {children}
    </RadixTabs.Content>
  );
};

Tabs.displayName = 'Tabs';
Tabs.Tab = Tab;
Tab.displayName = 'Tabs.Tab';
Tabs.List = TabList;
TabList.displayName = 'Tabs.List';
Tabs.Content = TabContent;
TabContent.displayName = 'Tabs.Content';

export { Tabs };
