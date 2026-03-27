/**
 * layout.tsx — 根布局组件（Next.js App Router）
 *
 * 所有页面共享该布局，设置全局元数据、字体和基础样式。
 * overflow-hidden 防止页面整体出现双滚动条。
 */
import type { Metadata } from "next";
import "./globals.css";

// 页面 <title> 和 SEO 描述
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
      {/* antialiased: 字体抗锯齿；bg-black: 纯黑背景；overflow-hidden: 禁止页面滚动条 */}
      <body className="antialiased bg-black text-white overflow-hidden">
        {children}
      </body>
    </html>
  );
}
