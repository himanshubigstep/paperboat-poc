import { theme as antd, type ThemeConfig } from 'antd';

/** Gen Z palette — single source for Ant Design + charts. CSS-variable twins live in globals.css. */
export const palette = {
  violet: '#7C5CFF',
  violetDark: '#9B85FF',
  lime: '#C8F560',
  coral: '#FF6B6B',
  mint: '#2DE1C2',
  sunset: '#FF9F43',
  sky: '#4CC9F0',
  pink: '#F15BB5',
  slate: '#8B8FA3',
};
export const series = [palette.violet, palette.lime, palette.coral, palette.sky, palette.sunset, palette.mint, palette.pink, palette.slate];
export const cityColor = { Delhi: palette.violet, Mumbai: palette.sunset } as const;

/** Stable colour per series name: known cities / platforms keep their colour everywhere, others cycle. */
const FIXED: Record<string, string> = {
  Delhi: palette.violet, Mumbai: palette.sunset, Bengaluru: palette.sky, Hyderabad: palette.pink, Chennai: palette.mint,
  Blinkit: '#F8CB46', Zepto: palette.violet, 'Swiggy Instamart': palette.sunset, BigBasket: palette.sky, 'Flipkart Minutes': palette.mint,
  'Amazon Now': palette.pink, JioMart: palette.coral, DMart: palette.slate, FirstClub: palette.lime,
  Buyable: palette.mint, 'Out of stock': palette.coral, 'Not listed': palette.slate, Units: palette.violet, Revenue: palette.lime,
  'Paper Boat': palette.violet,
};
export function colorFor(name: string, index = 0) {
  return FIXED[name] ?? series[index % series.length];
}
export function colorScale(domain: string[]) {
  let i = 0;
  const range = domain.map((d) => (FIXED[d] ? FIXED[d] : series[i++ % series.length]));
  return { domain, range };
}

const font = 'var(--font-body), "Plus Jakarta Sans", system-ui, sans-serif';

const common: ThemeConfig['token'] = {
  fontFamily: font,
  borderRadius: 12,
  borderRadiusLG: 16,
  borderRadiusSM: 8,
  fontSize: 14,
  controlHeight: 38,
  wireframe: false,
  motionDurationMid: '0.2s',
};

export function getTheme(dark: boolean): ThemeConfig {
  return {
    algorithm: dark ? antd.darkAlgorithm : antd.defaultAlgorithm,
    token: dark
      ? { ...common, colorPrimary: palette.violetDark, colorBgBase: '#0E0E13', colorBgContainer: '#16161D', colorBgElevated: '#1E1E28', colorBgLayout: '#0E0E13', colorBorder: 'rgba(255,255,255,0.10)', colorBorderSecondary: 'rgba(255,255,255,0.07)', colorSuccess: palette.mint, colorError: palette.coral, colorWarning: palette.sunset, colorInfo: palette.sky, colorTextBase: '#F3F2F8' }
      : { ...common, colorPrimary: palette.violet, colorBgBase: '#FFFFFF', colorBgContainer: '#FFFFFF', colorBgLayout: '#F7F6FB', colorBorder: 'rgba(20,20,40,0.10)', colorBorderSecondary: 'rgba(20,20,40,0.07)', colorSuccess: '#12B886', colorError: '#F0506E', colorWarning: '#F08A24', colorInfo: '#2B9BD6', colorTextBase: '#17172B' },
    components: {
      Layout: { siderBg: 'transparent', headerBg: 'transparent', bodyBg: 'transparent', headerPadding: '0 24px', footerBg: 'transparent' },
      Card: { borderRadiusLG: 20, paddingLG: 20, headerFontSize: 16 },
      Menu: { itemBorderRadius: 12, itemHeight: 42, itemMarginInline: 4, itemSelectedBg: dark ? 'rgba(155,133,255,0.16)' : 'rgba(124,92,255,0.10)', itemSelectedColor: dark ? '#C9BDFF' : '#5B3FE0', activeBarBorderWidth: 0, itemBg: 'transparent', subMenuItemBg: 'transparent' },
      Table: { headerBg: 'transparent', headerBorderRadius: 12, borderColor: dark ? 'rgba(255,255,255,0.07)' : 'rgba(20,20,40,0.07)', rowHoverBg: dark ? 'rgba(155,133,255,0.07)' : 'rgba(124,92,255,0.05)', cellPaddingBlock: 12 },
      Button: { primaryShadow: 'none', fontWeight: 600 },
      Tag: { borderRadiusSM: 999 },
      Segmented: { trackBg: dark ? 'rgba(255,255,255,0.06)' : 'rgba(20,20,40,0.05)', itemSelectedBg: dark ? '#2A2A38' : '#FFFFFF' },
      Tabs: { itemSelectedColor: dark ? '#C9BDFF' : '#5B3FE0', inkBarColor: palette.violet },
    },
  };
}
