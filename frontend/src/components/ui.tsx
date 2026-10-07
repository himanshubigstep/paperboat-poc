'use client';

import { Alert, Button, Empty, Result, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { Tabs } from 'antd';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { platformColor, platformLabel } from '@/lib/config';
import type { Availability, Severity } from '@/lib/types';

export const fmtINR = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })}`;
export const fmtNum = (n: number) => n.toLocaleString('en-IN');
export const fmtIST = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
export const fmtDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

export function Section({ title, sub, link }: { title: string; sub?: ReactNode; link?: ReactNode }) {
  return (
    <div className="sec-head">
      <b>{title}</b>
      {sub && <span className="muted" style={{ fontSize: 13 }}>{sub}</span>}
      <span className="grow" />
      {link}
    </div>
  );
}

/** Provenance chip. kind="real" = derived from captured shelf data; kind="sample" = placeholder data for a feed not connected yet. */
export function Prov({ children, kind = 'real' }: { children: ReactNode; kind?: 'real' | 'sample' }) {
  return (
    <span className={`prov ${kind === 'sample' ? 'sample' : ''}`}>
      <i />
      {children}
    </span>
  );
}

export function Card({ title, sub, actions, footer, children, className = '', lift = true, hero }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string; lift?: boolean; hero?: boolean }) {
  return (
    <section className={`card ${lift ? 'lift' : ''} ${hero ? 'hero' : ''} ${className}`}>
      {(title || actions) && (
        <div className="card-h">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      {children}
      {footer && <div className="card-f">{footer}</div>}
    </section>
  );
}

export function Kpi({ label, value, icon, delta, up, note, className = '', hero }: { label: string; value: ReactNode; icon: ReactNode; delta?: string; up?: boolean; note?: string; className?: string; hero?: boolean }) {
  return (
    <div className={`card lift kpi ${hero ? 'hero' : ''} ${className}`}>
      <div className="label">
        <span className="icon">{icon}</span>
        {label}
      </div>
      <div className="value">{value}</div>
      <div className="meta">
        {delta && <span className={up ? 'delta-up' : 'delta-down'}>{up ? '▲' : '▼'} {delta}</span>}
        {note && <span>{note}</span>}
      </div>
    </div>
  );
}

export function SkeletonBlock({ h = 220 }: { h?: number }) {
  return <div className="skel" style={{ height: h }} />;
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <Result
      status="warning"
      title="Couldn't load this"
      subTitle={message ?? 'The data service did not respond. Your filters are still saved.'}
      extra={onRetry && <Button icon={<ReloadOutlined />} onClick={onRetry}>Retry</Button>}
    />
  );
}

export function EmptyState({ text = 'Nothing matches these filters.' }: { text?: string }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;
}

export function EstimateTag() {
  return <Tag color="gold" bordered={false} style={{ marginInlineEnd: 0 }}>Estimate</Tag>;
}

export function AvailTag({ v }: { v: Availability }) {
  const map = { available: ['success', 'Buyable'], out_of_stock: ['error', 'Out of stock'], not_listed: ['default', 'Not listed'] } as const;
  const [color, label] = map[v];
  return <Tag color={color} bordered={false}>{label}</Tag>;
}

export function SevTag({ v }: { v: Severity }) {
  const map = { critical: ['red', 'Critical'], high: ['orange', 'High'], medium: ['blue', 'Medium'], low: ['default', 'Low'] } as const;
  return <Tag color={map[v][0]} bordered={false}>{map[v][1]}</Tag>;
}

const CITY_TAG: Record<string, string> = { Delhi: 'purple', Mumbai: 'orange', Bengaluru: 'cyan', Hyderabad: 'magenta', Chennai: 'green' };
export function CityTag({ city }: { city: string }) {
  return <Tag color={CITY_TAG[city] ?? 'geekblue'} bordered={false}>{city}</Tag>;
}

export function PlatformTag({ id }: { id: string }) {
  return (
    <Tag bordered={false} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <i style={{ width: 8, height: 8, borderRadius: 8, background: platformColor(id), display: 'inline-block' }} />
      {platformLabel(id)}
    </Tag>
  );
}

/** "Paper Boat Swing Lively Orange Juice" -> "Swing Lively Orange Juice" */
export const shortName = (n: string) => n.replace(/^paper boat\s+/i, '');

/** Tabs whose active key lives in the URL (?tab=sales) so a tab can be linked to and survives refresh. */
export function UrlTabs({ items, param = 'tab', defaultKey }: { items: { key: string; label: ReactNode; children: ReactNode }[]; param?: string; defaultKey?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fallback = defaultKey ?? items[0].key;
  const cur = sp.get(param);
  const active = items.some((i) => i.key === cur) ? (cur as string) : fallback;
  return (
    <Tabs
      activeKey={active}
      destroyInactiveTabPane
      onChange={(k) => {
        const n = new URLSearchParams(sp.toString());
        if (k === fallback) n.delete(param);
        else n.set(param, k);
        router.replace(`${pathname}${n.toString() ? `?${n}` : ''}`, { scroll: false });
      }}
      items={items}
    />
  );
}

/** Small banner for screens whose numbers are placeholders because the feed is not connected yet. */
export function SampleNote({ children }: { children?: ReactNode }) {
  return <Alert type="info" showIcon style={{ marginBottom: 16, borderRadius: 14 }} message={children ?? 'Sample data — this feed is not connected yet. Layout and calculations are real; numbers are placeholders.'} />;
}

export function Delta({ v, suffix = '', goodWhenUp = true }: { v: number; suffix?: string; goodWhenUp?: boolean }) {
  if (!v) return <span className="muted">—</span>;
  const good = (v > 0) === goodWhenUp;
  return <span className={good ? 'delta-up' : 'delta-down'}>{v > 0 ? '▲' : '▼'} {Math.abs(v)}{suffix}</span>;
}

export function PaidTag({ type }: { type: 'free' | 'paid' }) {
  return <Tag color={type === 'paid' ? 'magenta' : 'green'} bordered={false}>{type === 'paid' ? 'Paid' : 'Free'}</Tag>;
}

export function Heat({ v }: { v: number }) {
  const bg = v >= 95 ? 'var(--heat-good)' : v >= 80 ? 'var(--heat-ok)' : v >= 40 ? 'var(--heat-warn)' : v > 0 ? 'var(--heat-bad)' : 'var(--heat-bad)';
  return <div className="heat" style={{ background: bg }}>{v}%</div>;
}

export function DataWarning({ issues }: { issues: number }) {
  if (!issues) return null;
  return <Alert type="warning" showIcon style={{ marginBottom: 16, borderRadius: 14 }} message={`${issues} data-quality notes in this capture window`} description="Some figures may be interpolated or incomplete. See Data & Datasets for details." />;
}
