'use client';

import { Button, Input, Spin, Tag } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EstimateTag, PageHead } from '@/components/ui';
import { api } from '@/lib/api';
import { suggested_questions } from '@/mock/data';
import type { ChatTurn } from '@/lib/types';

const bold = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));

export default function Assistant() {
  const sp = useSearchParams();
  const [turns, setTurns] = useState<ChatTurn[]>([{ role: 'assistant', text: "Hi! Ask me about Blinkit availability, price, search rank or estimated sell-out in **Delhi** and **Mumbai**. I answer from captured data and show where each figure came from." }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const sent = useRef<string | null>(null);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setText('');
    setBusy(true);
    try {
      const a = await api.chat(q);
      setTurns((t) => [...t, { role: 'assistant', text: a.text, citations: a.citations, estimate: a.estimate }]);
    } catch {
      setTurns((t) => [...t, { role: 'assistant', text: "Sorry — I couldn't reach the data service. Try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const q = sp.get('q');
    if (q && sent.current !== q) {
      sent.current = q;
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, busy]);

  return (
    <>
      <PageHead title="Ask the Assistant" sub="Plain-language answers from the captured data · every figure links to its query" />
      <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 300px)', padding: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: 20, display: 'grid', gap: 14, alignContent: 'start', overflowY: 'auto' }} aria-live="polite">
          {turns.map((t, i) => (
            <div key={i} className={`chat-bubble ${t.role === 'user' ? 'user' : 'bot'}`}>
              <div>{bold(t.text)}</div>
              {t.estimate && <div style={{ marginTop: 8 }}><EstimateTag /></div>}
              {t.citations && t.citations.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {t.citations.map((c) => <Tag key={c.query_id} bordered={false} color="purple" style={{ cursor: 'pointer' }}>{c.label} · {c.query_id}</Tag>)}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="chat-bubble bot"><Spin size="small" /> <span className="muted">Querying the data…</span></div>}
          <div ref={end} />
        </div>
        <div style={{ borderTop: '1px solid var(--border)', padding: 16, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {suggested_questions.map((q) => <Button key={q} size="small" shape="round" onClick={() => ask(q)}>{q}</Button>)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input size="large" value={text} onChange={(e) => setText(e.target.value)} onPressEnter={() => ask(text)} placeholder="Ask about availability, price, rank or sell-out…" style={{ borderRadius: 999 }} />
            <Button size="large" type="primary" shape="circle" icon={<SendOutlined />} onClick={() => ask(text)} loading={busy} aria-label="Send" />
          </div>
        </div>
      </div>
    </>
  );
}
