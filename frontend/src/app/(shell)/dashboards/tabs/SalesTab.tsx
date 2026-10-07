'use client';

import { useMemo } from 'react';
import { Table } from 'antd';
import { DollarOutlined, ShoppingOutlined, TagOutlined, TrophyOutlined } from '@ant-design/icons';
import { BarChart, LineChart } from '@/components/charts';
import { Card, EmptyState, EstimateTag, Kpi, Prov, fmtDay, fmtINR, fmtNum } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { platformLabel } from '@/lib/config';
import { availabilityStats, avg, dailySellout, discountPct, groupSum, round1, sum } from '@/lib/metrics';
import { listed, salesBridge, sellIn, skuKey } from '@/mock/dashboard-a';
import { Bridge, TabGate } from './aShared';

export default function SalesTab() {
  const d = useDataset();
  const { platforms } = useFilters();

  const v = useMemo(() => {
    const revenue = sum(d.intervals.map((i) => i.revenue));
    const units = sum(d.intervals.map((i) => i.units));
    const byLine = Object.entries(groupSum(d.intervals, (r) => r.line, (r) => r.revenue)).map(([line, revenue]) => ({ line, revenue: Math.round(revenue) })).sort((a, b) => b.revenue - a.revenue);
    const dayUnits = dailySellout(d.intervals, () => 'all').map((r) => ({ date: r.date, units: r.units }));
    const plats = platforms.filter((p) => d.latest.some((r) => r.platform === p));
    const table = plats.map((p) => {
      const iv = d.intervals.filter((i) => i.platform === p);
      const rows = d.latest.filter((r) => r.platform === p);
      const lr = listed(rows).filter((r) => r.mrp !== null && r.selling_price !== null);
      const rev = sum(iv.map((i) => i.revenue));
      return { platform: p, revenue: Math.round(rev), units: sum(iv.map((i) => i.units)), share: revenue ? round1((rev / revenue) * 100) : 0, buyable: availabilityStats(rows).buyablePct, disc: round1(avg(lr.map((r) => discountPct(r.mrp, r.selling_price)))), skus: new Set(listed(rows).map(skuKey)).size };
    });
    return { revenue, units, byLine, dayUnits, table };
  }, [d.intervals, d.latest, platforms]);

  const flow = useMemo(
    () => [...v.dayUnits.map((r) => ({ date: fmtDay(r.date), series: 'Sell-out (est.)', units: r.units })), ...sellIn(v.dayUnits).map((r) => ({ date: fmtDay(r.date), series: 'Sell-in (sample)', units: r.units }))],
    [v.dayUnits],
  );
  const bridge = useMemo(() => salesBridge(v.revenue), [v.revenue]);

  return (
    <TabGate d={d}>
      <div className="bento">
        <Kpi className="span-3" hero label="Sell-out revenue (est.)" value={fmtINR(Math.round(v.revenue))} icon={<DollarOutlined />} note="lower bound" />
        <Kpi className="span-3" label="Units sold (est.)" value={fmtNum(v.units)} icon={<ShoppingOutlined />} note="stock drops between captures" />
        <Kpi className="span-3" label="Revenue per unit" value={fmtINR(v.units ? round1(v.revenue / v.units) : 0)} icon={<TagOutlined />} note="realised price" />
        <Kpi className="span-3" label="Top product line" value={v.byLine[0]?.line ?? '—'} icon={<TrophyOutlined />} note={v.byLine[0] ? fmtINR(v.byLine[0].revenue) : undefined} />

        <Card className="span-7" title="Sales driver bridge" sub="Change vs prior period, decomposed" footer={<><Prov kind="sample">Sample decomposition · anchored to estimated revenue</Prov></>}>
          {v.revenue ? <Bridge steps={bridge} fmt={(n) => fmtINR(Math.round(n))} /> : <EmptyState text="No sell-out estimated in this range." />}
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Distribution = listed stores × SKUs · Velocity = units per available store-day · Price = realised price effect · Mix = product-line mix.</div>
        </Card>

        <Card className="span-5" title="Revenue by product line" sub="Estimated, selected range" footer={<><EstimateTag /><Prov>Shelf capture</Prov></>}>
          {v.byLine.length ? <BarChart data={v.byLine} x="line" y="revenue" color="line" height={280} formatter={(n) => `₹${fmtNum(Math.round(n))}`} /> : <EmptyState />}
        </Card>

        <Card className="span-6" title="Sell-in vs sell-out" sub="Units shipped to platforms vs consumer units" footer={<><EstimateTag /><Prov kind="sample">Sell-in is sample data</Prov></>}>
          {flow.length ? <LineChart data={flow} x="date" y="units" color="series" height={280} /> : <EmptyState />}
        </Card>

        <Card className="span-6" title="Platform scorecard" sub="Selected range" footer={<><EstimateTag /><Prov>Shelf capture</Prov></>}>
          <Table size="small" pagination={false} rowKey="platform" dataSource={v.table} scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Platform', dataIndex: 'platform', render: platformLabel },
              { title: 'Revenue (est.)', dataIndex: 'revenue', align: 'right', sorter: (a, b) => a.revenue - b.revenue, render: (n: number) => fmtINR(n) },
              { title: 'Units (est.)', dataIndex: 'units', align: 'right', sorter: (a, b) => a.units - b.units, render: fmtNum },
              { title: 'Share', dataIndex: 'share', align: 'right', render: (n: number) => `${n}%` },
              { title: 'Buyable', dataIndex: 'buyable', align: 'right', render: (n: number) => `${n}%` },
              { title: 'Avg discount', dataIndex: 'disc', align: 'right', render: (n: number) => `${n}%` },
              { title: 'SKUs', dataIndex: 'skus', align: 'right' },
            ]} />
        </Card>
      </div>
    </TabGate>
  );
}
