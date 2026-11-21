import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import ThemeProvider from './ThemeProvider';
import { DarkModeToggle } from '@/components/DarkModeToggle';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SplitSave',
  description: 'Smart food-order cost-optimization engine',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f1f5f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

/**
 * Applies the persisted theme before first paint. Without this the server
 * renders the default light palette and the page flashes on every reload.
 */
const themeInitScript = `(function(){try{var raw=localStorage.getItem('splitsave-theme');var isDark=raw?(JSON.parse(raw).state.isDark!==false):true;document.documentElement.classList.toggle('dark',isDark);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-app-bg text-app-fg">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeProvider>
          <header className="glass mx-4 mt-4 flex items-center justify-between rounded-xl p-4">
            <h1 className="text-2xl font-bold">SplitSave</h1>
            <DarkModeToggle />
          </header>
          <main className="flex-1 p-4">{children}</main>
          <footer className="p-4 text-center text-sm text-app-muted">
            &copy; {new Date().getFullYear()} SplitSave
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
