export type ListItemType = {
  id: string;
  name: string;
  to: string;
  description?: string;
  icon?: any;
};

export type MainListItemType = ListItemType & {
  columns?: React.ReactNode[];
  collapsible?: React.ReactNode;
};

export type EntryListItemType = ListItemType;
