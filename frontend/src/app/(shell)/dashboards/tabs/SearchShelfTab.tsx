'use client';

import { useMemo, useState } from 'react';
import { Drawer, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AimOutlined, EyeInvisibleOutlined, PercentageOutlined, TrophyOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { BarChart, ColumnChart } from '@/components/charts';
import { Card, CityTag, Kpi, PlatformTag, Prov } from '@/components/ui';
import { platformLabel } from '@/lib/config';
import { dashB } from '@/lib/api.dashboardB';
import { useFilters } from '@/hooks/useFilters';
import { RANK_BANDS, type KeywordType, type ShelfRow } from '@/mock/dashboard-b';
import { Gate, pctOf } from './partsB';

const TYPE_LABEL: Record<KeywordType, string> = { category: 'Category', occasion: 'Occasion', competitor_brand: 'Competitor brand', brand_self: 'Own brand' };
const band = (r: number) => (r <= 3 ? RANK_BANDS[0] : r <= 10 ? RANK_BANDS[1] : r <= 20 ? RANK_BANDS[2] : RANK_BANDS[3]);
const rankColor = (r: number | null) => (r === null ? 'default' : r <= 3 ? 'success' : r <= 10 ? 'processing' : r <= 20 ? 'warning' : 'error');

interface KwAgg { keyword: string; type: KeywordType; pb: number; total: number; share: number; shelves: number; absent: number }

export default function SearchShelfTab() {
  const { platforms, cities } = useFilters();
  const q = useQuery({ queryKey: ['dashB', 'search', platforms, cities], queryFn: () => dashB.search(platforms, cities) });
  const [kw, setKw] = useState<string | null>(null);
  const rows = useMemo<ShelfRow[]>(() => q.data ?? [], [q.data]);
  const cat = useMemo(() => rows.filter((r) => r.type === 'category' || r.type === 'occasion'), [rows]);

  const m = useMemo(() => {
    const sum = (xs: ShelfRow[], f: (r: ShelfRow) => number) => xs.reduce((a, r) => a + f(r), 0);
    const catShare = pctOf(sum(cat, (r) => r.pb), sum(cat, (r) => r.total));
    const own = rows.filter((r) => r.type === 'brand_self');
    const ownShare = pctOf(sum(own, (r) => r.pb), sum(own, (r) => r.total));
    const absent = cat.filter((r) => r.pb === 0);
    const ranked = cat.filter((r) => r.bestRank !== null);
    const top10 = ranked.filter((r) => (r.bestRank as number) <= 10).length;

    // who owns the first ten slots, per category keyword
    const kwList = Array.from(new Set(cat.map((r) => r.keyword)));
    const brandTotals: Record<string, number> = {};
    cat.forEach((r) => Object.entries(r.top10).forEach(([b, n]) => (brandTotals[b] = (brandTotals[b] ?? 0) + n)));
    const topBrands = Object.entries(brandTotals).filter(([b]) => b !== 'Paper Boat' && b !== 'Brand not resolved').sort((a, b) => b[1] - a[1]).slice(0, 5).map(([b]) => b);
    const owners: { keyword: string; brand: string; share: number }[] = [];
    kwList.forEach((k) => {
      const rs = cat.filter((r) => r.keyword === k);
      const tot: Record<string, number> = {};
      rs.forEach((r) => Object.entries(r.top10).forEach(([b, n]) => { const g = b === 'Paper Boat' || b === 'Brand not resolved' || topBrands.includes(b) ? b : 'Other brands'; tot[g] = (tot[g] ?? 0) + n; }));
      const all = Object.values(tot).reduce((a, b) => a + b, 0);
      Object.entries(tot).forEach(([brand, n]) => owners.push({ keyword: k, brand, share: pctOf(n, all) }));
    });

    // rank bands per platform
    const bands: { platform: string; band: string; count: number }[] = [];
    platforms.forEach((p) => RANK_BANDS.forEach((b) => bands.push({ platform: platformLabel(p), band: b, count: ranked.filter((r) => r.platform === p && band(r.bestRank as number) === b).length })));

    // best rank grid keyword x platform
    const grid = kwList.map((k) => {
      const rec: Record<string, string | number | null> = { keyword: k };
      platforms.forEach((p) => {
        const rs = cat.filter((r) => r.keyword === k && r.platform === p && r.bestRank !== null);
        rec[p] = rs.length ? Math.min(...rs.map((r) => r.bestRank as number)) : null;
      });
      return rec;
    });

    // rivals above PB
    const rivalMap: Record<string, number> = {};
    const shelvesWithPb = ranked.filter((r) => r.above.length);
    shelvesWithPb.forEach((r) => new Set(r.above).forEach((b) => (rivalMap[b] = (rivalMap[b] ?? 0) + 1)));
    const rivals = Object.entries(rivalMap).map(([brand, shelves]) => ({ brand, shelves, pct: pctOf(shelves, shelvesWithPb.length) })).sort((a, b) => b.shelves - a.shelves).slice(0, 8);

    // share of search by keyword
    const aggMap = new Map<string, KwAgg>();
    rows.forEach((r) => {
      const a = aggMap.get(r.keyword) ?? { keyword: r.keyword, type: r.type, pb: 0, total: 0, share: 0, shelves: 0, absent: 0 };
      a.pb += r.pb; a.total += r.total; a.shelves += 1; a.absent += r.pb === 0 ? 1 : 0;
      aggMap.set(r.keyword, a);
    });
    const kwAgg = Array.from(aggMap.values()).map((a) => ({ ...a, share: pctOf(a.pb, a.total) })).sort((a, b) => b.total - a.total);
    return { catShare, ownShare, absent, ranked, top10, owners, bands, grid, rivals, kwAgg };
  }, [rows, cat, platforms]);

  const gridCols: ColumnsType<Record<string, string | number | null>> = [
    { title: 'Keyword', dataIndex: 'keyword', fixed: 'left', render: (v: string) => <b>{v}</b> },
    ...platforms.map((p) => ({ title: platformLabel(p), dataIndex: p, align: 'center' as const, render: (v: number | null) => (v === null ? <span className="muted">—</span> : <Tag color={rankColor(v)} bordered={false}>#{v}</Tag>) })),
  ];
  const kwCols: ColumnsType<KwAgg> = [
    { title: 'Keyword', dataIndex: 'keyword', render: (v: string) => <b>{v}</b>, sorter: (a, b) => a.keyword.localeCompare(b.keyword) },
    { title: 'Type', dataIndex: 'type', render: (t: KeywordType) => <Tag bordered={false}>{TYPE_LABEL[t]}</Tag> },
    { title: 'Paper Boat results', dataIndex: 'pb', align: 'right', sorter: (a, b) => a.pb - b.pb },
    { title: 'Total results', dataIndex: 'total', align: 'right', sorter: (a, b) => a.total - b.total, defaultSortOrder: 'descend' },
    { title: 'Share of search', dataIndex: 'share', align: 'right', sorter: (a, b) => a.share - b.share, render: (v: number) => <b>{v}%</b> },
    { title: 'Shelves', dataIndex: 'shelves', align: 'right' },
    { title: 'No Paper Boat', dataIndex: 'absent', align: 'right', render: (v: number) => (v ? <Tag color="error" bordered={false}>{v}</Tag> : <span className="muted">0</span>) },
  ];
  const shelfCols: ColumnsType<ShelfRow> = [
    { title: 'Platform', dataIndex: 'platform', render: (p: string) => <PlatformTag id={p} /> },
    { title: 'City', dataIndex: 'city', render: (c: string) => <CityTag city={c} /> },
    { title: 'Paper Boat', dataIndex: 'pb', align: 'right' },
    { title: 'Results', dataIndex: 'total', align: 'right' },
    { title: 'Share', dataIndex: 'share', align: 'right', render: (v: number) => `${v}%` },
    { title: 'Best rank', dataIndex: 'bestRank', align: 'right', render: (v: number | null) => (v === null ? <Tag bordered={false}>Absent</Tag> : <Tag color={rankColor(v)} bordered={false}>#{v}</Tag>) },
  ];
  const absentCols: ColumnsType<ShelfRow> = [
    { title: 'Keyword', dataIndex: 'keyword', render: (v: string) => <b>{v}</b> },
    { title: 'Platform', dataIndex: 'platform', render: (p: string) => <PlatformTag id={p} /> },
    { title: 'City', dataIndex: 'city', render: (c: string) => <CityTag city={c} /> },
    { title: 'Results returned', dataIndex: 'total', align: 'right', sorter: (a, b) => a.total - b.total, defaultSortOrder: 'descend' },
  ];

  const sample = <Prov kind="sample">Sample data</Prov>;
  return (
    <Gate loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()} empty={!rows.length}>
      <div className="bento">
        <Kpi className="span-3" label="Share of search · category" value={`${m.catShare}%`} icon={<PercentageOutlined />} note="of category and occasion results" />
        <Kpi className="span-3" label="Own-brand queries" value={`${m.ownShare}%`} icon={<AimOutlined />} note="Paper Boat on “paper boat …” searches" />
        <Kpi className="span-3" label="Shelves with no Paper Boat" value={`${m.absent.length}`} icon={<EyeInvisibleOutlined />} note={`of ${cat.length} category shelves`} />
        <Kpi className="span-3" label="Shelves ranked in top 10" value={`${pctOf(m.top10, m.ranked.length)}%`} icon={<TrophyOutlined />} note={`${m.top10} of ${m.ranked.length} shelves`} />

        <Card className="span-7" title="Who owns the first ten slots" sub="Share of the top-10 results on each category keyword" footer={<>“Brand not resolved” = listing whose brand the feed does not name. {sample}</>}>
          <BarChart data={m.owners} x="keyword" y="share" color="brand" stack height={340} formatter={(v) => `${v}%`} />
        </Card>
        <Card className="span-5" title="Where Paper Boat lands" sub="Organic rank of Paper Boat results on category keywords, by platform" footer={sample}>
          <ColumnChart data={m.bands} x="platform" y="count" color="band" stack height={340} />
        </Card>
        <Card className="span-7" title="Best organic rank" sub="Keyword × platform, best position Paper Boat reached in any city" footer={sample}>
          <Table size="small" pagination={false} rowKey="keyword" columns={gridCols} dataSource={m.grid} scroll={{ x: 'max-content' }} />
        </Card>
        <Card className="span-5" title="Brands standing above Paper Boat" sub="On the shelves where Paper Boat does appear" footer={sample}>
          <Table size="small" pagination={false} rowKey="brand" dataSource={m.rivals} columns={[
            { title: 'Brand', dataIndex: 'brand', render: (v: string) => <b>{v}</b> },
            { title: 'Shelves above', dataIndex: 'shelves', align: 'right' },
            { title: '% of shelves', dataIndex: 'pct', align: 'right', render: (v: number) => `${v}%` },
          ]} />
        </Card>
        <Card className="span-12" title="Share of search by keyword" sub="All tracked keywords across active cities and platforms · click a keyword for its shelves" footer={sample}>
          <Table<KwAgg> size="small" rowKey="keyword" pagination={false} columns={kwCols} dataSource={m.kwAgg} scroll={{ x: 'max-content' }}
            onRow={(r) => ({ onClick: () => setKw(r.keyword), style: { cursor: 'pointer' }, tabIndex: 0, onKeyDown: (e) => e.key === 'Enter' && setKw(r.keyword) })} />
        </Card>
        <Card className="span-12" title="Shelves with no Paper Boat result" sub="Category and occasion searches that returned results, none of them Paper Boat" footer={sample}>
          <Table<ShelfRow> size="small" rowKey={(r) => `${r.keyword}|${r.platform}|${r.city}`} columns={absentCols} dataSource={m.absent} pagination={{ pageSize: 8, hideOnSinglePage: true }} locale={{ emptyText: 'Paper Boat appears on every searched shelf.' }} scroll={{ x: 'max-content' }} />
        </Card>
      </div>
      <Drawer title={kw ? `“${kw}” · share of search` : ''} open={!!kw} onClose={() => setKw(null)} width={560}>
        <p className="muted">One row per city and platform shelf.</p>
        <Table<ShelfRow> size="small" rowKey={(r) => `${r.platform}|${r.city}`} pagination={false} columns={shelfCols} dataSource={rows.filter((r) => r.keyword === kw)} scroll={{ x: 'max-content' }} />
      </Drawer>
    </Gate>
  );
}
