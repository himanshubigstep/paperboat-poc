'use client';

import { Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Card, CityTag, ErrorState, PageHead, Prov, SevTag, fmtIST, fmtNum } from '@/components/ui';
import { api } from '@/lib/api';

export default function DataPage() {
  const datasets = useQuery({ queryKey: ['datasets'], queryFn: api.datasets });
  const runs = useQuery({ queryKey: ['runs'], queryFn: api.runs });
  const quality = useQuery({ queryKey: ['quality'], queryFn: api.quality });
  if (datasets.isError) return <ErrorState onRetry={() => datasets.refetch()} />;
  return (
    <>
      <PageHead title="Data & Datasets" sub="What was captured, when, and whether to trust it" />
      <div className="bento">
        <Card className="span-7" title="Datasets" sub="Raw tables behind every screen" footer={<Prov>Blinkit · 3 captures a day</Prov>}>
          <Table size="small" rowKey="key" loading={datasets.isLoading} pagination={false} dataSource={datasets.data}
            columns={[
              { title: 'Dataset', dataIndex: 'label', render: (v, r) => (<div><b>{v}</b><div className="muted" style={{ fontSize: 12 }}>{r.source}</div></div>) },
              { title: 'Rows', dataIndex: 'rows', align: 'right', render: fmtNum, sorter: (a, b) => a.rows - b.rows },
              { title: 'Size', dataIndex: 'kb', align: 'right', render: (v: number) => (v > 1024 ? `${(v / 1024).toFixed(1)} MB` : `${v} KB`) },
              { title: 'Updated', dataIndex: 'last', render: fmtIST },
            ]} />
        </Card>
        <Card className="span-5" title="Data-quality checks" sub="Missing fields, unusual prices, stale runs, blocked requests">
          <div style={{ display: 'grid', gap: 10 }}>
            {quality.data?.map((q) => (
              <div key={q.id} className="feed-item" style={{ display: 'block' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><SevTag v={q.severity} /><b>{q.kind}</b></div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{q.where}</div>
                <div className="sec" style={{ fontSize: 13, marginTop: 2 }}>{q.detail}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="span-12" title="Capture runs" sub="Scheduled three times a day per city">
          <Table size="small" rowKey="run_id" loading={runs.isLoading} pagination={false} dataSource={runs.data}
            columns={[
              { title: 'Run', dataIndex: 'run_id', render: (v) => <span className="tnum">{v}</span> },
              { title: 'City', dataIndex: 'city', render: (c) => <CityTag city={c} /> },
              { title: 'Started', dataIndex: 'started', render: fmtIST },
              { title: 'Rows', dataIndex: 'rows', align: 'right' },
              { title: 'Duration', dataIndex: 'duration_s', align: 'right', render: (v) => `${v}s` },
              { title: 'Status', dataIndex: 'status', render: (s) => <Tag bordered={false} color={s === 'ok' ? 'success' : 'error'}>{s}</Tag> },
            ]} />
        </Card>
      </div>
    </>
  );
}
