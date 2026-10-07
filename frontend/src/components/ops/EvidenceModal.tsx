'use client';

import { Modal, Table } from 'antd';
import { useMemo } from 'react';
import { AvailTag, CityTag, EmptyState, fmtIST, fmtINR, PlatformTag, Prov } from '@/components/ui';
import type { Snapshot } from '@/lib/types';
import { productLabel } from '@/mock/ops-common';
import type { OpsCase } from '@/mock/ops-cases';

/** The capture rows a case was raised from (REAL), or the anchored shelf rows for sample cases. */
export function EvidenceModal({ c, latest, onClose }: { c: OpsCase | null; latest: Snapshot[]; onClose: () => void }) {
  const rows = useMemo(() => {
    if (!c) return [];
    const cities = c.city.split(' + ');
    return latest.filter(
      (s) => s.platform === c.platform && cities.includes(s.city) && (!c.rowFilter.avail || s.availability === c.rowFilter.avail) && (!c.rowFilter.product || productLabel(s) === c.rowFilter.product),
    );
  }, [c, latest]);
  return (
    <Modal open={!!c} onCancel={onClose} footer={null} width={860} title={c ? `Evidence · ${c.id}` : ''}>
      {c && (
        <>
          <p className="muted">
            {c.real ? 'The shelf rows this case was raised from (latest capture of each listing).' : 'Sample case — the table shows live shelf rows for the same platform and city; the counts on the case are sample.'}
          </p>
          <Table
            size="small"
            rowKey={(s) => `${s.city}|${s.store_id}|${s.product_id}`}
            dataSource={rows}
            locale={{ emptyText: <EmptyState text="No shelf rows for this slice in the active filters." /> }}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            scroll={{ x: 640 }}
            columns={[
              { title: 'Product', render: (_, s) => <div><b>{productLabel(s)}</b><div className="muted" style={{ fontSize: 12 }}>{s.line}</div></div> },
              { title: 'Platform', render: (_, s) => <><PlatformTag id={s.platform} /> <CityTag city={s.city} /></> },
              { title: 'State', dataIndex: 'availability', render: (v) => <AvailTag v={v} /> },
              { title: 'Price', align: 'right', render: (_, s) => (s.selling_price ? fmtINR(s.selling_price) : '—') },
              { title: 'Stock', dataIndex: 'stock', align: 'right' },
              { title: 'Captured', dataIndex: 'scraped_at', render: (v: string) => <span className="muted">{fmtIST(v)}</span> },
            ]}
          />
          <div style={{ marginTop: 8 }}>{c.real ? <Prov>Shelf capture</Prov> : <Prov kind="sample">Sample data</Prov>}</div>
        </>
      )}
    </Modal>
  );
}
