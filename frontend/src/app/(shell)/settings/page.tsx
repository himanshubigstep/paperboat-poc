'use client';

import { Switch, Table, Tag } from 'antd';
import { Card, PageHead, Prov } from '@/components/ui';
import { CAPTURE_SLOTS_UTC, CITIES, PLATFORMS } from '@/lib/config';

const ist = (utc: string) => {
  const [h, m] = utc.split(':').map(Number);
  const t = h * 60 + m + 330;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export default function Settings() {
  return (
    <>
      <PageHead title="Settings & governance" sub="What is connected, when it is captured, and who can see it" />
      <div className="bento">
        <Card className="span-6" title="Platforms" sub="Add a platform by connecting its capture adapter; filters and screens pick it up automatically" footer={<Prov>Config</Prov>}>
          <Table size="small" rowKey="id" pagination={false} dataSource={PLATFORMS} columns={[
            { title: 'Platform', render: (_, p) => <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 9, background: p.color, marginRight: 8 }} />{p.label}</span> },
            { title: 'Status', render: (_, p) => <Tag bordered={false} color={p.connected ? 'success' : 'default'}>{p.connected ? 'Connected' : 'Not connected'}</Tag> },
            { title: 'Enabled', render: (_, p) => <Switch size="small" checked={p.connected} disabled aria-label={`${p.label} enabled`} /> },
          ]} />
        </Card>
        <Card className="span-6" title="Cities" sub="Delivery locations observed per city" footer={<Prov>Config</Prov>}>
          <Table size="small" rowKey="id" pagination={false} dataSource={CITIES} columns={[
            { title: 'City', dataIndex: 'label' },
            { title: 'Dark stores', dataIndex: 'stores', align: 'right' },
            { title: 'Status', render: (_, c) => <Tag bordered={false} color={c.connected ? 'success' : 'default'}>{c.connected ? 'Observed' : 'Not observed yet'}</Tag> },
          ]} />
        </Card>
        <Card className="span-6" title="Capture schedule" sub="Three captures a day per platform and city" footer={<Prov>Config</Prov>}>
          <div style={{ display: 'grid', gap: 10 }}>
            {CAPTURE_SLOTS_UTC.map((t, i) => (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
                <span>Slot {i + 1}</span><b className="tnum">{ist(t)} IST <span className="muted" style={{ fontWeight: 400 }}>({t} UTC)</span></b>
              </div>
            ))}
            <span className="muted" style={{ fontSize: 12.5 }}>Units sold are estimated from the stock change between two consecutive captures of the same listing.</span>
          </div>
        </Card>
        <Card className="span-6" title="Governance" sub="Roles and rules for this workspace">
          {['Estimates are always labelled', 'Sample data is marked until a feed is connected', 'Recommendations are suggestions — nothing is submitted to a platform', 'Times are stored in UTC and shown in IST'].map((t) => (
            <div key={t} style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)', fontSize: 13.5 }}>{t}</div>
          ))}
        </Card>
      </div>
    </>
  );
}
