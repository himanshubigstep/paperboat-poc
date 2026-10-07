'use client';

import { Switch, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Card, ErrorState, PageHead } from '@/components/ui';
import { api } from '@/lib/api';

export default function Settings() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['alert-rules'], queryFn: api.alertRules });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <>
      <PageHead title="Settings & governance" sub="Alert rules and who gets told" />
      <Card lift={false} title="Alert rules" sub="Each rule is evaluated on every capture. Thresholds are defaults you can change.">
        <Table rowKey="id" loading={isLoading} pagination={false} dataSource={data}
          columns={[
            { title: 'Rule', dataIndex: 'name', render: (v) => <b>{v}</b> },
            { title: 'Scope', dataIndex: 'scope' },
            { title: 'Threshold', dataIndex: 'threshold' },
            { title: 'Matches now', dataIndex: 'matches', render: (v) => <Tag color={v ? 'orange' : 'default'} bordered={false}>{v}</Tag> },
            { title: 'Channel', dataIndex: 'channel' },
            { title: 'On', dataIndex: 'on', render: (v) => <Switch defaultChecked={v} aria-label="Enable rule" /> },
          ]} />
      </Card>
    </>
  );
}
