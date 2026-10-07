'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Button, message, Checkbox, Drawer, Dropdown, Grid, Input, Modal, Tag } from 'antd';
import { CheckCircleFilled, PaperClipOutlined, SendOutlined, MenuOutlined, PlusOutlined, ShareAltOutlined, DownloadOutlined } from '@ant-design/icons';
import { Card, EstimateTag, PageHead, Prov } from '@/components/ui';
import { Gate } from '@/components/pagekit/Gate';
import { RowsDrawer, type DrawerSpec } from '@/components/pagekit/RowsDrawer';
import { useFilters } from '@/hooks/useFilters';
import { useDataset } from '@/hooks/useDataset';
import { CITIES, platformLabel, PLATFORMS } from '@/lib/config';
import { fmtIST } from '@/components/ui';
import { answer, SUGGESTIONS, type Answer, type Cell, type Citation, type Ctx } from './engine';
import { PROMPTS } from './prompts';

interface Conv { id: string; title: string; group: string; turns: string[]; platforms?: string[]; cities?: string[]; dataset?: string }

const DATASETS = [
  { key: 'shelf', label: 'Shelf capture', hint: 'Every listing, every capture' },
  { key: 'sellout', label: 'Sell-out estimate', hint: 'Stock change between captures' },
  { key: 'price', label: 'Price & discount', hint: 'MRP and selling price' },
  { key: 'stock', label: 'Stock & restocks', hint: 'Units on shelf' },
  { key: 'catalogue', label: 'Catalogue (SKU master)', hint: 'Canonical SKUs and ids' },
];

const SEED: Conv[] = [
  { id: 'c-seed-1', title: 'Out of stock this morning', group: 'Yesterday', turns: ['What is out of stock right now?'] },
  { id: 'c-seed-2', title: 'Price gaps between cities', group: 'Yesterday', turns: ['Where do prices differ between cities?'] },
  { id: 'c-seed-3', title: 'Swing discount check', group: 'Earlier', turns: ['Which products have the biggest discount?'] },
];

function AnswerView({ q, ctx, onCite, onAsk }: { q: string; ctx: Ctx; onCite: (c: Citation) => void; onAsk: (q: string) => void }) {
  const a: Answer = useMemo(() => answer(q, ctx), [q, ctx]);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--pb-violet), var(--pb-coral))', color: '#fff', fontWeight: 700, flex: '0 0 auto' }}>P</span>
      <div className="chat-bubble bot" style={{ minWidth: 0, flex: 1, maxWidth: 820 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b>{a.title}</b>
          {a.estimate && <EstimateTag />}
          <span className="muted" style={{ fontSize: 12 }}>{a.scope}</span>
        </div>
        <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
          {a.lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
        {a.table && (
          <div style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead>
                <tr>{a.table.columns.map((c) => <th key={c.key} style={{ textAlign: c.align ?? 'left', padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--ink-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.title}</th>)}</tr>
              </thead>
              <tbody>
                {a.table.rows.map((r, i) => (
                  <tr key={i}>{a.table!.columns.map((c) => <td key={c.key} className="tnum" style={{ textAlign: c.align ?? 'left', padding: '6px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{r[c.key]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>Citations</span>
          {a.citations.map((c) => (
            <Tag key={c.id} bordered={false} color="purple" style={{ cursor: 'pointer', marginInlineEnd: 0 }} role="button" tabIndex={0} aria-label={`Open the rows behind ${c.id}`} onClick={() => onCite(c)} onKeyDown={(e) => e.key === 'Enter' && onCite(c)}>
              {c.id}
            </Tag>
          ))}
          {!a.citations.length && <span className="muted" style={{ fontSize: 12 }}>none for this reply</span>}
        </div>
        {a.followups.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {a.followups.slice(0, 3).map((f) => <Button key={f} size="small" onClick={() => onAsk(f)}>{f}</Button>)}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantInner() {
  const d = useDataset();
  const { scopeLabel, platforms: fPlat, cities: fCities } = useFilters();
  const sp = useSearchParams();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const narrow = screens.lg === false;

  const [convs, setConvs] = useState<Conv[]>(SEED);
  const [curId, setCurId] = useState<string>('');
  const [nextN, setNextN] = useState(1);
  const [text, setText] = useState('');
  const [convQ, setConvQ] = useState('');
  const [convOpen, setConvOpen] = useState(false);
  const [cite, setCite] = useState<Citation | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const [libQ, setLibQ] = useState('');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [attached, setAttached] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const handledQ = useRef<string | null>(null);

  const cur = convs.find((c) => c.id === curId);
  const ctx: Ctx = useMemo(
    () => ({ latest: d.latest, snapshots: d.snapshots, intervals: d.intervals, capturedAt: d.meta?.captured_at ?? '', platforms: cur?.platforms, cities: cur?.cities, dataset: cur?.dataset }),
    [d.latest, d.snapshots, d.intervals, d.meta, cur?.platforms, cur?.cities, cur?.dataset],
  );

  const newConv = (title = 'New conversation', turns: string[] = []) => {
    const id = `c-new-${nextN}`;
    setNextN((n) => n + 1);
    setConvs((cs) => [{ id, title, group: 'Today', turns }, ...cs]);
    setCurId(id);
    return id;
  };

  const ask = (q: string, convId?: string) => {
    const t = q.trim();
    if (!t) return;
    const id = convId ?? curId;
    if (!id) {
      newConv(t.length > 52 ? `${t.slice(0, 52)}…` : t, [t]);
    } else {
      setConvs((cs) => cs.map((c) => (c.id === id ? { ...c, title: c.turns.length ? c.title : t.length > 52 ? `${t.slice(0, 52)}…` : t, turns: [...c.turns, t] } : c)));
    }
    setText('');
  };

  // ?q= from the header search
  const qParam = sp.get('q');
  useEffect(() => {
    if (!qParam || d.isLoading || handledQ.current === qParam) return;
    handledQ.current = qParam;
    newConv(qParam.length > 52 ? `${qParam.slice(0, 52)}…` : qParam, [qParam]);
    const n = new URLSearchParams(sp.toString());
    n.delete('q');
    router.replace(`/assistant${n.toString() ? `?${n}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam, d.isLoading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [cur?.turns.length, curId]);

  const patchCur = (p: Partial<Conv>) => curId ? setConvs((cs) => cs.map((c) => (c.id === curId ? { ...c, ...p } : c))) : newConv();

  const shown = convs.filter((c) => !convQ || c.title.toLowerCase().includes(convQ.toLowerCase()) || c.turns.some((t) => t.toLowerCase().includes(convQ.toLowerCase())));
  const groups = Array.from(new Set(shown.map((c) => c.group)));

  const drawerSpec: DrawerSpec<Record<string, Cell>> | null = cite && {
    title: `${cite.id} · ${cite.rows.length} row${cite.rows.length === 1 ? '' : 's'}`,
    sub: <><code style={{ fontSize: 12 }}>{cite.query}</code><div style={{ marginTop: 6 }}><Prov>Shelf capture · {d.meta ? fmtIST(d.meta.captured_at) : ''}</Prov></div></>,
    columns: cite.columns.map((c) => ({ title: c.title, dataIndex: c.key, align: c.align, render: (v: Cell) => v })),
    rows: cite.rows,
    note: cite.note,
  };

  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <Button type="primary" icon={<PlusOutlined />} block onClick={() => { newConv(); setConvOpen(false); }}>New conversation</Button>
      <Input allowClear placeholder="Search conversations" aria-label="Search conversations" value={convQ} onChange={(e) => setConvQ(e.target.value)} />
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {!shown.length && <div className="muted" style={{ padding: 8 }}>No conversation matches.</div>}
        {groups.map((g) => (
          <div key={g}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', padding: '8px 6px 4px' }}>{g}</div>
            {shown.filter((c) => c.group === g).map((c) => (
              <button key={c.id} type="button" onClick={() => { setCurId(c.id); setConvOpen(false); }} aria-current={c.id === curId} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, cursor: 'pointer', padding: '8px 10px', borderRadius: 10, color: 'var(--ink)', background: c.id === curId ? 'var(--raised)' : 'transparent', fontWeight: c.id === curId ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</button>
            ))}
          </div>
        ))}
      </div>
      <Prov kind="sample">Sample history</Prov>
    </div>
  );

  const scopePlatforms = cur?.platforms ?? fPlat;
  const scopeCities = cur?.cities ?? fCities;
  const libShown = PROMPTS.filter((p) => !libQ || `${p.title} ${p.template} ${p.category}`.toLowerCase().includes(libQ.toLowerCase()));
  const starters = SUGGESTIONS.slice(0, 4);

  return (
    <Gate d={d}>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '260px minmax(0, 1fr)', gap: 16, alignItems: 'stretch' }}>
        {!narrow && <Card lift={false} className="" ><div style={{ height: 'calc(100vh - 260px)', minHeight: 420 }}>{sidebar}</div></Card>}
        <Card lift={false}>
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 260px)', minHeight: 520 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              {narrow && <Button aria-label="Conversations" icon={<MenuOutlined />} onClick={() => setConvOpen(true)} />}
              <h2 style={{ margin: 0, fontSize: 17, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur?.title ?? 'Ask the Assistant'}</h2>
              <Button size="small" icon={<ShareAltOutlined />} onClick={() => message.success('Share link copied')}>Share</Button>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => message.success('Conversation exported as PDF')}>Export</Button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', fontSize: 12.5 }}>
              <span className="muted">Answering with</span>
              <Tag bordered={false}>{scopePlatforms.map(platformLabel).join(' + ')}</Tag>
              <Tag bordered={false}>{scopeCities.join(' + ')}</Tag>
              <Tag bordered={false}>{d.captures.length} captures</Tag>
              {cur?.dataset && <Tag color="purple" bordered={false} closable onClose={() => patchCur({ dataset: undefined })}>@ {DATASETS.find((x) => x.key === cur.dataset)?.label}</Tag>}
              <Button size="small" type="link" onClick={() => setScopeOpen(true)}>Change</Button>
              <span style={{ flex: 1 }} />
              <Prov>Shelf capture · {scopeLabel}</Prov>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '6px 2px' }}>
              {(!cur || !cur.turns.length) && (
                <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 680, padding: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, margin: '0 auto 10px', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--pb-violet), var(--pb-coral))', color: '#fff', fontSize: 22, fontWeight: 700 }}>P</div>
                  <h2 style={{ margin: 0, fontSize: 26 }}>What do you want to know?</h2>
                  <p className="sec" style={{ marginTop: 8 }}>I answer from what we last saw on the shelf — {d.latest.length} listings across {new Set(d.latest.map((r) => r.platform)).size} platform{new Set(d.latest.map((r) => r.platform)).size > 1 ? 's' : ''} and {new Set(d.latest.map((r) => r.city)).size} cities, captured {d.meta ? fmtIST(d.meta.captured_at) : ''}. Every number comes with the query behind it.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, textAlign: 'left', marginTop: 14 }}>
                    {starters.map((s) => (
                      <button key={s} type="button" onClick={() => ask(s)} style={{ cursor: 'pointer', textAlign: 'left', padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--raised)', color: 'var(--ink)', fontWeight: 600 }}>{s}</button>
                    ))}
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: 12 }}>Saved questions</span>
                    {PROMPTS.slice(4, 6).map((p) => <Button key={p.title} size="small" onClick={() => setText(p.template)}>{p.title}</Button>)}
                    <Button size="small" type="link" onClick={() => setLibOpen(true)}>All {PROMPTS.length} →</Button>
                  </div>
                </div>
              )}
              {cur?.turns.map((t, i) => (
                <div key={`${cur.id}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="chat-bubble user">{t}</div>
                  <AnswerView q={t} ctx={ctx} onCite={setCite} onAsk={(f) => ask(f)} />
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {(cur?.turns.length ? ['What changed since the last capture?', 'Show availability by city', 'Estimated sell-out in the last captures'] : SUGGESTIONS.slice(4, 7)).map((q) => <Button key={q} size="small" onClick={() => ask(q)}>{q}</Button>)}
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 8, background: 'var(--raised)' }}>
                <Input.TextArea value={text} onChange={(e) => setText(e.target.value)} autoSize={{ minRows: 1, maxRows: 5 }} variant="borderless" placeholder="Ask a business question… e.g. Where is Swing out of stock in Mumbai?" aria-label="Ask the Assistant" onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); ask(text); } }} />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button size="small" type="text" onClick={() => setLibOpen(true)}>/ Prompt library</Button>
                  <Dropdown trigger={['click']} menu={{ items: DATASETS.map((x) => ({ key: x.key, label: <div><b>{x.label}</b><div className="muted" style={{ fontSize: 12 }}>{x.hint}</div></div> })), onClick: ({ key }) => { patchCur({ dataset: key }); message.success(`Grounded in ${DATASETS.find((x) => x.key === key)?.label}`); } }}>
                    <Button size="small" type="text">@ Dataset</Button>
                  </Dropdown>
                  <Button size="small" type="text" icon={<PaperClipOutlined />} onClick={() => fileRef.current?.click()}>Attach</Button>
                  <input ref={fileRef} type="file" hidden aria-label="Attach a file" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setAttached((a) => [...a, f.name]); message.info(`${f.name} attached — the capture is still the only data I answer from`); } e.target.value = ''; }} />
                  {attached.map((a) => <Tag key={a} closable onClose={() => setAttached((x) => x.filter((y) => y !== a))}>{a}</Tag>)}
                  <span style={{ flex: 1 }} />
                  <Button type="primary" shape="circle" aria-label="Send" icon={<SendOutlined />} disabled={!text.trim()} onClick={() => ask(text)} />
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Drawer open={convOpen} onClose={() => setConvOpen(false)} placement="left" width={300} title="Conversations">{sidebar}</Drawer>
      <RowsDrawer spec={drawerSpec} onClose={() => setCite(null)} />

      <Modal open={libOpen} onCancel={() => setLibOpen(false)} footer={null} title={`Prompt library · ${PROMPTS.length}`} width={640}>
        <Input allowClear placeholder="Search saved questions" aria-label="Search prompts" value={libQ} onChange={(e) => setLibQ(e.target.value)} style={{ marginBottom: 12 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
          {libShown.map((p) => (
            <div key={p.title} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: 'var(--raised)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{p.title}</b> <Tag bordered={false}>{p.category}</Tag> {p.output === 'Estimate' && <EstimateTag />}
                <div className="muted" style={{ fontSize: 12.5 }}>{p.template}</div>
              </div>
              <Button size="small" onClick={() => { setText(p.template); setLibOpen(false); message.success('Prompt ready — press send to run it'); }}>Use</Button>
              <Button size="small" type="primary" onClick={() => { ask(p.template); setLibOpen(false); }}>Run</Button>
            </div>
          ))}
          {!libShown.length && <div className="muted">No saved question matches.</div>}
        </div>
      </Modal>

      <ScopeModal open={scopeOpen} onClose={() => setScopeOpen(false)} platforms={scopePlatforms} cities={scopeCities} allPlatforms={fPlat} allCities={fCities} onSave={(p, c) => { patchCur({ platforms: p, cities: c }); setScopeOpen(false); message.success('Scope updated for this conversation'); }} />
    </Gate>
  );
}

function ScopeModal({ open, onClose, platforms, cities, allPlatforms, allCities, onSave }: { open: boolean; onClose: () => void; platforms: string[]; cities: string[]; allPlatforms: string[]; allCities: string[]; onSave: (p: string[], c: string[]) => void }) {
  const [p, setP] = useState<string[]>(platforms);
  const [c, setC] = useState<string[]>(cities);
  useEffect(() => { if (open) { setP(platforms); setC(cities); } }, [open, platforms, cities]);
  return (
    <Modal open={open} onCancel={onClose} title="Change the scope" okText="Apply" onOk={() => onSave(p.length ? p : allPlatforms, c.length ? c : allCities)}>
      <p className="muted">The header filters set what data is loaded. Narrow it further for this conversation.</p>
      <b>Platforms</b>
      <div><Checkbox.Group value={p} onChange={(v) => setP(v as string[])} options={allPlatforms.map((id) => ({ value: id, label: PLATFORMS.find((x) => x.id === id)?.label ?? id }))} /></div>
      <b style={{ display: 'block', marginTop: 12 }}>Cities</b>
      <div><Checkbox.Group value={c} onChange={(v) => setC(v as string[])} options={allCities.map((id) => ({ value: id, label: CITIES.find((x) => x.id === id)?.label ?? id }))} /></div>
      <div className="muted" style={{ marginTop: 12, fontSize: 12 }}><CheckCircleFilled /> Questions that name a city or platform override this scope.</div>
    </Modal>
  );
}

export default function Page() {
  return (
    <>
      <PageHead title="Ask the Assistant" sub="Plain-English questions answered from the shelf capture — every number cites the query behind it" />
      <Suspense fallback={null}>
        <AssistantInner />
      </Suspense>
    </>
  );
}
