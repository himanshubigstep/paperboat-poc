'use client';

import { Drawer, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import { AvailTag, CityTag, PlatformTag, fmtINR, fmtIST, shortName } from '@/components/ui';
import { discountPct } from '@/lib/metrics';
import type { Snapshot } from '@/lib/types';

export interface DrawerSpec<T extends object = Record<string, unknown>> {
  title: string;
  sub?: ReactNode;
  columns: ColumnsType<T>;
  rows: T[];
  rowKey?: (r: T) => string;
  note?: ReactNode;
}

/** Drawer with the rows / numbers behind a figure. */
export function RowsDrawer<T extends object>({ spec, onClose }: { spec: DrawerSpec<T> | null; onClose: () => void }) {
  return (
    <Drawer open={!!spec} onClose={onClose} width={Math.min(920, typeof window === 'undefined' ? 920 : window.innerWidth)} title={spec?.title} destroyOnClose>
      {spec && (
        <>
          {spec.sub && <div className="muted" style={{ marginBottom: 12 }}>{spec.sub}</div>}
          <Table<T> size="small" columns={spec.columns} dataSource={spec.rows} rowKey={(r, i) => (spec.rowKey ? spec.rowKey(r) : String(i))} pagination={{ pageSize: 12, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
          {spec.note && <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{spec.note}</div>}
        </>
      )}
    </Drawer>
  );
}

/** Raw capture-row columns. */
export const snapshotColumns: ColumnsType<Snapshot> = [
  { title: 'Product', dataIndex: 'name', render: (n: string, r) => (n ? shortName(n) : <span className="muted">no title · id {r.product_id}</span>) },
  { title: 'Id', dataIndex: 'product_id' },
  { title: 'Pack', dataIndex: 'pack_size', render: (v: string) => v || '—' },
  { title: 'Platform', dataIndex: 'platform', render: (v: string) => <PlatformTag id={v} /> },
  { title: 'City', dataIndex: 'city', render: (v: string) => <CityTag city={v} /> },
  { title: 'State', dataIndex: 'availability', render: (v: Snapshot['availability']) => <AvailTag v={v} /> },
  { title: 'MRP', dataIndex: 'mrp', align: 'right', render: (v: number | null) => (v === null ? '—' : fmtINR(v)) },
  { title: 'Price', dataIndex: 'selling_price', align: 'right', render: (v: number | null) => (v === null ? '—' : fmtINR(v)) },
  { title: 'Discount', key: 'disc', align: 'right', render: (_: unknown, r) => `${discountPct(r.mrp, r.selling_price)}%` },
  { title: 'Stock', dataIndex: 'stock', align: 'right' },
  { title: 'Captured', dataIndex: 'scraped_at', render: (v: string) => fmtIST(v) },
];
