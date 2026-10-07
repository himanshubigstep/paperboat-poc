'use client';

import { useMemo, useState } from 'react';
import { Button, Segmented, Table, Tag, message } from 'antd';
import { AlertOutlined, CheckCircleOutlined, DollarOutlined, FundOutlined, SearchOutlined, ShoppingOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { AreaChart, BarChart } from '@/components/charts';
import { Card, CityTag, EmptyState, ErrorState, EstimateTag, Heat, Kpi, PageHead, Prov, Section, SevTag, SkeletonBlock, fmtDay, fmtINR, fmtNum } from '@/components/ui';
import { useFilters } from '@/hooks/useFilters';
import { useSignals } from '@/hooks/useSignals';
import { CITIES, platformLabel } from '@/lib/config';
import { availabilityStats, avg, dailySellout, discountPct, istDay, round1, sum } from '@/lib/metrics';
import { contentHealth, deliveryMinutes, listed, median, per100ml, rivalsMedianPer100, searchShare, skuKey } from '@/mock/dashboard-a';
import { APPROVALS, REPORTS, RUNS_24H, VALUE, WORKFLOWS, alertRules } from '@/mock/home';

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const dateLong = (day: string) => new Date(day + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const inrShort = (n: number) => (n >= 1e5 ? `₹${round1(n / 1e5)} L` : n >= 1e3 ? `₹${round1(n / 1e3)} K` : `₹${Math.round(n)}`);

export default function Home() {
  const d = useSignals();
  const { platforms, cities, query, scopeLabel } = useFilters();
  const [mode, setMode] = useState<'units' | 'revenue'>('units');
  const [done, setDone] = useState<Record<string, string>>({});

  const v = useMemo(() => {
    const rows = listed(d.latest);
    const plats = platforms.filter((p) => d.latest.some((r) => r.platform === p));
    const stats = availabilityStats(d.latest);
    const revenue = sum(d.intervals.map((i) => i.revenue));
    const units = sum(d.intervals.map((i) => i.units));
    const priced = rows.filter((r) => r.mrp !== null && r.selling_price !== null);
    const unit = (rs: typeof rows) => rs.map((r) => per100ml(r.selling_price, r.pack_size)).filter((x): x is number => x !== null);
    const board = plats.map((p) => {
      const all = d.latest.filter((r) => r.platform === p);
      const pr = priced.filter((r) => r.platform === p);
      const st = availabilityStats(all);
      const m = median(unit(rows.filter((r) => r.platform === p)));
      const rv = rivalsMedianPer100(p);
      return { platform: p, listings: st.listed, buyable: st.buyablePct, skus: new Set(listed(all).map(skuKey)).size, sos: searchShare(p), disc: round1(avg(pr.map((r) => discountPct(r.mrp, r.selling_price)))), vsShelf: round1((m / rv - 1) * 100), eta: deliveryMinutes(p) };
    });
    const availBars = plats.flatMap((p) => {
      const s = availabilityStats(d.latest.filter((r) => r.platform === p));
      const t = s.total || 1;
      return [
        { platform: platformLabel(p), state: 'Buyable', pct: round1((s.available / t) * 100) },
        { platform: platformLabel(p), state: 'Out of stock', pct: round1((s.out_of_stock / t) * 100) },
        { platform: platformLabel(p), state: 'Not listed', pct: round1((s.not_listed / t) * 100) },
      ];
    });
    const cityRows = cities.map((c) => {
      const all = d.latest.filter((r) => r.city === c);
      const st = availabilityStats(all);
      return { city: c, stores: CITIES.find((x) => x.id === c)?.stores ?? 0, listed: st.listed, buyable: st.buyablePct, sos: round1(avg(plats.map((p) => searchShare(`${p}|${c}`)))) };
    }).filter((c) => c.listed > 0);
    const daily = dailySellout(d.intervals, (r) => platformLabel(r.platform));
    const sigs = [...d.signals].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
    return { rows, plats, stats, revenue, units, board, availBars, cityRows, daily, sigs, health: contentHealth(d.latest), sos: plats.length ? round1(avg(plats.map(searchShare))) : 0, avgGap: board.length ? round1(avg(board.map((b) => b.vsShelf))) : 0 };
  }, [d.latest, d.intervals, d.signals, platforms, cities]);

  const rules = alertRules(v.stats.out_of_stock, v.stats.listed);
  const lead = v.board.length ? [...v.board].sort((a, b) => b.listings - a.listings)[0] : null;
  const day = d.meta ? istDay(d.meta.captured_at) : '';
  const topSigs = v.sigs.slice(0, 5);
  const waiting = APPROVALS.filter((a) => !done[a.id]);
  const critRules = rules.filter((r) => r.severity === 'critical').length;
  const sellData = v.daily.map((r) => ({ date: fmtDay(r.date), series: r.series, value: mode === 'revenue' ? r.revenue : r.units }));

  const header = (
    <PageHead
      title="Home"
      sub={`${day ? dateLong(day) : ''} · ${scopeLabel}`}
      actions={<><Link href={`/reports${query}`}><Button>Open Monday brief</Button></Link><Link href={`/assistant${query}`}><Button type="primary">Ask the Assistant</Button></Link></>}
    />
  );

  if (d.isLoading) return <>{header}<div className="bento"><div className="span-12"><SkeletonBlock h={110} /></div><div className="span-7"><SkeletonBlock h={320} /></div><div className="span-5"><SkeletonBlock h={320} /></div></div></>;
  if (d.isError) return <>{header}<ErrorState onRetry={() => d.refetch()} /></>;
  if (!d.latest.length) return <>{header}<EmptyState text="No captured listings for this platform and city selection." /></>;

  const decide = (a: (typeof APPROVALS)[number], verb: string) => {
    setDone((p) => ({ ...p, [a.id]: verb }));
    message.success(`${verb}: ${a.title}`);
  };

  return (
    <>
      {header}
      <div className="bento">
        <Kpi className="span-4" hero label="Sell-out revenue (est.)" value={fmtINR(Math.round(v.revenue))} icon={<DollarOutlined />} note={`${d.captures.length} captures`} />
        <Kpi className="span-4" label="Units sold (est.)" value={fmtNum(v.units)} icon={<ShoppingOutlined />} note="lower-bound estimate" />
        <Kpi className="span-4" label="Buyable availability" value={`${v.stats.buyablePct}%`} icon={<CheckCircleOutlined />} note={`${v.stats.out_of_stock} out of stock · ${v.stats.not_listed} not listed`} />
        <Kpi className="span-4" label="Open signals" value={v.sigs.length} icon={<AlertOutlined />} note={`${v.sigs.filter((s) => s.severity === 'critical').length} critical`} />
        <Kpi className="span-4" label="Share of search (sample)" value={`${v.sos}%`} icon={<SearchOutlined />} note="category keywords" />
        <Kpi className="span-4" label="Price vs rival brands (sample)" value={`${v.avgGap > 0 ? '+' : ''}${v.avgGap}%`} icon={<FundOutlined />} note="₹ per 100 ml" />
        <div className="span-12" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Prov>Shelf capture · {d.meta ? `${istDay(d.meta.captured_at)}` : ''}</Prov><Prov kind="sample">Search and price-vs-rivals are sample</Prov></div>

        <Section title="Needs a decision" sub={`${v.sigs.length} signals · ${waiting.length} decisions in the Inbox · ${critRules} alert rule${critRules === 1 ? '' : 's'} at critical`} link={<Link href={`/signals${query}`}>All signals →</Link>} />
        <Card className="span-7" title="Priority signals" sub="Ranked by severity and confidence" actions={<Link href={`/signals${query}`}><Button size="small">All {v.sigs.length} open</Button></Link>} footer={<Prov>Derived from the shelf capture</Prov>}>
          {topSigs.length ? topSigs.map((s) => (
            <Link key={s.id} href={`/signals${query}`} className="feed-item" style={{ color: 'inherit' }}>
              <span className={`sev ${s.severity}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</div>
                <div className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><SevTag v={s.severity} /><span>{s.type} · {platformLabel(s.platform)} · {s.city}</span></div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12.5 }}><b className="tnum">{s.delta}</b><div className="muted">{s.metric}</div></div>
            </Link>
          )) : <EmptyState text="No signal in this scope." />}
        </Card>

        <div className="span-5" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card title="Alert rules" sub={`${rules.length} rules · ${sum(rules.map((r) => r.matches))} matches`} actions={<Link href={`/alerts${query}`}><Button size="small">All rules</Button></Link>} footer={<Prov kind="sample">Rules sample · first rule counts the live shelf</Prov>}>
            {rules.map((r) => (
              <Link key={r.id} href={`/alerts${query}`} className="feed-item" style={{ color: 'inherit' }}>
                <span className={`sev ${r.severity}`} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</div><div className="muted" style={{ fontSize: 12 }}>{r.module} · {r.owner}</div></div>
                <div style={{ textAlign: 'right', fontSize: 12 }}><b className="tnum">{r.matches}</b><div className="muted">of {r.population} {r.unit}</div></div>
              </Link>
            ))}
          </Card>
          <Card title="Waiting on you" sub="Decisions prepared by workflows" actions={<Tag color="orange" bordered={false}>{waiting.length} in the Inbox</Tag>} footer={<><Link href={`/inbox${query}`}>Open the Inbox</Link><Prov kind="sample">Sample data</Prov></>}>
            {waiting.length ? waiting.map((a) => (
              <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.title}</div>
                <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>{a.sub}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Tag bordered={false}>{a.who}</Tag>
                  <span style={{ fontSize: 12, color: a.overdue ? 'var(--pb-coral)' : 'var(--ink-3)', fontWeight: a.overdue ? 700 : 400 }}>{a.when}</span>
                  <span style={{ flex: 1 }} />
                  <Button size="small" onClick={() => decide(a, 'Sent back for review')}>Review</Button>
                  <Button size="small" type="primary" onClick={() => decide(a, 'Approved')}>Decide</Button>
                </div>
              </div>
            )) : <EmptyState text="Nothing waiting on you." />}
          </Card>
        </div>

        <Section title="Where we stand today" sub={`${v.stats.listed} listings observed on ${v.plats.length} platform${v.plats.length === 1 ? '' : 's'}`} link={<Link href={`/dashboards${query}`}>Open the dashboard →</Link>} />
        <Card className="span-5" title="Buyable availability" sub="Every observed listing, by state" footer={<Prov>Shelf capture · latest</Prov>}>
          <BarChart data={v.availBars} x="platform" y="pct" color="state" stack height={Math.max(160, v.plats.length * 54 + 90)} formatter={(n) => `${n}%`} />
        </Card>
        <Card className="span-7" title="Platform scoreboard" sub="What each platform lists, how much is buyable, and how we show up in search" footer={<><Prov>Listings, buyable, SKUs, discount · shelf capture</Prov><Prov kind="sample">Search, price vs shelf, delivery · sample</Prov></>}>
          <Table size="small" pagination={false} rowKey="platform" dataSource={v.board} scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Platform', dataIndex: 'platform', render: platformLabel },
              { title: 'Listings', dataIndex: 'listings', align: 'right' },
              { title: 'Buyable', dataIndex: 'buyable', align: 'right', render: (n: number) => <Heat v={Math.round(n)} /> },
              { title: 'SKUs', dataIndex: 'skus', align: 'right' },
              { title: 'Search share', dataIndex: 'sos', align: 'right', render: (n: number) => `${n}%` },
              { title: 'Avg discount', dataIndex: 'disc', align: 'right', render: (n: number) => `${n}%` },
              { title: 'Price vs shelf', dataIndex: 'vsShelf', align: 'right', render: (n: number) => `${n > 0 ? '+' : ''}${n}%` },
              { title: 'Delivery', dataIndex: 'eta', align: 'right', render: (n: number) => `${n} min` },
            ]} />
        </Card>
        <Card className="span-12" title="Content & listing health" sub={`${v.health.audited} listings audited · ${v.health.checks.filter((c) => c.n > 0).length} of ${v.health.checks.length} checks tripped`} actions={<Link href={`/content-health${query}`}><Button size="small">Fix queue</Button></Link>} footer={<Prov>Computed from the latest capture</Prov>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 28px' }}>
            {[[v.health.score, 'content score · weighted'], [`${v.health.cleanPct}%`, `clean · ${v.health.clean} pass every check`], [v.health.defects, 'open defects'], ...v.health.byPlatform.map((p) => [p.score, `lowest · ${platformLabel(p.platform)}`])].map(([val, l]) => (
              <div key={String(l)}><div className="tnum" style={{ fontSize: 22, fontWeight: 700 }}>{val}</div><div className="muted" style={{ fontSize: 12 }}>{l}</div></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>Most-tripped:</span>
            {[...v.health.checks].filter((c) => c.n > 0).sort((a, b) => b.n - a.n).slice(0, 2).map((c) => <Tag key={c.key} color="orange" bordered={false}>{c.label} · {c.n}</Tag>)}
            {v.health.checks.every((c) => c.n === 0) && <Tag color="green" bordered={false}>No defects</Tag>}
          </div>
        </Card>

        <Section title="Trading" sub={lead ? `${fmtNum(v.units)} units (est.) · ${fmtINR(Math.round(v.revenue))} · ${platformLabel(lead.platform)} lists the most` : 'No sell-out in this scope'} />
        <Card className="span-7" title="Sell-out by platform" sub={`Daily ${mode}, ${d.captures.length} captures`} actions={<Segmented size="small" value={mode} onChange={(x) => setMode(x as 'units' | 'revenue')} options={[{ label: 'Units', value: 'units' }, { label: 'Revenue', value: 'revenue' }]} />} footer={<><EstimateTag /><Prov>Stock change between captures</Prov></>}>
          {sellData.length ? <AreaChart data={sellData} x="date" y="value" color="series" stack height={280} formatter={mode === 'revenue' ? (n) => `₹${fmtNum(Math.round(n))}` : fmtNum} /> : <EmptyState text="Not enough captures to estimate sell-out." />}
        </Card>
        <Card className="span-5" title="Cities" sub="Where the network is and how we are doing in it" footer={<><Prov>Buyable · shelf capture</Prov><Prov kind="sample">Dark stores and search · sample</Prov></>}>
          <Table size="small" pagination={false} rowKey="city" dataSource={v.cityRows}
            columns={[
              { title: 'City', dataIndex: 'city', render: (c: string) => <CityTag city={c} /> },
              { title: 'Dark stores', dataIndex: 'stores', align: 'right' },
              { title: 'Buyable', dataIndex: 'buyable', align: 'right', render: (n: number) => <Heat v={Math.round(n)} /> },
              { title: 'Search', dataIndex: 'sos', align: 'right', render: (n: number) => `${n}%` },
            ]} />
        </Card>

        <Section title="Running for you" sub={`${RUNS_24H.runs} runs in the last 24 hours · ${RUNS_24H.okPct}% finished cleanly · ${RUNS_24H.waiting} waiting on a person`} link={<Link href={`/workflows${query}`}>Workflow monitoring →</Link>} />
        <Card className="span-6" title="Automation" sub="What the workflows did in the last 24 hours" actions={<Link href={`/workflows${query}`}><Button size="small">Monitor</Button></Link>} footer={<Prov kind="sample">Sample data</Prov>}>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 10 }}>
            {[[RUNS_24H.runs, 'runs · 24 h'], [`${RUNS_24H.okPct}%`, 'finished cleanly'], [RUNS_24H.waiting, 'waiting on a person'], [RUNS_24H.failed, 'failed']].map(([val, l]) => <div key={String(l)}><div className="tnum" style={{ fontSize: 20, fontWeight: 700 }}>{val}</div><div className="muted" style={{ fontSize: 12 }}>{l}</div></div>)}
          </div>
          <Table size="small" pagination={false} rowKey="name" dataSource={WORKFLOWS} scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Workflow', dataIndex: 'name', render: (n: string) => <Link href={`/workflows${query}`}>{n}</Link> },
              { title: 'What it does', dataIndex: 'does', className: 'muted' },
              { title: 'Runs 30d', dataIndex: 'runs30d', align: 'right' },
              { title: 'Success', dataIndex: 'success', align: 'right', render: (n: number) => <Tag color={n >= 99 ? 'green' : n >= 97 ? 'orange' : 'red'} bordered={false}>{n}%</Tag> },
            ]} />
        </Card>
        <Card className="span-6" title="Ready to read" sub="Reports generated for you" actions={<Link href={`/reports${query}`}><Button size="small">Reports Center</Button></Link>} footer={<Prov kind="sample">Sample data</Prov>}>
          {REPORTS.map((r) => (
            <div key={r.title} className="feed-item" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.title}</div><div className="muted" style={{ fontSize: 12 }}>{r.sub}</div></div>
              <Tag color={r.ready ? 'green' : 'blue'} bordered={false}>{r.ready ? 'Ready' : 'Generating'}</Tag>
              <Link href={`/reports${query}`}><Button size="small">{r.ready ? 'Open' : 'Track'}</Button></Link>
            </div>
          ))}
        </Card>
        <Card className="span-12" title="Value & outcomes" sub={`Action ledger · last ${VALUE.windowDays} days`} actions={<Link href={`/value${query}`}><Button size="small">Ledger</Button></Link>} footer={<Prov kind="sample">Sample data · action ledger</Prov>}>
          <div style={{ display: 'flex', gap: '8px 28px', flexWrap: 'wrap' }}>
            {[[VALUE.cases, `cases · ${VALUE.kinds} kinds`], [inrShort(VALUE.verifiedInr), `benefit verified · net ${inrShort(VALUE.netVerifiedInr)}`], [inrShort(VALUE.claimedOpenInr), 'claimed on open cases · not money'], [`${VALUE.medianDays} d`, 'median to verify']].map(([val, l]) => <div key={String(l)}><div className="tnum" style={{ fontSize: 22, fontWeight: 700 }}>{val}</div><div className="muted" style={{ fontSize: 12 }}>{l}</div></div>)}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, fontSize: 13 }}>
            {Object.entries(VALUE.funnel).map(([k, n], i) => <span key={k}>{i > 0 && <span className="muted">→ </span>}{k} <b className="tnum">{n}</b></span>)}
            <Tag color="orange" bordered={false}>{VALUE.overdue} overdue</Tag>
          </div>
        </Card>
      </div>
    </>
  );
}
