'use client';

import { Badge, Button, Drawer, Grid, Input, Popover, Segmented, Select, Switch, Tag, Tooltip } from 'antd';
import {
  AppstoreOutlined, ApartmentOutlined, BellOutlined, BulbOutlined, ClusterOutlined, DatabaseOutlined, FileSearchOutlined, FileTextOutlined, FilterOutlined, HomeOutlined,
  InboxOutlined, LineChartOutlined, MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined, MessageOutlined, MoonFilled, QuestionCircleOutlined, SearchOutlined, SettingOutlined,
  StarOutlined, SunFilled, TableOutlined, ThunderboltOutlined, TrophyOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useThemeMode } from '@/components/Providers';
import { fmtIST } from '@/components/ui';
import { useFilters, type Range } from '@/hooks/useFilters';
import { useSignals } from '@/hooks/useSignals';
import { CITIES, PLATFORMS, platformLabel } from '@/lib/config';

interface NavItem { href: string; label: string; icon: React.ReactNode; badge?: boolean }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Monitor', items: [
    { href: '/', label: 'Overview', icon: <HomeOutlined /> },
    { href: '/dashboards', label: 'Dashboards', icon: <AppstoreOutlined /> },
    { href: '/products', label: 'Products', icon: <TableOutlined /> },
    { href: '/stock', label: 'Stock & Sell-out', icon: <LineChartOutlined /> },
  ] },
  { group: 'Insight', items: [
    { href: '/signals', label: 'Signals & Insights', icon: <ThunderboltOutlined />, badge: true },
    { href: '/recommendations', label: 'Recommendations', icon: <BulbOutlined /> },
    { href: '/assistant', label: 'Ask the Assistant', icon: <MessageOutlined /> },
    { href: '/inbox', label: 'Inbox', icon: <InboxOutlined /> },
    { href: '/alerts', label: 'Alerts & Subscriptions', icon: <BellOutlined /> },
  ] },
  { group: 'Quality', items: [
    { href: '/content-health', label: 'Content & Listing Health', icon: <FileSearchOutlined /> },
    { href: '/ratings', label: 'Ratings & Reviews', icon: <StarOutlined /> },
    { href: '/catalogue', label: 'Catalogue Matching', icon: <ApartmentOutlined /> },
  ] },
  { group: 'Operate', items: [
    { href: '/workflows', label: 'Workflow Monitoring', icon: <ClusterOutlined /> },
    { href: '/data', label: 'Data & Datasets', icon: <DatabaseOutlined /> },
    { href: '/reports', label: 'Reports Center', icon: <FileTextOutlined /> },
    { href: '/value', label: 'Value & Outcomes', icon: <TrophyOutlined /> },
  ] },
];
const NAV_BOTTOM: NavItem[] = [
  { href: '/settings', label: 'Settings & governance', icon: <SettingOutlined /> },
  { href: '/help', label: 'Help', icon: <QuestionCircleOutlined /> },
];

function Boat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 15h18l-2.5 4.5a2 2 0 0 1-1.8 1H7.3a2 2 0 0 1-1.8-1L3 15Z" fill="#fff" />
      <path d="M12 3v10M12 3l6 8h-6M12 5 7 11h5" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function SideNav({ collapsed, onNavigate, query, open }: { collapsed: boolean; onNavigate?: () => void; query: string; open: number }) {
  const pathname = usePathname();
  const item = (n: NavItem) => {
    const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
    return (
      <Tooltip key={n.href} title={collapsed ? n.label : ''} placement="right">
        <Link
          href={`${n.href}${query}`}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: collapsed ? '9px 0' : '8px 12px', justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 12, fontWeight: 600, fontSize: 13.5, color: active ? 'var(--pb-violet)' : 'var(--ink-2)',
            background: active ? 'color-mix(in srgb, var(--pb-violet) 14%, transparent)' : 'transparent', transition: 'background .15s, color .15s',
          }}
        >
          <span style={{ fontSize: 16, display: 'grid' }}>{n.icon}</span>
          {!collapsed && <span style={{ flex: 1 }}>{n.label}</span>}
          {!collapsed && n.badge && open > 0 && <Badge count={open} color="#FF6B6B" />}
        </Link>
      </Tooltip>
    );
  };
  return (
    <nav aria-label="Primary" style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {NAV.map((g) => (
        <div key={g.group} style={{ display: 'grid', gap: 2, marginBottom: 6 }}>
          {!collapsed ? <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 12px 4px' }}>{g.group}</div> : <div style={{ height: 1, background: 'var(--border)', margin: '6px 10px' }} />}
          {g.items.map(item)}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      {NAV_BOTTOM.map(item)}
    </nav>
  );
}

/** Platform + city + range filters. Platforms/cities not connected yet are visible but disabled. */
function FilterBar({ compact }: { compact?: boolean }) {
  const { platforms, cities, range, set } = useFilters();
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'stretch' : 'center' }}>
      <Select
        mode="multiple"
        maxTagCount="responsive"
        value={platforms}
        onChange={(v) => set({ platform: v.length ? v : null })}
        placeholder="Platform"
        style={{ minWidth: compact ? 0 : 190, maxWidth: 260 }}
        aria-label="Platforms"
        options={PLATFORMS.map((p) => ({ value: p.id, disabled: !p.connected, label: p.connected ? p.label : <span>{p.label} <Tag bordered={false} style={{ marginInlineEnd: 0 }}>soon</Tag></span> }))}
      />
      <Select
        mode="multiple"
        maxTagCount="responsive"
        value={cities}
        onChange={(v) => set({ city: v.length ? v : null })}
        placeholder="City"
        style={{ minWidth: compact ? 0 : 170, maxWidth: 240 }}
        aria-label="Cities"
        options={CITIES.map((c) => ({ value: c.id, disabled: !c.connected, label: c.connected ? c.label : <span>{c.label} <Tag bordered={false} style={{ marginInlineEnd: 0 }}>soon</Tag></span> }))}
      />
      <Segmented<string> value={String(range)} onChange={(v) => set({ range: Number(v) as Range })} options={[{ label: '7 d', value: '7' }, { label: '14 d', value: '14' }]} />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const screens = Grid.useBreakpoint();
  const mobile = screens.lg === false;
  const narrow = screens.xl === false;
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const { mode, toggle } = useThemeMode();
  const { query, scopeLabel } = useFilters();
  const router = useRouter();
  const { meta, all, signals } = useSignals();
  const open = signals.length;

  const freshness = useMemo(() => {
    const m = new Map<string, string>();
    all.forEach((s) => {
      const k = `${platformLabel(s.platform)} · ${s.city}`;
      if (!m.get(k) || s.scraped_at > (m.get(k) as string)) m.set(k, s.scraped_at);
    });
    return Array.from(m.entries());
  }, [all]);

  const fresh = (
    <div style={{ width: 280, display: 'grid', gap: 8 }}>
      <b>Data freshness</b>
      {freshness.map(([k, t]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{k}</span>
          <span className="muted tnum">{fmtIST(t)}</span>
        </div>
      ))}
      <span className="muted" style={{ fontSize: 12 }}>
        {meta?.captures_per_day} captures a day · {meta?.capture_count} captures kept
      </span>
    </div>
  );

  const side = (isCollapsed: boolean, onNav?: () => void) => (
    <>
      <div className="brand">
        <div className="brand-mark"><Boat /></div>
        {!isCollapsed && (
          <div>
            <div className="brand-name">Paper Boat</div>
            <div className="brand-sub">Quick-Commerce Intelligence</div>
          </div>
        )}
      </div>
      <SideNav collapsed={isCollapsed} onNavigate={onNav} query={query} open={open} />
    </>
  );

  return (
    <div className="shell">
      <div className="ambient" />
      {!mobile && <aside className={`sider ${collapsed ? 'collapsed' : ''}`}>{side(collapsed)}</aside>}
      {mobile && (
        <Drawer placement="left" open={drawer} onClose={() => setDrawer(false)} width={290} styles={{ body: { padding: 12, display: 'flex', flexDirection: 'column' } }} title={null} closable={false}>
          {side(false, () => setDrawer(false))}
        </Drawer>
      )}

      <div className={`shell-main ${mobile ? 'mobile' : collapsed ? 'collapsed' : ''}`}>
        <header className="topbar">
          <Button type="text" aria-label="Show or hide navigation" icon={mobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => (mobile ? setDrawer(true) : setCollapsed((c) => !c))} />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search or ask…"
            style={{ maxWidth: narrow ? 200 : 300, borderRadius: 999 }}
            onPressEnter={(e) => {
              const q = (e.target as HTMLInputElement).value.trim();
              if (q) router.push(`/assistant?q=${encodeURIComponent(q)}`);
            }}
          />
          <div style={{ flex: 1 }} />
          {narrow ? (
            <Popover trigger="click" placement="bottomRight" content={<div style={{ width: 260 }}><FilterBar compact /></div>} title={scopeLabel}>
              <Button icon={<FilterOutlined />}>Filters</Button>
            </Popover>
          ) : (
            <FilterBar />
          )}
          {!mobile && (
            <Popover content={fresh} trigger="click" placement="bottomRight">
              <button className="prov" style={{ border: 0, cursor: 'pointer' }} aria-label="Data freshness">
                <i /> {meta ? fmtIST(meta.captured_at) : 'Loading…'}
              </button>
            </Popover>
          )}
          <Tooltip title={`${open} open signals`}>
            <Link href={`/signals${query}`} aria-label="Open signals">
              <Badge count={open} size="small" color="#FF6B6B">
                <Button type="text" shape="circle" icon={<ThunderboltOutlined />} />
              </Badge>
            </Link>
          </Tooltip>
          <Switch checked={mode === 'dark'} onChange={toggle} checkedChildren={<MoonFilled />} unCheckedChildren={<SunFilled />} aria-label="Toggle theme" />
        </header>

        <main className="page">{children}</main>

        <footer className="footer">
          <span className="prov"><i /> {scopeLabel}</span>
          <span>Last capture {meta ? fmtIST(meta.captured_at) : '…'}</span>
          <span style={{ flex: 1 }} />
          <span>Sell-out is an estimate from stock changes between captures</span>
          <Link href="/help">Help</Link>
          <span>v0.2 · POC</span>
        </footer>
      </div>
    </div>
  );
}
