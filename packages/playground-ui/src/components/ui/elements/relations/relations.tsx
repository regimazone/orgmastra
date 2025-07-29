import { cn } from '@/lib/utils';
import { Link2Icon } from 'lucide-react';
import React from 'react';
import * as HoverCard from '@radix-ui/react-hover-card';

type Item = {
  id: string;
  name: React.ReactNode;
  icon: React.ReactNode;
  path?: string;
  description?: React.ReactNode;
};

export function Relations({
  title,
  items,
  LinkComponent,
}: {
  title: React.ReactNode;
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
      <span>{title}</span>
      <Link2Icon />

      <div
        className={cn(
          'flex gap-[1rem]',
          '[&>a]:text-icon4 [&>a]:transition-colors [&>a]:flex [&>a]:items-center [&>a]:gap-[0.5rem] [&>a]:border [&>a]:border-border1 [&>a]:p-[0.25rem] [&>a]:px-[0.5rem] [&>a]:rounded-md [&>a]:text-[0.875rem]',
          '[&>a:hover]:text-icon5',
        )}
      >
        {items?.map(item => {
          return item.path ? (
            <RelationWrapper description={item.description}>
              <LinkComponent to={item.path} key={item.id}>
                {item?.icon} {item?.name}
              </LinkComponent>
            </RelationWrapper>
          ) : (
            <span key={item.id}>
              {item?.icon} {item?.name}
            </span>
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
          className="z-[100] w-[15rem] rounded-md bg-surface5 p-[.75rem] text-[.875rem] text-icon4 text-center"
          sideOffset={5}
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
