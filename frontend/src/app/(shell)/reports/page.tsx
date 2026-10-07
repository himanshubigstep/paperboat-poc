'use client';

import { Button, Tag } from 'antd';
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Card, ErrorState, PageHead, SkeletonBlock, fmtIST } from '@/components/ui';
import { api } from '@/lib/api';

export default function Reports() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['reports'], queryFn: api.reports });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <>
      <PageHead title="Reports Center" sub="Generated briefs and on-demand summaries" />
      {isLoading ? <SkeletonBlock h={300} /> : (
        <div className="bento">
          {data?.map((r) => (
            <Card key={r.id} className="span-6" title={<span><FileTextOutlined style={{ color: 'var(--pb-violet)' }} /> {r.title}</span>} sub={`${r.kind} · ${r.pages} page${r.pages > 1 ? 's' : ''} · ${fmtIST(r.generated)}`} actions={<Tag bordered={false}>{r.kind}</Tag>}>
              <p className="sec" style={{ marginTop: 0 }}>{r.summary}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="primary">Read</Button>
                <Button icon={<DownloadOutlined />}>PDF</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
