import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollableContainer } from './scrollable-container';
import React from 'react';

const meta: Meta<typeof ScrollableContainer> = {
  title: 'Components/ScrollableContainer',
  component: ScrollableContainer,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof ScrollableContainer>;

export const Default: Story = {
  args: {
    children: (
      <div
        style={{
          width: 1200,
          height: 200,
          background: '#eee',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span>Scrollable Content</span>
      </div>
    ),
  },
};
