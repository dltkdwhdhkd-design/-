import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "밤의 시민 | 실시간 마피아",
  description: "6~29명이 함께하는 실시간 추리 게임. 클래식 마피아와 이동·미션 현장 수사 모드.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
