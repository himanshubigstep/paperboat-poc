'use client';

import { Alert, Button, Descriptions, Drawer, Steps, Tag } from 'antd';
import { fmtIST, Prov } from '@/components/ui';
import type { Run } from '@/mock/ops-workflows';

export const STATUS_COLOR: Record<string, string> = { Success: 'green', Failed: 'red', Running: 'blue', 'Waiting approval': 'orange', Partial: 'gold' };
export const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, '0')} s` : `${s} s`);

export function RunDrawer({ run, open, onClose, onAgain, onExport }: { run: Run | null; open: boolean; onClose: () => void; onAgain: () => void; onExport: () => void }) {
  if (!run) return <Drawer open={false} onClose={onClose} />;
  return (
    <Drawer open={open} onClose={onClose} width={480} destroyOnClose title={`${run.id} · ${run.workflow}`}
      footer={<div style={{ display: 'flex', gap: 8 }}><Button type="primary" onClick={onAgain}>Run again</Button><Button onClick={onExport}>Export summary</Button></div>}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <Tag color={STATUS_COLOR[run.status]} bordered={false}>{run.status}</Tag>
        <Tag bordered={false}>{run.trigger}</Tag>
        {run.real ? <Prov>Dataset · scraped_at</Prov> : <Prov kind="sample">Sample data</Prov>}
      </div>
      {run.error && <Alert type={run.status === 'Failed' ? 'error' : 'warning'} showIcon style={{ marginBottom: 12, borderRadius: 12 }} message={`Stopped at ${run.error.stoppedAt}`} description={run.error.message} />}
      <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}
        items={[
          { key: 's', label: 'Started', children: fmtIST(run.started) },
          { key: 'd', label: 'Took', children: dur(run.durationS) },
          ...(run.scope ? [{ key: 'sc', label: 'Scope', children: run.scope }, { key: 'r', label: 'Rows captured', children: String(run.rows) }, { key: 'f', label: 'First listing scraped', children: fmtIST(run.firstAt as string) }, { key: 'l', label: 'Last listing scraped', children: fmtIST(run.lastAt as string) }] : []),
          { key: 'n', label: 'Steps', children: `${run.nodes - run.failedNodes} of ${run.nodes} succeeded` },
          { key: 'sg', label: 'Signals raised', children: String(run.signals) },
        ]} />
      <Steps direction="vertical" size="small" current={run.stepTimes.length} items={run.stepTimes.map((s) => ({ title: s.name, description: `${dur(s.s)}${s.ok ? '' : ' · failed'}`, status: s.ok ? 'finish' : 'error' }))} />
    </Drawer>
  );
}
