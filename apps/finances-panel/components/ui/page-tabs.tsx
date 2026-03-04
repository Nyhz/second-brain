'use client';

import { cn } from '../../lib/utils';

type Tab = {
  id: string;
  label: string;
};

type PageTabsProps = {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
};

export function PageTabs({ tabs, activeTab, onChange }: PageTabsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Page Sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          className={cn(
            'inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
            tab.id === activeTab
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
