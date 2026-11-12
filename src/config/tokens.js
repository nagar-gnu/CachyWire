/**
 * CachyWire 0.1.0-alpha - Design Tokens & Visual Specifications
 * Extracted directly from Chapter 3 (UI/UX Reverse Engineering, Table 3-1)
 */

export const THEME_DARK = {
  bgPrimary: '#12161F',
  surfaceCard: '#1B202B',
  hoverActive: '#252C3B',
  borderDivider: '#2A3142',
  primaryAccent: '#00C2FF',
  primaryAccentAlt: '#00A8E8',
  inbound: '#00D4B2',       // Turquoise / Cyan (Download)
  outbound: '#FF9F43',      // Vivid Orange (Upload)
  outboundAlt: '#A55EEA',   // Purple variant
  dangerBlocked: '#FF4757', // Flame red (Blocked / Critical Alert)
  warningMedium: '#FFA502', // Orange-amber (Warning / Medium Score)
  safeAllowed: '#2ED573',   // Neon green (Safe / Allowed / Online)
  textPrimary: '#FFFFFF',
  textPrimaryAlt: '#EAECEF',
  textSecondary: '#8A94A6'  // Slate muted text
};

export const THEME_LIGHT = {
  bgPrimary: '#F4F6F9',
  surfaceCard: '#FFFFFF',
  hoverActive: '#EBF0F5',
  borderDivider: '#DCE1E7',
  primaryAccent: '#0077B6',
  primaryAccentAlt: '#0096C7',
  inbound: '#009688',
  outbound: '#E67E22',
  outboundAlt: '#8E44AD',
  dangerBlocked: '#D63031',
  warningMedium: '#F39C12',
  safeAllowed: '#27AE60',
  textPrimary: '#1E272E',
  textPrimaryAlt: '#2D3436',
  textSecondary: '#636E72'
};

export const TYPOGRAPHY = {
  fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, "Roboto", "Inter", sans-serif',
  fontFamilyMono: 'Consolas, "Cascadia Code", "Courier New", monospace',
  sizes: {
    largeTitle: '22px',
    sectionHeader: '14px',
    tableText: '13px',
    secondaryText: '11px',
    micro: '10px'
  },
  weights: {
    regular: 400,
    medium: 500,
    semiBold: 600,
    bold: 700
  }
};

export const DIMENSIONS = {
  minWindowWidth: 960,
  minWindowHeight: 640,
  defaultWindowWidth: 1200,
  defaultWindowHeight: 760,
  headerHeight: 44,
  sidebarWidth: 200,
  sidebarCollapsedWidth: 68,
  canvasHeightPercent: 55,
  panelsHeightPercent: 35,
  filterToolbarHeight: 48,
  firewallControlBarHeight: 56,
  tableHeaderHeight: 36,
  tableRowHeight: 48,
  lanRowHeight: 52,
  alertCardMinHeight: 64,
  alertCardMaxHeight: 96
};
