'use client';

import { useMemo } from 'react';
import { Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { CommentOutlined, RedoOutlined, SmileOutlined, StarOutlined, TeamOutlined, WarningOutlined } from '@ant-design/icons';
import { BarChart, ColumnChart, LineChart } from '@/components/charts';
import { Card, Kpi, Prov, fmtNum } from '@/components/ui';
import { platformLabel } from '@/lib/config';
import { dashB } from '@/lib/api.dashboardB';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { Gate, linesOf } from './partsB';

export default function CustomerVoiceTab() {
  const { platforms } = useFilters();
  const d = useDataset();
  const lines = useMemo(() => linesOf(d.latest), [d.latest]);
  const q = useQuery({ queryKey: ['dashB', 'voice', platforms, lines], queryFn: () => dashB.voice(platforms, lines), enabled: !d.isLoading });
  const v = q.data;
  const sample = <Prov kind="sample">Sample data</Prov>;

  const stars = useMemo(() => (v?.stars ?? []).map((s) => ({ ...s, platform: platformLabel(s.platform) })), [v]);
  const repeat = useMemo(() => (v?.repeat ?? []).map((s) => ({ ...s, platform: platformLabel(s.platform) })), [v]);
  const themes = useMemo(() => (v?.themes ?? []).map((t) => ({ ...t, kind: t.kind === 'positive' ? 'Positive' : 'Negative' })), [v]);

  return (
    <Gate loading={d.isLoading || q.isLoading} error={d.isError || q.isError} onRetry={() => { d.refetch(); q.refetch(); }} empty={!v || !d.latest.length}>
      {v && (
        <div className="bento">
          <Kpi className="span-4" label="Average rating" value={`${v.mean.toFixed(2)} ★`} icon={<StarOutlined />} note="listing rating, all platforms" />
          <Kpi className="span-4" label="Reviews behind those ratings" value={fmtNum(v.reviews)} icon={<CommentOutlined />} note="published counts" />
          <Kpi className="span-4" label="Positive sentiment" value={`${v.kpis.positive}%`} icon={<SmileOutlined />} note="of classified review text" />
          <Kpi className="span-4" label="Repeat rate · 90 d" value={`${v.kpis.repeat90}%`} icon={<RedoOutlined />} note="platform buyer cohorts" />
          <Kpi className="span-4" label="New-to-brand · 4 wk" value={fmtNum(v.kpis.newToBrand)} icon={<TeamOutlined />} note="orders" />
          <Kpi className="span-4" label="Quality escalations" value={v.kpis.escalations} icon={<WarningOutlined />} note="open, 2 packaging" />

          <Card className="span-4" title="Ratings" sub="Listing ratings across platforms" footer={sample}>
            <ColumnChart data={stars} x="star" y="count" color="platform" stack height={260} />
          </Card>
          <Card className="span-4" title="Review themes" sub="Classified themes, standing in for review text" footer={sample}>
            <BarChart data={themes} x="theme" y="pct" color="kind" stack height={260} formatter={(n) => `${n}%`} />
          </Card>
          <Card className="span-4" title="Trial and repeat" sub="Share of first-time buyers still buying, by week" footer={sample}>
            <LineChart data={repeat} x="week" y="pct" color="platform" height={260} formatter={(n) => `${n}%`} />
          </Card>
          <Card className="span-12" title="Rating by product line" sub="Listing ratings by line; the product lines come from the live capture" footer={sample}
            >
            <Table size="small" rowKey="line" pagination={false} dataSource={v.byLine} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Product line', dataIndex: 'line', render: (l: string) => <b>{l}</b> },
                { title: 'Rating', dataIndex: 'rating', align: 'right', sorter: (a, b) => a.rating - b.rating, render: (r: number) => `${r.toFixed(2)} ★` },
                { title: 'Rated listings', dataIndex: 'ratedListings', align: 'right' },
                { title: 'Reviews behind it', dataIndex: 'reviews', align: 'right', defaultSortOrder: 'descend', sorter: (a, b) => a.reviews - b.reviews, render: (n: number) => fmtNum(n) },
                { title: 'Under 4.28★', dataIndex: 'under', align: 'right', render: (n: number) => (n ? <Tag color="warning" bordered={false}>{n}</Tag> : <span className="muted">0</span>) },
              ]} />
          </Card>
        </div>
      )}
    </Gate>
  );
}
