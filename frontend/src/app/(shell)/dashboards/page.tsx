'use client';

import { Button } from 'antd';
import { DownloadOutlined, MessageOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { PageHead, UrlTabs } from '@/components/ui';
import { useFilters } from '@/hooks/useFilters';
import OverviewTab from './tabs/OverviewTab';
import SalesTab from './tabs/SalesTab';
import AssortmentTab from './tabs/AssortmentTab';
import PricePromoTab from './tabs/PricePromoTab';
import SearchShelfTab from './tabs/SearchShelfTab';
import NetworkTab from './tabs/NetworkTab';
import ChannelsTab from './tabs/ChannelsTab';
import CustomerVoiceTab from './tabs/CustomerVoiceTab';
import InventoryTab from './tabs/InventoryTab';
import ForecastTab from './tabs/ForecastTab';
import AnomaliesTab from './tabs/AnomaliesTab';

/** Executive dashboard — 11 tabs, same structure as the reference product. Each tab is its own file in ./tabs. */
export default function Dashboards() {
  const { scopeLabel, query } = useFilters();
  return (
    <>
      <PageHead
        title="Executive dashboard"
        sub={`Performance across platforms, products and cities · ${scopeLabel}`}
        actions={<><Button icon={<DownloadOutlined />}>Export</Button><Link href={`/assistant${query}`}><Button type="primary" icon={<MessageOutlined />}>Ask about this view</Button></Link></>}
      />
      <UrlTabs
        items={[
          { key: 'overview', label: 'Overview', children: <OverviewTab /> },
          { key: 'sales', label: 'Sales', children: <SalesTab /> },
          { key: 'assortment', label: 'Assortment', children: <AssortmentTab /> },
          { key: 'price', label: 'Price & promo', children: <PricePromoTab /> },
          { key: 'search', label: 'Search & shelf', children: <SearchShelfTab /> },
          { key: 'network', label: 'Network', children: <NetworkTab /> },
          { key: 'channels', label: 'Channels', children: <ChannelsTab /> },
          { key: 'voice', label: 'Customer voice', children: <CustomerVoiceTab /> },
          { key: 'inventory', label: 'Inventory', children: <InventoryTab /> },
          { key: 'forecast', label: 'Forecasting', children: <ForecastTab /> },
          { key: 'anomalies', label: 'Anomalies', children: <AnomaliesTab /> },
        ]}
      />
    </>
  );
}
