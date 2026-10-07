/**
 * SAMPLE feed catalogue for Data & Datasets (shape follows the reference data.js `connectors`).
 * Connected rows are filled with REAL counts by the page; everything unconnected is placeholder.
 */
import { PLATFORMS } from '@/lib/config';

export interface Feed {
  id: string;
  name: string;
  category: string;
  route: string;
  grain: string;
  owner: string;
  status: 'connected' | 'not connected' | 'pending access';
  platform?: string;
  stamp: 'row' | 'file';
  needs: string[];
  screens: string[];
}

/** Feeds that are not tied to one platform. Status is sample unless it is the shelf capture itself. */
export const GENERAL_FEEDS: Feed[] = [
  { id: 'store_directory', name: 'Dark-store directory', category: 'Reference', route: 'Derived from the shelf capture', grain: 'store', owner: 'Data platform', status: 'connected', stamp: 'row', needs: [], screens: [] },
  { id: 'sku_master', name: 'SKU master', category: 'Reference', route: 'Derived from the shelf capture', grain: 'canonical SKU', owner: 'Catalogue team', status: 'connected', stamp: 'file', needs: [], screens: [] },
  { id: 'platform_sellout', name: 'Platform sell-out', category: 'Sales', route: 'Seller-portal export / API', grain: 'SKU × city × day', owner: 'Sales ops', status: 'pending access', stamp: 'row', needs: ['Seller-portal read access per platform', 'Daily export schedule'], screens: ['Dashboards · Sales', 'Value outcomes'] },
  { id: 'retail_media', name: 'Retail media performance', category: 'Marketing', route: 'Platform ads API', grain: 'campaign × day', owner: 'Performance marketing', status: 'not connected', stamp: 'row', needs: ['Ads API credentials', 'Campaign-to-SKU mapping'], screens: ['Dashboards · Search & shelf', 'Reports · Media efficiency'] },
  { id: 'search_rank', name: 'Search rank capture', category: 'Shelf', route: 'Keyword capture on the apps', grain: 'keyword × city × platform', owner: 'Data platform', status: 'not connected', stamp: 'row', needs: ['Keyword list approval', 'Capture schedule'], screens: ['Dashboards · Search & shelf', 'Reports · Search visibility'] },
  { id: 'competitor_benchmark', name: 'Competitor benchmark', category: 'Shelf', route: 'Shelf capture of rival brands', grain: 'brand × platform', owner: 'Insights', status: 'not connected', stamp: 'row', needs: ['Rival brand list', 'Comparable pack mapping'], screens: ['Dashboards · Channels', 'Reports · Competitive response'] },
  { id: 'listing_ratings', name: 'Listing ratings', category: 'Content', route: 'Rating column of the shelf capture', grain: 'listing', owner: 'Data platform', status: 'not connected', stamp: 'row', needs: ['Rating and review count in the capture payload'], screens: ['Ratings & Reviews'] },
  { id: 'erp_inventory', name: 'ERP inventory position', category: 'Supply', route: 'ERP extract', grain: 'batch × warehouse', owner: 'Supply chain', status: 'pending access', stamp: 'file', needs: ['ERP read-only role', 'Warehouse-to-city map'], screens: ['Dashboards · Inventory', 'Reports · Dead-stock & expiry'] },
  { id: 'customer_voice', name: 'Customer voice (review text)', category: 'Content', route: 'Review text feed', grain: 'review', owner: 'Consumer insights', status: 'not connected', stamp: 'row', needs: ['Review text access'], screens: ['Dashboards · Customer voice'] },
  { id: 'cost_margin', name: 'Cost & margin', category: 'Finance', route: 'Finance file drop', grain: 'SKU × month', owner: 'Finance', status: 'not connected', stamp: 'file', needs: ['Monthly COGS file'], screens: ['Value outcomes'] },
];

/** One unconnected shelf-capture feed per platform that config marks `connected: false`. */
export const platformFeeds = (): Feed[] =>
  PLATFORMS.map((p) => ({
    id: `shelf_${p.id}`,
    name: `Shelf capture · ${p.label}`,
    category: 'Shelf',
    route: `Browser capture of ${p.label}`,
    grain: 'listing × store × capture',
    owner: 'Data platform',
    status: (p.connected ? 'connected' : ['zepto', 'swiggy', 'bigbasket'].includes(p.id) ? 'pending access' : 'not connected') as Feed['status'],
    platform: p.id,
    stamp: 'row' as const,
    needs: ['Capture adapter for the platform', 'Pincode list per city', 'Store selection rules'],
    screens: ['All dashboards', 'Signals & Insights', 'Catalogue Matching'],
  }));

export const LINEAGE = {
  columns: ['Source', 'Staging', 'Operational', 'Analytics', 'Consumers'],
  nodes: [
    { id: 'src_capture', col: 0, label: 'Shelf capture (apps)', from: [] as string[] },
    { id: 'src_other', col: 0, label: 'Sales · ads · ERP (not connected)', from: [] },
    { id: 'stg_raw', col: 1, label: 'raw_capture', from: ['src_capture'] },
    { id: 'stg_files', col: 1, label: 'file_drops', from: ['src_other'] },
    { id: 'op_snap', col: 2, label: 'listing_snapshot', from: ['stg_raw'] },
    { id: 'op_store', col: 2, label: 'store_directory', from: ['stg_raw'] },
    { id: 'op_sku', col: 2, label: 'canonical_sku', from: ['stg_raw'] },
    { id: 'an_avail', col: 3, label: 'availability_stats', from: ['op_snap'] },
    { id: 'an_sell', col: 3, label: 'sellout_interval (estimate)', from: ['op_snap'] },
    { id: 'an_price', col: 3, label: 'price_and_discount', from: ['op_snap'] },
    { id: 'an_health', col: 3, label: 'content_health', from: ['op_snap', 'op_sku'] },
    { id: 'an_match', col: 3, label: 'catalogue_match', from: ['op_snap', 'op_sku'] },
    { id: 'c_dash', col: 4, label: 'Dashboards', from: ['an_avail', 'an_sell', 'an_price'] },
    { id: 'c_sig', col: 4, label: 'Signals & Inbox', from: ['an_avail', 'an_price', 'an_sell'] },
    { id: 'c_rep', col: 4, label: 'Reports Center', from: ['an_avail', 'an_sell', 'an_price', 'an_health'] },
    { id: 'c_cat', col: 4, label: 'Catalogue & Content', from: ['an_health', 'an_match'] },
    { id: 'c_ast', col: 4, label: 'Assistant', from: ['an_avail', 'an_sell', 'an_price', 'op_sku'] },
  ],
};
