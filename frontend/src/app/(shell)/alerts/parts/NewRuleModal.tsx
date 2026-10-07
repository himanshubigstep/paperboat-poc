'use client';

import { Form, Input, InputNumber, Modal, Select } from 'antd';
import { CHANNELS, FREQUENCIES, MODULES, OWNER_ROLES, RULES, type RuleDef } from '@/mock/ops-alerts';

interface Values { name: string; base: string; severity: RuleDef['severity']; value?: number; owner: string; channel: string; frequency: string }

export function NewRuleModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (r: RuleDef) => void }) {
  const [form] = Form.useForm<Values>();
  const baseId = Form.useWatch('base', form) ?? 'oos_streak';
  const baseRule = RULES.find((r) => r.id === baseId) ?? RULES[0];
  return (
    <Modal title="New rule" open={open} onCancel={onClose} okText="Create rule" destroyOnClose
      onOk={() => form.validateFields().then((v) => {
        const b = RULES.find((r) => r.id === v.base) ?? RULES[0];
        onCreate({ ...b, id: `custom_${v.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}_${b.id}`, base: b.id, name: v.name, severity: v.severity, owner: v.owner, channel: v.channel, frequency: v.frequency, threshold: b.threshold ? { ...b.threshold, value: v.value ?? b.threshold.value } : undefined });
        form.resetFields();
      })}>
      <Form form={form} layout="vertical" initialValues={{ base: 'oos_streak', severity: 'medium', owner: OWNER_ROLES[0], channel: CHANNELS[0], frequency: FREQUENCIES[0], value: RULES[0].threshold?.value }}>
        <Form.Item name="name" label="Rule name" rules={[{ required: true, message: 'Give the rule a name' }]}><Input placeholder="e.g. Delhi buyable share drops" /></Form.Item>
        <Form.Item name="base" label="Condition to watch">
          <Select options={MODULES.map((m) => ({ label: m, options: RULES.filter((r) => r.module === m).map((r) => ({ value: r.id, label: `${r.name}${r.real ? '' : ' (sample)'}` })) }))} onChange={() => form.setFieldValue('value', undefined)} />
        </Form.Item>
        {baseRule.threshold && (
          <Form.Item name="value" label={`${baseRule.threshold.label} (${baseRule.threshold.unit})`}>
            <InputNumber style={{ width: '100%' }} min={baseRule.threshold.min} max={baseRule.threshold.max} step={baseRule.threshold.step} placeholder={String(baseRule.threshold.value)} />
          </Form.Item>
        )}
        <Form.Item name="severity" label="Severity"><Select options={['critical', 'high', 'medium', 'low'].map((v) => ({ value: v, label: v }))} /></Form.Item>
        <Form.Item name="owner" label="Owner role"><Select options={OWNER_ROLES.map((o) => ({ value: o, label: o }))} /></Form.Item>
        <Form.Item name="channel" label="Channel"><Select options={CHANNELS.map((o) => ({ value: o, label: o }))} /></Form.Item>
        <Form.Item name="frequency" label="Cadence"><Select options={FREQUENCIES.map((o) => ({ value: o, label: o }))} /></Form.Item>
      </Form>
    </Modal>
  );
}
