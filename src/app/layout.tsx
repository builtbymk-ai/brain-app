import type { Metadata } from 'next';
import { Inter, DM_Serif_Display } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-serif-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BRAIN — Business Revenue Assessment & Intelligence Node',
  description:
    'Research the business, uncover the problems, assess the opportunities and implement the solutions with BRAIN.',
  keywords: [
    'business research',
    'business intelligence',
    'opportunity assessment',
    'structured research',
    'BRAIN',
  ],
  openGraph: {
    title: 'BRAIN — Business Revenue Assessment & Intelligence Node',
    description:
      'Research the business, uncover the problems, assess the opportunities and implement the solutions with BRAIN.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
