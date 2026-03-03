'use client';

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
    <div className="sb-ui-tabs" role="tablist" aria-label="Page Sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          className={tab.id === activeTab ? 'sb-ui-tab is-active' : 'sb-ui-tab'}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
