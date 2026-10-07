'use client';

import { Badge, Button, Drawer, Dropdown, Grid, Input, Popover, Segmented, Switch, Tooltip } from 'antd';
import {
  AppstoreOutlined, BellOutlined, BulbOutlined, DatabaseOutlined, FileTextOutlined, HomeOutlined, MenuFoldOutlined, MenuOutlined,
  MenuUnfoldOutlined, MessageOutlined, MoonFilled, QuestionCircleOutlined, SettingOutlined, SearchOutlined, SunFilled, TableOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useThemeMode } from '@/components/Providers';
import { useFilters } from '@/hooks/useFilters';
import { api } from '@/lib/api';
import { fmtIST } from '@/components/ui';
import type { CityFilter } from '@/lib/types';

const NAV = [
  { href: '/', label: 'Overview', icon: <HomeOutlined /> },
  { href: '/dashboards', label: 'Dashboards', icon: <AppstoreOutlined /> },
  { href: '/products', label: 'Products', icon: <TableOutlined /> },
  { href: '/signals', label: 'Signals & Insights', icon: <ThunderboltOutlined />, badge: true },
  { href: '/recommendations', label: 'Recommendations', icon: <BulbOutlined /> },
  { href: '/assistant', label: 'Ask the Assistant', icon: <MessageOutlined /> },
  { href: '/data', label: 'Data & Datasets', icon: <DatabaseOutlined /> },
  { href: '/reports', label: 'Reports Center', icon: <FileTextOutlined /> },
];
const NAV_BOTTOM = [
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

function SideNav({ collapsed, onNavigate, query }: { collapsed: boolean; onNavigate?: () => void; query: string }) {
  const pathname = usePathname();
  const { data: signals } = useQuery({ queryKey: ['signals'], queryFn: api.signals });
  const open = signals?.length ?? 0;
  const item = (n: (typeof NAV)[number] & { badge?: boolean }) => {
    const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
    return (
      <Tooltip key={n.href} title={collapsed ? n.label : ''} placement="right">
        <Link
          href={`${n.href}${query}`}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: collapsed ? '10px 0' : '10px 12px', justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 12, fontWeight: 600, fontSize: 14, color: active ? 'var(--pb-violet)' : 'var(--ink-2)',
            background: active ? 'color-mix(in srgb, var(--pb-violet) 14%, transparent)' : 'transparent', transition: 'background .15s, color .15s',
          }}
        >
          <span style={{ fontSize: 17, display: 'grid' }}>{n.icon}</span>
          {!collapsed && <span style={{ flex: 1 }}>{n.label}</span>}
          {!collapsed && n.badge && open > 0 && <Badge count={open} color="#FF6B6B" />}
        </Link>
      </Tooltip>
    );
  };
  return (
    <nav aria-label="Primary" style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      {NAV.map(item)}
      <div style={{ flex: 1 }} />
      {NAV_BOTTOM.map(item)}
    </nav>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const screens = Grid.useBreakpoint();
  const mobile = screens.lg === false;
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const { mode, toggle } = useThemeMode();
  const { city, range, set, query } = useFilters();
  const router = useRouter();
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: api.meta });
  const { data: signals } = useQuery({ queryKey: ['signals'], queryFn: api.signals });

  const fresh = (
    <div style={{ width: 260, display: 'grid', gap: 8 }}>
      <b>Data freshness</b>
      {meta?.cities.map((c) => (
        <div key={c} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{c}</span>
          <span className="muted tnum">{fmtIST(meta.captured_at)}</span>
        </div>
      ))}
      <span className="muted" style={{ fontSize: 12 }}>
        {meta?.captures_per_day} captures a day · {meta?.runs_24h.ok} ok · {meta?.runs_24h.blocked} blocked in 24 h
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
      <SideNav collapsed={isCollapsed} onNavigate={onNav} query={query} />
    </>
  );

  return (
    <div className="shell">
      <div className="ambient" />
      {!mobile && <aside className={`sider ${collapsed ? 'collapsed' : ''}`}>{side(collapsed)}</aside>}
      {mobile && (
        <Drawer placement="left" open={drawer} onClose={() => setDrawer(false)} width={280} styles={{ body: { padding: 12, display: 'flex', flexDirection: 'column' } }} title={null} closable={false}>
          {side(false, () => setDrawer(false))}
        </Drawer>
      )}

      <div className={`shell-main ${mobile ? 'mobile' : collapsed ? 'collapsed' : ''}`}>
        <header className="topbar">
          <Button
            type="text"
            aria-label="Show or hide navigation"
            icon={mobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => (mobile ? setDrawer(true) : setCollapsed((c) => !c))}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Ask anything about Blinkit…"
            suffix={!mobile && <span className="muted" style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, padding: '1px 6px' }}>↵</span>}
            style={{ maxWidth: 380, borderRadius: 999 }}
            onPressEnter={(e) => {
              const q = (e.target as HTMLInputElement).value.trim();
              if (q) router.push(`/assistant?q=${encodeURIComponent(q)}`);
            }}
          />
          <div style={{ flex: 1 }} />
          {!mobile && (
            <Segmented<string>
              value={String(range)}
              onChange={(v) => set({ range: v === '14' ? null : v })}
              options={[{ label: '7 d', value: '7' }, { label: '14 d', value: '14' }]}
            />
          )}
          <Segmented<CityFilter>
            value={city}
            onChange={(v) => set({ city: v === 'Both' ? null : v })}
            options={[{ label: 'Both', value: 'Both' }, { label: 'Delhi', value: 'Delhi' }, { label: 'Mumbai', value: 'Mumbai' }]}
          />
          {!mobile && (
            <Popover content={fresh} trigger="click" placement="bottomRight">
              <button className="prov" style={{ border: 0, cursor: 'pointer' }} aria-label="Data freshness">
                <i /> {meta ? fmtIST(meta.captured_at) : 'Loading…'}
              </button>
            </Popover>
          )}
          <Tooltip title={`${signals?.length ?? 0} open signals`}>
            <Link href={`/signals${query}`} aria-label="Open signals">
              <Badge count={signals?.length ?? 0} size="small" color="#FF6B6B">
                <Button type="text" shape="circle" icon={<BellOutlined />} />
              </Badge>
            </Link>
          </Tooltip>
          <Switch checked={mode === 'dark'} onChange={toggle} checkedChildren={<MoonFilled />} unCheckedChildren={<SunFilled />} aria-label="Toggle theme" />
        </header>

        <main className="page">{children}</main>

        <footer className="footer">
          <span className="prov"><i /> Blinkit · Delhi &amp; Mumbai</span>
          <span>Last capture {meta ? fmtIST(meta.captured_at) : '…'}</span>
          <span style={{ flex: 1 }} />
          <span>Sell-out figures are estimates from stock changes</span>
          <Link href="/help">Help</Link>
          <span>v0.1 · POC</span>
        </footer>
      </div>
    </div>
  );
}
