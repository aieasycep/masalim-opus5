import type { Metadata } from 'next';
import { themeStyle } from '../src/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Masalım Konsol',
  description: 'Masalım operatör konsolu',
  robots: { index: false, follow: false },
};

/**
 * The console's shell.
 *
 * `robots: noindex` because nothing here should ever appear in a search result,
 * and the palette is applied at the root so every page inherits the product's
 * colours without importing anything.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" style={themeStyle}>
      <body>{children}</body>
    </html>
  );
}
