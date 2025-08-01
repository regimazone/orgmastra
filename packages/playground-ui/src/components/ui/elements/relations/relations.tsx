import { cn } from '@/lib/utils';
import { Link2Icon } from 'lucide-react';
import React from 'react';
import * as HoverCard from '@radix-ui/react-hover-card';

type Item = {
  id: string;
  name: React.ReactNode;
  path?: string;
  description?: React.ReactNode;
};

export function Relations({
  title,
  icon,
  items,
  LinkComponent,
}: {
  title: React.ReactNode;
  icon: React.ReactNode;
  items?: Item[];
  LinkComponent: React.ComponentType<{ to: string; children: React.ReactNode }>;
}) {
  return (
    <div
      className={cn(
        'flex gap-[1rem] mt-[1rem] text-[0.875rem] items-center mb-[0.25rem]',
        '[&>svg]:w-[1em] [&>svg]:h-[1em] [&>svg]:text-icon3',
      )}
    >
      <span className="text-icon3">{title}</span>
      <Link2Icon />

      <div
        className={cn(
          'flex gap-[1rem]',
          '[&>a]:text-icon4 [&>a]:transition-colors [&>a]:flex [&>a]:items-center [&>a]:gap-[0.5rem] [&>a]:rounded-md [&>a]:text-[0.875rem] ',
          '[&>a:hover]:text-icon5 [&>a:hover]:border-b [&>a:hover]:border-border1',
        )}
      >
        {items?.map(item => {
          return item.path ? (
            <RelationWrapper description={item.description}>
              <LinkComponent to={item.path} key={item.id}>
                {item?.name}
              </LinkComponent>
            </RelationWrapper>
          ) : (
            <span key={item.id}>{item?.name}</span>
          );
        })}
      </div>
    </div>
  );
}

type RelationWrapperProps = {
  description?: React.ReactNode;
  children?: React.ReactNode;
};

function RelationWrapper({ description, children }: RelationWrapperProps) {
  return description ? (
    <HoverCard.Root openDelay={250}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          className="z-[100] w-auto max-w-[15rem] rounded-md bg-[#333] p-[.5rem] px-[1rem] text-[.75rem] text-icon5 text-center"
          sideOffset={5}
          side="top"
        >
          {description}
          <HoverCard.Arrow className="fill-surface5" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  ) : (
    children
  );
}
