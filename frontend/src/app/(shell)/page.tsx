'use client';

import { Button, List, Segmented, Table, Tag } from 'antd';
import { CheckCircleFilled, DollarOutlined, FireOutlined, MessageOutlined, ThunderboltFilled } from '@ant-design/icons';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ColumnChart, LineChart } from '@/components/charts';
import { Card, CityTag, ErrorState, EstimateTag, Kpi, PageHead, Prov, Section, SkeletonBlock, fmtDay, fmtIST, fmtINR, fmtNum } from '@/components/ui';
import { lastDays, useFilters } from '@/hooks/useFilters';
import { api } from '@/lib/api';

export default function Overview() {
  const { city, range, query } = useFilters();
  const [metric, setMetric] = useState<'units' | 'revenue'>('units');
  const listings = useQuery({ queryKey: ['listings', city], queryFn: () => api.listings(city) });
  const avail = useQuery({ queryKey: ['availability', city], queryFn: () => api.availability(city) });
  const sell = useQuery({ queryKey: ['sellout', city], queryFn: () => api.sellout(city) });
  const signals = useQuery({ queryKey: ['signals'], queryFn: api.signals });
  const compare = useQuery({ queryKey: ['compare'], queryFn: api.compare });
  const runs = useQuery({ queryKey: ['runs'], queryFn: api.runs });
  const reports = useQuery({ queryKey: ['reports'], queryFn: api.reports });
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta });
  const recs = useQuery({ queryKey: ['recs'], queryFn: api.recommendations });

  if (listings.isError) return <ErrorState onRetry={() => listings.refetch()} />;

  const ls = listings.data ?? [];
  const listed = ls.filter((l) => l.availability !== 'not_listed');
  const buyable = listed.length ? Math.round((ls.filter((l) => l.availability === 'available').length / listed.length) * 100) : 0;
  const avgDisc = listed.length ? Math.round((listed.reduce((a, l) => a + l.discount_pct, 0) / listed.length) * 10) / 10 : 0;
  const units7 = ls.reduce((a, l) => a + l.est_units_7d, 0);
  const sellRows = sell.data ? lastDays(metric === 'units' ? sell.data.units : sell.data.revenue, range) : [];
  const top = signals.data?.slice(0, 4) ?? [];

  return (
    <>
      <PageHead
        title="Hey, here's the shelf 👋"
        sub={`Blinkit · ${city === 'Both' ? 'Delhi + Mumbai' : city} · ${new Date('2026-10-07').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <>
            <Link href={`/reports${query}`}><Button>Open Monday brief</Button></Link>
            <Link href={`/assistant${query}`}><Button type="primary" icon={<MessageOutlined />}>Ask the Assistant</Button></Link>
          </>
        }
      />

      <div className="bento">
        <Kpi className="span-3" hero label="Buyable now" icon={<CheckCircleFilled />} value={listings.isLoading ? '—' : `${buyable}%`} delta="1.2 pts" up note="vs yesterday" />
        <Kpi className="span-3" label="Avg discount" icon={<DollarOutlined />} value={listings.isLoading ? '—' : `${avgDisc}%`} delta="0.6 pts" up={false} note="vs 7-day avg" />
        <Kpi className="span-3" label="Est. units · 7 d" icon={<FireOutlined />} value={listings.isLoading ? '—' : fmtNum(units7)} delta="12%" up note="estimate" />
        <Kpi className="span-3" label="Open signals" icon={<ThunderboltFilled />} value={signals.data?.length ?? '—'} note={`${signals.data?.filter((s) => s.severity === 'critical' || s.severity === 'high').length ?? 0} need attention`} />
        <div className="span-12"><Prov>Shelf capture · {meta.data ? fmtIST(meta.data.captured_at) : '…'}</Prov></div>

        <Section title="Needs a decision" link={<Link href={`/signals${query}`} className="sec">All signals →</Link>} />
        <Card className="span-8" title="Priority signals" sub="Ranked by expected contribution, urgency and confidence" actions={<Link href={`/signals${query}`}><Button size="small">All {signals.data?.length ?? ''} open</Button></Link>}>
          {signals.isLoading ? <SkeletonBlock h={260} /> : top.map((s) => (
            <Link href={`/signals${query}#${s.id}`} key={s.id} className="feed-item" style={{ display: 'flex' }}>
              <span className={`sev ${s.severity}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{s.title}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{s.detail}</div>
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <CityTag city={s.city} />
                  <Tag bordered={false}>{s.metric}: <b>{s.delta}</b></Tag>
                  <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{s.confidence}% confidence</span>
                </div>
              </div>
            </Link>
          ))}
        </Card>
        <div className="span-4" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card title="Waiting on you" sub="Recommendations prepared by the engine" footer={<Link href={`/recommendations${query}`} className="sec">Open recommendations →</Link>}>
            <List
              size="small"
              dataSource={recs.data?.filter((r) => r.status !== 'done').slice(0, 3) ?? []}
              renderItem={(r) => (
                <List.Item style={{ padding: '10px 0', border: 0 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.action}</div>
                    <div className="muted" style={{ fontSize: 12 }}>Priority {r.priority} · {r.type === 'paid' ? 'Paid' : 'Free'}</div>
                  </div>
                </List.Item>
              )}
            />
          </Card>
          <Card title="Alert rules" sub="Evaluated on every capture">
            {['Out of stock for 3+ captures', 'Keyword rank drops by 3+', 'City price gap above 5%'].map((n, i) => (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13.5 }}>
                <span>{n}</span>
                <Tag color={i === 0 ? 'red' : 'default'} bordered={false}>{[2, 1, 1][i]} match{i ? '' : 'es'}</Tag>
              </div>
            ))}
          </Card>
        </div>

        <Section title="Where we stand today" link={<Link href={`/dashboards${query}`} className="sec">Open the dashboards →</Link>} />
        <Card className="span-7" title="Buyable availability" sub="Share of priority products you can actually buy, per capture day" footer={<Prov>Shelf capture · last {range} days</Prov>}>
          {avail.isLoading ? <SkeletonBlock /> : <LineChart yMin={70} yMax={100} data={lastDays(avail.data!.trend, range).map((p) => ({ ...p, date: fmtDay(p.date) }))} x="date" y="value" color="city" byCity formatter={(v) => `${v}%`} />}
        </Card>
        <Card className="span-5" title="Cities" sub="Where we stand in each city" footer={<Prov>Dark-store directory + shelf capture</Prov>}>
          <Table
            size="small"
            pagination={false}
            rowKey="city"
            loading={compare.isLoading}
            dataSource={compare.data}
            columns={[
              { title: 'City', dataIndex: 'city', render: (c) => <CityTag city={c} /> },
              { title: 'Stores', dataIndex: 'stores', align: 'right' },
              { title: 'Buyable', dataIndex: 'availability_pct', align: 'right', render: (v) => `${v}%` },
              { title: 'Avg price', dataIndex: 'avg_price', align: 'right', render: fmtINR },
              { title: 'Search share', dataIndex: 'sos_brand', align: 'right', render: (v) => `${v}%` },
            ]}
          />
        </Card>

        <Section title="Trading" />
        <Card
          className="span-8"
          title={<span>Sell-out by city <EstimateTag /></span>}
          sub={`Daily ${metric === 'units' ? 'units' : 'revenue'}, last ${range} days — estimated from stock changes, restocks excluded`}
          actions={<Segmented size="small" value={metric} onChange={(v) => setMetric(v as 'units' | 'revenue')} options={[{ label: 'Units', value: 'units' }, { label: 'Revenue', value: 'revenue' }]} />}
        >
          {sell.isLoading ? <SkeletonBlock /> : <ColumnChart data={sellRows.map((p) => ({ ...p, date: fmtDay(p.date) }))} x="date" y="value" color="city" byCity formatter={(v) => (metric === 'revenue' ? `₹${Math.round(v / 1000)}k` : String(v))} />}
        </Card>
        <Card className="span-4" title="Running for you" sub="Capture runs in the last 24 hours" footer={<Link href={`/data${query}`} className="sec">Data & datasets →</Link>}>
          {runs.data?.slice(0, 5).map((r) => (
            <div key={r.run_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: r.status === 'ok' ? 'var(--pb-mint)' : 'var(--pb-coral)' }} />
              <span style={{ flex: 1, fontSize: 13.5 }}>{r.city} · {fmtIST(r.started)}</span>
              <Tag bordered={false} color={r.status === 'ok' ? 'success' : 'error'}>{r.status}</Tag>
            </div>
          ))}
        </Card>

        <Section title="Ready to read" link={<Link href={`/reports${query}`} className="sec">Reports Center →</Link>} />
        {reports.data?.slice(0, 3).map((r) => (
          <Card key={r.id} className="span-4" title={r.title} sub={`${r.kind} · ${r.pages} page${r.pages > 1 ? 's' : ''}`}>
            <p className="sec" style={{ margin: 0, fontSize: 13.5 }}>{r.summary}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
