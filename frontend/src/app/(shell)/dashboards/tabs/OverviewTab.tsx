'use client';

import { useMemo, useState } from 'react';
import { Button, Segmented, Table } from 'antd';
import { DollarOutlined, ShoppingOutlined, CheckCircleOutlined, PercentageOutlined, AppstoreOutlined, SearchOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { AreaChart, BarChart, ColumnChart } from '@/components/charts';
import { Card, CityTag, EmptyState, EstimateTag, Heat, Kpi, Prov, fmtDay, fmtINR, fmtNum } from '@/components/ui';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { platformLabel } from '@/lib/config';
import { availabilityStats, avg, dailySellout, discountPct, groupSum, round1, sum } from '@/lib/metrics';
import { absentShelves, aiInsights, listed, median, per100ml, rivalBrands, rivalDisc, searchShare, searchResults, skuKey } from '@/mock/dashboard-a';
import { TabGate } from './aShared';

export default function OverviewTab() {
  const d = useDataset();
  const { platforms, cities, query } = useFilters();
  const [mode, setMode] = useState<'revenue' | 'units'>('revenue');

  const v = useMemo(() => {
    const rows = listed(d.latest);
    const plats = platforms.filter((p) => d.latest.some((r) => r.platform === p));
    const stats = availabilityStats(d.latest);
    const priced = rows.filter((r) => r.mrp !== null && r.selling_price !== null);
    const avgDisc = round1(avg(priced.map((r) => discountPct(r.mrp, r.selling_price))));
    const revenue = sum(d.intervals.map((i) => i.revenue));
    const units = sum(d.intervals.map((i) => i.units));
    const daily = dailySellout(d.intervals, (r) => platformLabel(r.platform));
    const byLine = groupSum(d.intervals, (r) => r.line, (r) => r.revenue);
    const topLine = Object.entries(byLine).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const byCity = groupSum(d.intervals, (r) => r.city, (r) => r.revenue);
    const topCity = Object.entries(byCity).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const skus = new Set(rows.map(skuKey)).size;
    // a SKU listed in one city but not in another
    const cellsPerSku = new Map<string, Set<string>>();
    rows.forEach((r) => (cellsPerSku.get(skuKey(r)) ?? cellsPerSku.set(skuKey(r), new Set()).get(skuKey(r))!).add(`${r.platform}|${r.city}`));
    const cellTotal = new Set(rows.map((r) => `${r.platform}|${r.city}`)).size;
    const gapSkus = Array.from(cellsPerSku.values()).filter((s) => s.size < cellTotal).length;
    const per100: number[] = rows.map((r) => per100ml(r.selling_price, r.pack_size)).filter((x): x is number => x !== null);
    return { rows, plats, stats, avgDisc, revenue, units, daily, topLine, topCity, skus, gapSkus, pbPer100: round1(median(per100)), perN: per100.length, priced };
  }, [d.latest, d.intervals, platforms]);

  const sellData = v.daily.map((r) => ({ date: fmtDay(r.date), series: r.series, value: mode === 'revenue' ? r.revenue : r.units }));

  const heat = useMemo(
    () => v.plats.map((p) => ({ platform: p, cells: cities.map((c) => ({ city: c, st: availabilityStats(d.latest.filter((r) => r.platform === p && r.city === c)) })) })),
    [v.plats, cities, d.latest],
  );

  const sosData = v.plats.map((p) => ({ platform: platformLabel(p), share: searchShare(p) }));
  const discData = v.plats.flatMap((p) => {
    const pb = v.priced.filter((r) => r.platform === p);
    const rivals = rivalBrands().map((b) => rivalDisc(b.brand, p));
    return [
      { platform: platformLabel(p), series: 'Paper Boat', disc: round1(avg(pb.map((r) => discountPct(r.mrp, r.selling_price)))) },
      { platform: platformLabel(p), series: 'Rivals (sample)', disc: round1(avg(rivals)) },
    ];
  });
  const ladder = [{ brand: 'Paper Boat', per100: v.pbPer100 }, ...rivalBrands().map((b) => ({ brand: b.brand, per100: b.per100 }))].sort((a, b) => b.per100 - a.per100);
  const absent = useMemo(() => absentShelves(v.plats, cities), [v.plats, cities]);
  const insights = aiInsights({ buyablePct: v.stats.buyablePct, oos: v.stats.out_of_stock, topCity: v.topCity, topLine: v.topLine, avgDisc: v.avgDisc, gapCity: v.gapSkus ? cities[cities.length - 1] ?? null : null });
  const sos = v.plats.length ? round1(avg(v.plats.map(searchShare))) : 0;

  return (
    <TabGate d={d}>
      <div className="bento">
        <Kpi className="span-3" hero label="Sell-out revenue (est.)" value={fmtINR(Math.round(v.revenue))} icon={<DollarOutlined />} note={`${d.captures.length} captures`} />
        <Kpi className="span-3" label="Units sold (est.)" value={fmtNum(v.units)} icon={<ShoppingOutlined />} note="lower-bound estimate" />
        <Kpi className="span-3" label="Buyable availability" value={`${v.stats.buyablePct}%`} icon={<CheckCircleOutlined />} note={`${v.stats.out_of_stock} out of stock · ${v.stats.not_listed} not listed`} />
        <Kpi className="span-3" label="Average discount" value={`${v.avgDisc}%`} icon={<PercentageOutlined />} note={`${v.skus} SKUs listed`} />
        <Kpi className="span-4" label="Share of search (sample)" value={`${sos}%`} icon={<SearchOutlined />} note="category keywords" />
        <Kpi className="span-4" label="Median ₹ per 100 ml" value={fmtINR(v.pbPer100)} icon={<AppstoreOutlined />} note={`from ${v.perN} listings`} />
        <Kpi className="span-4" label="SKUs with a city gap" value={v.gapSkus} icon={<AppstoreOutlined />} note="listed elsewhere, not here" />

        <Card className="span-8" title="Sell-out by platform" sub={`Daily ${mode}, ${d.captures.length} captures in range`} actions={<Segmented size="small" value={mode} onChange={(x) => setMode(x as 'revenue' | 'units')} options={[{ label: 'Units', value: 'units' }, { label: 'Revenue', value: 'revenue' }]} />} footer={<><EstimateTag /><Prov>Shelf capture · stock change between captures</Prov></>}>
          {sellData.length ? <AreaChart data={sellData} x="date" y="value" color="series" stack height={280} formatter={mode === 'revenue' ? (n) => `₹${fmtNum(Math.round(n))}` : fmtNum} /> : <EmptyState text="Not enough captures to estimate sell-out." />}
        </Card>

        <Card className="span-4" title="AI insights" sub="What the data says this week" actions={<Prov kind="sample">AI-generated</Prov>} footer={<Prov kind="sample">Sample text · figures from the capture</Prov>}>
          <div style={{ display: 'grid', gap: 12 }}>
            {insights.map((i) => (
              <div key={i.title} className="feed-item" style={{ display: 'block' }}>
                <b style={{ fontSize: 13.5 }}>{i.title}</b>
                <div className="muted" style={{ fontSize: 12.5, margin: '2px 0 6px' }}>{i.why}</div>
                <Link href={`/signals${query}`}><Button size="small">{i.actions[0]}</Button></Link>
              </div>
            ))}
          </div>
        </Card>

        <Card className="span-4" title="Share of search" sub="Category & occasion keywords, by platform" footer={<Prov kind="sample">Sample data</Prov>}>
          <ColumnChart data={sosData} x="platform" y="share" color="platform" height={240} formatter={(n) => `${n}%`} />
          <div className="muted" style={{ fontSize: 12 }}>{v.plats.map((p) => `${platformLabel(p)}: ${fmtNum(searchResults(p))} results`).join(' · ')}</div>
        </Card>

        <Card className="span-4" title="Buyable availability" sub="Platform × city, Paper Boat offers" footer={<Prov>Shelf capture · latest</Prov>}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4 }}>
              <thead><tr><th style={{ textAlign: 'left' }} className="muted">Platform</th>{cities.map((c) => <th key={c}><CityTag city={c} /></th>)}</tr></thead>
              <tbody>
                {heat.map((h) => (
                  <tr key={h.platform}>
                    <td>{platformLabel(h.platform)}</td>
                    {h.cells.map((c) => <td key={c.city}>{c.st.listed ? <Heat v={Math.round(c.st.buyablePct)} /> : <span className="muted">—</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Buyable share of listed products; out of stock and not listed are different states.</div>
        </Card>

        <Card className="span-4" title="Price position" sub="Average discount vs rival brands" footer={<><Prov>Paper Boat · shelf capture</Prov><Prov kind="sample">Rivals · sample</Prov></>}>
          <ColumnChart data={discData} x="platform" y="disc" color="series" height={240} formatter={(n) => `${n}%`} />
        </Card>

        <Card className="span-6" title="Value ladder" sub="Median ₹ per 100 ml on the shelf, by brand" footer={<><Prov>Paper Boat · computed from pack size on {v.perN} listings</Prov><Prov kind="sample">Rivals · sample</Prov></>}>
          <BarChart data={ladder} x="brand" y="per100" color="brand" height={300} formatter={(n) => `₹${n}`} />
        </Card>

        <Card className="span-6" title="Shelves with no Paper Boat result" sub="Category and occasion keywords · keyword × city × platform" footer={<Prov kind="sample">Sample data · search feed not connected</Prov>}>
          <Table size="small" pagination={{ pageSize: 6, hideOnSinglePage: true }} rowKey={(r) => `${r.keyword}|${r.city}|${r.platform}`} dataSource={absent} locale={{ emptyText: 'Paper Boat shows up on every shelf.' }}
            columns={[{ title: 'Keyword', dataIndex: 'keyword' }, { title: 'City', dataIndex: 'city', render: (c: string) => <CityTag city={c} /> }, { title: 'Platform', dataIndex: 'platform', render: platformLabel }, { title: 'Results', dataIndex: 'results', align: 'right' }]} />
          <div className="muted" style={{ fontSize: 12 }}>A shelf is one keyword searched in one city on one platform. Absent means results returned, none of them Paper Boat.</div>
        </Card>
      </div>
    </TabGate>
  );
}
