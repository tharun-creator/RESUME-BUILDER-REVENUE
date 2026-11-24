import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ATS Resume Score Checker',
  description: 'Check your ATS score, find keyword gaps, and get actionable resume fixes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-content items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-semibold text-gray-900 no-underline">ATS Checker</Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/pricing">Pricing</Link>
              <Link href="/upload" className="rounded-md bg-accent-600 px-3 py-2 text-white no-underline hover:bg-accent-700 hover:text-white">Check your ATS score free</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-content px-4 py-10">{children}</main>
        <footer className="border-t bg-white py-8 text-sm text-gray-600">
          <div className="mx-auto max-w-content px-4 flex justify-between gap-4 flex-wrap">
            <span>© {new Date().getFullYear()} ATS Resume Score Checker</span>
            <span>Privacy-first: resumes handled securely, never sold.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
