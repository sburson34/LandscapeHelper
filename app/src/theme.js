// Light theme palette (kept as default export so legacy `import theme from '../theme'` still works)
const light = {
  primary: '#2E7D32', // Forest Green
  secondary: '#5D4037', // Earthy Brown
  accent: '#C0CA33', // Lime/Sapling
  background: '#F1F8E9', // Very light green
  surface: '#FFFFFF',
  text: '#1B5E20', // Dark Green
  textSecondary: '#6D4C41',
  success: '#4CAF50',
  warning: '#FBC02D',
  danger: '#D84315',
  border: '#C8E6C9',
  shadow: '#000000',
};

const dark = {
  primary: '#81C784', // Muted Green
  secondary: '#8D6E63', // Muted Brown
  accent: '#DCE775', // Muted Lime
  background: '#1B2E1C', // Dark Forest
  surface: '#2C3E2D', // Deep Leaf
  text: '#E8F5E9', // Lightest Green
  textSecondary: '#BCAAA4',
  success: '#66BB6A',
  warning: '#FFF176',
  danger: '#FF7043',
  border: '#388E3C',
  shadow: '#000000',
};

const shared = {
  roundness: { small: 8, medium: 16, large: 24, full: 999 },
  spacing: { xs: 4, s: 8, m: 16, l: 24, xl: 32 },
  fonts: { regular: 'System', bold: 'System' },
};

export const lightTheme = { colors: light, ...shared };
export const darkTheme = { colors: dark, ...shared };

// Default export = light theme. Legacy screens import this directly.
const theme = lightTheme;
export default theme;
