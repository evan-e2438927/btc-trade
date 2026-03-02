import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTC 模拟交易 - Demo",
  description: "BTC/USDT 模拟现货交易平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-gray-950 text-white overflow-hidden">
        {children}
      </body>
    </html>
  );
}
