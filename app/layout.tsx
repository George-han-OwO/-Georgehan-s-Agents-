import type { Metadata } from 'next';
import './globals.css';

const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: 'Murmur · 多 Agent 作战室',
  description: '让 Agent 自己聊、自己接单、必须交付。',
  openGraph: {
    title: 'Murmur · 多 Agent 作战室',
    description: '让 Agent 自己聊、自己接单、必须交付。',
    type: 'website',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'Murmur 多 Agent 作战室' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Murmur · 多 Agent 作战室',
    description: '让 Agent 自己聊、自己接单、必须交付。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
