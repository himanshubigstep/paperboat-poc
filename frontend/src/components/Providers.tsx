'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getTheme } from '@/theme/antdTheme';

type Mode = 'dark' | 'light';
const ThemeCtx = createContext<{ mode: Mode; toggle: () => void }>({ mode: 'dark', toggle: () => {} });
export const useThemeMode = () => useContext(ThemeCtx);

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('dark');
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } } }));

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pb-theme') as Mode | null;
      if (saved === 'light' || saved === 'dark') setMode(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((m) => {
      const n = m === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('pb-theme', n); } catch {}
      return n;
    });
  }, []);
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);

  return (
    <AntdRegistry>
      <ThemeCtx.Provider value={value}>
        <ConfigProvider theme={getTheme(mode === 'dark')}>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </ConfigProvider>
      </ThemeCtx.Provider>
    </AntdRegistry>
  );
}
