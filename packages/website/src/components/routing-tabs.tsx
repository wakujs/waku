'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import cx from 'classnames';
import { useAtom } from 'jotai';
import { routingTabAtom } from '../atoms/index.js';
import type { RoutingPreference } from '../atoms/index.js';

type TabButtonProps = {
  tab: RoutingPreference;
  label: string;
  isActive: boolean;
  onClick: () => void;
};

const TabButton = ({ tab, label, isActive, onClick }: TabButtonProps) => {
  return (
    <button
      role="tab"
      id={`tab-${tab}`}
      aria-selected={isActive}
      aria-controls={`tabpanel-${tab}`}
      tabIndex={isActive ? 0 : -1}
      onClick={onClick}
      className={cx(
        'font-badge rounded-md px-4 py-2.5 text-sm uppercase leading-none transition-colors duration-200 ease-in-out sm:text-base',
        isActive
          ? 'bg-primary-700 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white',
      )}
    >
      {label}
    </button>
  );
};

type TabPanelProps = {
  tab: RoutingPreference;
  isActive: boolean;
  children: ReactNode;
};

const TabPanel = ({ tab, isActive, children }: TabPanelProps) => {
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tab}`}
      aria-labelledby={`tab-${tab}`}
      hidden={!isActive}
      tabIndex={0}
    >
      {children}
    </div>
  );
};

type RoutingTabsProps = {
  fileBasedContent: ReactNode;
  configBasedContent: ReactNode;
};

export const RoutingTabs = ({
  fileBasedContent,
  configBasedContent,
}: RoutingTabsProps) => {
  const [activeTab, setActiveTab] = useAtom(routingTabAtom);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveTab(activeTab === 'file-based' ? 'config-based' : 'file-based');
    }
  };

  return (
    <div className="mt-6">
      <div
        role="tablist"
        aria-label="Routing documentation type"
        className="mb-6 flex gap-2"
        onKeyDown={handleKeyDown}
      >
        <TabButton
          tab="file-based"
          label="File-based"
          isActive={activeTab === 'file-based'}
          onClick={() => setActiveTab('file-based')}
        />
        <TabButton
          tab="config-based"
          label="Config-based"
          isActive={activeTab === 'config-based'}
          onClick={() => setActiveTab('config-based')}
        />
      </div>
      <TabPanel tab="file-based" isActive={activeTab === 'file-based'}>
        {fileBasedContent}
      </TabPanel>
      <TabPanel tab="config-based" isActive={activeTab === 'config-based'}>
        {configBasedContent}
      </TabPanel>
    </div>
  );
};
