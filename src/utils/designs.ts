// WeavePage 设计子菜单 — 8 套预设文档样式 + 默认
// 设计 CSS 注入到 shell.head 的 <style data-weavepage-design="X"> 位置
// 用户硬约束:不引入新依赖;不持久化到 localStorage;打开文件时不自动注入
// 8 套 CSS 完整定义在 spec §6.1-6.8(本文件直接复用 spec 文案)

export interface DesignMeta {
  id: string;             // 'classic-academic' / 'modern-minimalist' / ...
  name: string;           // '经典学术' / '现代简约' / ...
  css: string;            // 完整 CSS 字符串(注入到 <head>)
  fontFamily: string;     // 主字体栈(给缩略图渲染用)
  preview: {              // 缩略图卡片调色板(无 CSS 依赖的视觉提示)
    bg: string;
    fg: string;
    accent: string;
  };
}

export const DEFAULT_DESIGN_ID = null;  // "默认"按钮 = null,无 DesignMeta

export const DESIGNS: DesignMeta[] = [
  {
    id: "classic-academic",
    name: "经典学术",
    css: `body { background: #fff; color: #1a1a1a;
       font-family: 'Source Serif Pro', 'Noto Serif SC', serif;
       line-height: 1.8; font-size: 16px; }
h1 { font-size: 2em; font-weight: 700; border-bottom: 3px solid #000; padding-bottom: .2em; }
h2 { font-size: 1.6em; font-weight: 700; border-bottom: 1px solid #000; padding-bottom: .15em; }
h3 { font-size: 1.3em; font-weight: 600; }
h4-h6 { font-weight: 600; }
p { margin: 1em 0; }
a { color: #000; text-decoration: underline; text-decoration-thickness: 1px; }
blockquote { border-left: 4px solid #000; padding: .5em 1em;
             background: #f7f7f7; font-style: italic; }
code { font-family: 'Source Code Pro', monospace; background: #f0f0f0;
       padding: .1em .3em; border-radius: 3px; font-size: .9em; }
pre { font-family: 'Source Code Pro', monospace; background: #f7f7f7;
      border: 1px solid #ddd; padding: 1em; border-radius: 4px; }
kbd { font-family: monospace; background: #eee; border: 1px solid #aaa;
      border-radius: 4px; padding: .1em .4em; box-shadow: 0 1px 0 #aaa; font-size: .85em; }
img { border-radius: 0; box-shadow: none; }
figure { text-align: center; margin: 1.5em 0; }
figcaption { font-size: .85em; color: #555; font-style: italic; }
table { border: 1px solid #000; width: 100%; }
th, td { border: 1px solid #000; padding: .5em; }
thead { background: #f0f0f0; font-weight: 700; }
tr:nth-child(even) { background: #fafafa; }
hr { border: none; border-top: 1px solid #000; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .3em 0; }
.wp-toc-floating-wrap { background: #f7f7f7; border: 1px solid #ccc; font-family: inherit; }
.wp-toc-h2-link { color: #000; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #e8e8e8; }
.wp-toc-h3-submenu { background: #fff; border: 1px solid #ccc; }`,
    fontFamily: "'Source Serif Pro', 'Noto Serif SC', serif",
    preview: { bg: "#ffffff", fg: "#1a1a1a", accent: "#000000" },
  },
  {
    id: "modern-minimalist",
    name: "现代简约",
    css: `body { background: #fff; color: #1f2328;
       font-family: 'Inter', 'Noto Sans SC', -apple-system, sans-serif;
       line-height: 1.75; font-size: 16px; }
h1 { font-size: 2.5em; font-weight: 800; letter-spacing: -0.02em; }
h2 { font-size: 1.8em; font-weight: 700; margin-top: 1.5em; }
h3 { font-size: 1.4em; font-weight: 600; color: #424b56; }
h4-h6 { font-weight: 600; color: #4a5260; }
p { margin: 1em 0; }
a { color: #2563eb; text-decoration: none; border-bottom: 1px solid transparent;
    transition: border-color .2s; }
a:hover { border-bottom-color: #2563eb; }
blockquote { border-left: 3px solid #e5e7eb; padding: .5em 1.2em;
             color: #4b5563; font-style: normal; }
code { font-family: 'JetBrains Mono', monospace; background: #f3f4f6;
       padding: .15em .35em; border-radius: 4px; font-size: .88em;
       color: #2563eb; }
pre { font-family: 'JetBrains Mono', monospace; background: #f9fafb;
      border: 1px solid #e5e7eb; padding: 1.2em; border-radius: 8px;
      font-size: .9em; }
kbd { font-family: monospace; background: #fff; border: 1px solid #d1d5db;
      border-bottom-width: 2px; border-radius: 4px;
      padding: .1em .4em; font-size: .85em; }
img { border-radius: 8px; }
figure { text-align: center; margin: 2em 0; }
figcaption { font-size: .85em; color: #6b7280; margin-top: .5em; }
table { border: none; width: 100%; }
th, td { border-bottom: 1px solid #e5e7eb; padding: .8em; text-align: left; }
thead th { font-weight: 600; color: #1f2328; }
tr:nth-child(even) { background: transparent; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 2.5em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .4em 0; }
.wp-toc-floating-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
                font-family: inherit; }
.wp-toc-h2-link { color: #1f2328; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #f3f4f6; }
.wp-toc-h3-submenu { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }`,
    fontFamily: "Inter, 'Noto Sans SC', -apple-system, sans-serif",
    preview: { bg: "#ffffff", fg: "#1f2328", accent: "#2563eb" },
  },
  {
    id: "literary-scroll",
    name: "文艺书卷",
    css: `body { background: #f5efe0; color: #3b2f1e;
       font-family: 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', serif;
       line-height: 1.95; font-size: 17px; }
h1 { font-size: 2.2em; font-weight: 600; color: #5c3a1e;
     text-align: center; padding: .5em 0;
     border-top: 2px solid #b48a4a; border-bottom: 2px solid #b48a4a; }
h2 { font-size: 1.6em; font-weight: 600; color: #5c3a1e;
     border-left: 6px solid #b48a4a; padding-left: 14px; margin-left: 0; }
h3 { font-size: 1.3em; font-weight: 600; color: #6e4a25; }
h4-h6 { font-weight: 600; color: #6e4a25; }
p { margin: 1.2em 0; text-align: justify; }
a { color: #8b4513; text-decoration: none; border-bottom: 1px dotted #b48a4a; }
blockquote { border-left: 3px solid #b48a4a; padding: .5em 1.2em;
             background: rgba(180, 138, 74, .08); color: #5c3a1e;
             font-style: italic; }
code { font-family: 'Source Code Pro', monospace; background: #ebe3cf;
       padding: .1em .3em; border-radius: 2px; font-size: .9em;
       color: #5c3a1e; }
pre { font-family: 'Source Code Pro', monospace; background: #ebe3cf;
      border: 1px solid #c9b88e; padding: 1em; border-radius: 4px; }
kbd { font-family: monospace; background: #ebe3cf; border: 1px solid #b48a4a;
      border-radius: 4px; padding: .1em .4em; font-size: .85em;
      color: #5c3a1e; }
img { border: 1px solid #c9b88e; border-radius: 2px; }
figure { text-align: center; margin: 1.8em 0; }
figcaption { font-size: .85em; color: #8b6a45; font-style: italic; margin-top: .5em; }
table { border: 1px solid #b48a4a; width: 100%; background: #fdf8eb; }
th, td { border: 1px solid #c9b88e; padding: .6em; }
thead { background: #ebe3cf; font-weight: 700; color: #5c3a1e; }
tr:nth-child(even) { background: #f7f1de; }
hr { border: none; border-top: 1px dashed #b48a4a; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .4em 0; }
.wp-toc-floating-wrap { background: #fdf8eb; border: 1px solid #c9b88e; font-family: inherit; }
.wp-toc-h2-link { color: #5c3a1e; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #ebe3cf; }
.wp-toc-h3-submenu { background: #fdf8eb; border: 1px solid #c9b88e; }`,
    fontFamily: "'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', serif",
    preview: { bg: "#f5efe0", fg: "#3b2f1e", accent: "#b48a4a" },
  },
  {
    id: "tech-dark",
    name: "科技感",
    css: `body { background: #0d1117; color: #c9d1d9;
       font-family: 'JetBrains Mono', 'Inter', -apple-system, sans-serif;
       line-height: 1.7; font-size: 15px; }
h1 { font-size: 2.2em; font-weight: 700; color: #58a6ff;
     text-shadow: 0 0 12px rgba(88, 166, 255, .3); }
h2 { font-size: 1.6em; font-weight: 600; color: #79c0ff;
     border-bottom: 1px solid rgba(88, 166, 255, .3); padding-bottom: .2em; }
h3 { font-size: 1.3em; font-weight: 600; color: #a5d6ff; }
h4-h6 { font-weight: 600; color: #8b949e; }
p { margin: 1em 0; }
a { color: #58a6ff; text-decoration: none;
    border-bottom: 1px solid rgba(88, 166, 255, .4); }
a:hover { color: #79c0ff; border-bottom-color: #79c0ff; }
blockquote { border-left: 3px solid #58a6ff; padding: .5em 1.2em;
             background: rgba(88, 166, 255, .08); color: #8b949e; }
code { font-family: 'JetBrains Mono', monospace; background: rgba(110, 118, 129, .15);
       padding: .15em .4em; border-radius: 4px; font-size: .88em;
       color: #79c0ff; }
pre { font-family: 'JetBrains Mono', monospace;
      background: rgba(110, 118, 129, .1); border: 1px solid #30363d;
      padding: 1em; border-radius: 6px; font-size: .88em; }
kbd { font-family: monospace; background: rgba(110, 118, 129, .2);
      border: 1px solid #30363d; border-bottom-width: 2px;
      border-radius: 4px; padding: .1em .4em; font-size: .85em;
      color: #c9d1d9; }
img { border-radius: 6px; border: 1px solid #30363d; }
figure { text-align: center; margin: 2em 0; }
figcaption { font-size: .85em; color: #8b949e; margin-top: .5em; }
table { border: 1px solid #30363d; width: 100%; }
th, td { border: 1px solid #30363d; padding: .6em; }
thead { background: rgba(88, 166, 255, .1); color: #58a6ff; font-weight: 700; }
tr:nth-child(even) { background: rgba(110, 118, 129, .05); }
hr { border: none; border-top: 1px solid #30363d; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .4em 0; }
.wp-toc-floating-wrap { background: rgba(110, 118, 129, .1); border: 1px solid #30363d;
                font-family: inherit; border-radius: 6px; }
.wp-toc-h2-link { color: #58a6ff; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: rgba(88, 166, 255, .15); }
.wp-toc-h3-submenu { background: #161b22; border: 1px solid #30363d; }`,
    fontFamily: "'JetBrains Mono', Inter, -apple-system, sans-serif",
    preview: { bg: "#0d1117", fg: "#c9d1d9", accent: "#58a6ff" },
  },
  {
    id: "business-formal",
    name: "商务正式",
    css: `body { background: #f4f6fa; color: #1a2540;
       font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
       line-height: 1.75; font-size: 16px; }
h1 { font-size: 2.2em; font-weight: 700; color: #1f3a68;
     border-bottom: 3px solid #1f3a68; padding-bottom: .25em; }
h2 { font-size: 1.6em; font-weight: 700; color: #1f3a68; }
h3 { font-size: 1.3em; font-weight: 600; color: #2c5282; }
h4-h6 { font-weight: 600; color: #2d3748; }
p { margin: 1em 0; }
a { color: #1f3a68; text-decoration: underline; text-decoration-thickness: 1px; }
blockquote { border-left: 4px solid #1f3a68; padding: .5em 1.2em;
             background: #e8edf5; color: #1a2540; }
code { font-family: 'JetBrains Mono', monospace; background: #e8edf5;
       padding: .15em .35em; border-radius: 3px; font-size: .88em;
       color: #1f3a68; }
pre { font-family: 'JetBrains Mono', monospace; background: #1a2540;
      border: 1px solid #1f3a68; padding: 1em; border-radius: 4px;
      color: #c9d1d9; font-size: .88em; }
kbd { font-family: monospace; background: #fff; border: 1px solid #cbd5e0;
      border-bottom-width: 2px; border-radius: 4px;
      padding: .1em .4em; font-size: .85em; color: #1a2540; }
img { border: 1px solid #cbd5e0; border-radius: 4px; }
figure { text-align: center; margin: 1.5em 0; }
figcaption { font-size: .85em; color: #4a5568; margin-top: .5em; }
table { border: 1px solid #cbd5e0; width: 100%; background: #fff; }
th, td { border: 1px solid #cbd5e0; padding: .7em; }
thead { background: #1f3a68; color: #fff; font-weight: 700; }
tr:nth-child(even) { background: #f4f6fa; }
hr { border: none; border-top: 2px solid #cbd5e0; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .3em 0; }
.wp-toc-floating-wrap { background: #fff; border: 1px solid #cbd5e0;
                font-family: inherit; border-radius: 4px; }
.wp-toc-h2-link { color: #1f3a68; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #e8edf5; }
.wp-toc-h3-submenu { background: #fff; border: 1px solid #cbd5e0; }`,
    fontFamily: "Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    preview: { bg: "#f4f6fa", fg: "#1a2540", accent: "#1f3a68" },
  },
  {
    id: "soft-elegant",
    name: "柔雅",
    css: `body { background: #faf3ee; color: #5c3a2e;
       font-family: 'Cormorant Garamond', 'Noto Serif SC', 'Songti SC', serif;
       line-height: 1.85; font-size: 16px; }
h1 { font-size: 2.2em; font-weight: 600; color: #b06a5c;
     text-align: center; font-style: italic; }
h2 { font-size: 1.5em; font-weight: 600; color: #b06a5c;
     border-radius: 10px; padding: .4em 1em; margin: 1.2em 0;
     background: rgba(176, 106, 92, .08);
     border: 1px solid rgba(176, 106, 92, .2); display: inline-block; }
h3 { font-size: 1.25em; font-weight: 600; color: #c08577; font-style: italic; }
h4-h6 { font-weight: 600; color: #c08577; }
p { margin: 1em 0; }
a { color: #b06a5c; text-decoration: none; border-bottom: 1px solid #d4a39a; }
blockquote { border-left: 3px solid #d4a39a; padding: .6em 1.2em;
             background: rgba(212, 163, 154, .12); color: #5c3a2e;
             border-radius: 0 12px 12px 0; font-style: italic; }
code { font-family: monospace; background: #f3e8e2;
       padding: .15em .35em; border-radius: 6px; font-size: .88em;
       color: #b06a5c; }
pre { font-family: monospace; background: #fff; border: 1px solid #e8d4cb;
      padding: 1em; border-radius: 12px; font-size: .88em; color: #5c3a2e; }
kbd { font-family: monospace; background: #fff; border: 1px solid #d4a39a;
      border-radius: 6px; padding: .1em .4em; font-size: .85em;
      color: #5c3a2e; }
img { border-radius: 16px; }
figure { text-align: center; margin: 1.8em 0; }
figcaption { font-size: .85em; color: #b06a5c; font-style: italic; margin-top: .5em; }
table { border: none; width: 100%; background: #fff; border-radius: 12px;
        border-collapse: separate; border-spacing: 0;
        box-shadow: 0 2px 8px rgba(176, 106, 92, .1); overflow: hidden; }
th, td { padding: .8em 1em; text-align: left; }
thead { background: #f3e8e2; color: #b06a5c; font-weight: 700; }
tr:nth-child(even) { background: #faf3ee; }
hr { border: none; border-top: 1px solid #e8d4cb; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .4em 0; }
.wp-toc-floating-wrap { background: #fff; border: 1px solid #e8d4cb;
                font-family: inherit; border-radius: 16px; }
.wp-toc-h2-link { color: #b06a5c; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #f3e8e2; }
.wp-toc-h3-submenu { background: #fff; border: 1px solid #e8d4cb; border-radius: 12px; }`,
    fontFamily: "'Cormorant Garamond', 'Noto Serif SC', 'Songti SC', serif",
    preview: { bg: "#faf3ee", fg: "#5c3a2e", accent: "#b06a5c" },
  },
  {
    id: "mint-fresh",
    name: "薄荷清新",
    css: `body { background: #eaf6ef; color: #1f3d2c;
       font-family: 'Nunito', 'Noto Sans SC', -apple-system, sans-serif;
       line-height: 1.75; font-size: 16px; }
h1 { font-size: 2.2em; font-weight: 700; color: #2c8a6b; }
h2 { font-size: 1.6em; font-weight: 700; color: #2c8a6b;
     position: relative; padding-left: 1em; }
h2::before { content: '🌿'; position: absolute; left: 0; font-size: .8em; }
h3 { font-size: 1.3em; font-weight: 600; color: #3aa17e; }
h4-h6 { font-weight: 600; color: #3aa17e; }
p { margin: 1em 0; }
a { color: #2c8a6b; text-decoration: none; border-bottom: 2px dotted #3aa17e; }
blockquote { border-left: 4px solid #3aa17e; padding: .5em 1.2em;
             background: rgba(58, 161, 126, .08); color: #1f3d2c;
             border-radius: 0 8px 8px 0; }
code { font-family: 'JetBrains Mono', monospace; background: #d8efe2;
       padding: .15em .35em; border-radius: 4px; font-size: .88em;
       color: #2c8a6b; }
pre { font-family: 'JetBrains Mono', monospace; background: #fff;
      border: 1px solid #b8e0c9; padding: 1em; border-radius: 8px;
      font-size: .88em; }
kbd { font-family: monospace; background: #fff; border: 1px solid #b8e0c9;
      border-bottom-width: 2px; border-radius: 4px;
      padding: .1em .4em; font-size: .85em; color: #1f3d2c; }
img { border-radius: 12px; }
figure { text-align: center; margin: 1.8em 0; }
figcaption { font-size: .85em; color: #3aa17e; margin-top: .5em; }
table { border: 1px solid #b8e0c9; width: 100%; background: #fff; border-radius: 8px; }
th, td { border: 1px solid #d8efe2; padding: .6em; }
thead { background: #d8efe2; color: #1f3d2c; font-weight: 700; }
tr:nth-child(even) { background: #f4fbf7; }
hr { border: none; border-top: 1px solid #b8e0c9; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .4em 0; }
.wp-toc-floating-wrap { background: #fff; border: 1px solid #b8e0c9;
                font-family: inherit; border-radius: 12px; }
.wp-toc-h2-link { color: #2c8a6b; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #d8efe2; }
.wp-toc-h3-submenu { background: #fff; border: 1px solid #b8e0c9; border-radius: 8px; }`,
    fontFamily: "'Nunito', 'Noto Sans SC', -apple-system, sans-serif",
    preview: { bg: "#eaf6ef", fg: "#1f3d2c", accent: "#2c8a6b" },
  },
  {
    id: "vintage-print",
    name: "复古印刷",
    css: `body { background: #d9c9a8; color: #3a2f1d;
       font-family: 'Old Standard TT', 'Noto Serif SC', 'Songti SC', serif;
       line-height: 1.85; font-size: 16px;
       background-image:
         repeating-linear-gradient(0deg, transparent 0, transparent 23px,
                                 rgba(58, 47, 29, .04) 23px, rgba(58, 47, 29, .04) 24px); }
h1 { font-size: 2.4em; font-weight: 700; color: #3a2f1d;
     letter-spacing: .15em; text-transform: uppercase;
     text-align: center; padding: .3em 0;
     border: 3px double #3a2f1d; border-left: none; border-right: none; }
h2 { font-size: 1.6em; font-weight: 700; color: #3a2f1d;
     border-bottom: 1px solid #3a2f1d; padding-bottom: .15em; }
h3 { font-size: 1.3em; font-weight: 600; color: #3a2f1d; font-style: italic; }
h4-h6 { font-weight: 600; color: #3a2f1d; }
p { margin: 1em 0; text-align: justify; }
a { color: #3a2f1d; text-decoration: underline; text-decoration-style: double; }
blockquote { border: 2px solid #3a2f1d; padding: .6em 1.2em;
             background: rgba(217, 201, 168, .5); color: #3a2f1d;
             font-style: italic; }
code { font-family: 'Courier Prime', monospace; background: rgba(58, 47, 29, .08);
       padding: .1em .3em; border-radius: 0; font-size: .88em; }
pre { font-family: 'Courier Prime', monospace; background: rgba(58, 47, 29, .04);
      border: 1px solid #3a2f1d; padding: 1em;
      font-size: .88em; }
kbd { font-family: monospace; background: #d9c9a8; border: 2px solid #3a2f1d;
      padding: .1em .4em; font-size: .85em; color: #3a2f1d;
      box-shadow: 2px 2px 0 #3a2f1d; }
img { border: 2px solid #3a2f1d; filter: sepia(.15) contrast(.95); }
figure { text-align: center; margin: 1.5em 0; }
figcaption { font-size: .85em; color: #3a2f1d; font-style: italic;
             letter-spacing: .05em; margin-top: .5em; }
table { border: 2px solid #3a2f1d; width: 100%; background: #d9c9a8; }
th, td { border: 1px solid #3a2f1d; padding: .5em; }
thead { background: rgba(58, 47, 29, .15); font-weight: 700; text-transform: uppercase;
       letter-spacing: .05em; }
tr:nth-child(even) { background: rgba(58, 47, 29, .06); }
hr { border: none; border-top: 3px double #3a2f1d; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .3em 0; }
.wp-toc-floating-wrap { background: rgba(58, 47, 29, .04); border: 1px solid #3a2f1d;
                font-family: inherit; }
.wp-toc-h2-link { color: #3a2f1d; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: rgba(58, 47, 29, .1); }
.wp-toc-h3-submenu { background: #d9c9a8; border: 1px solid #3a2f1d; }`,
    fontFamily: "'Old Standard TT', 'Noto Serif SC', 'Songti SC', serif",
    preview: { bg: "#d9c9a8", fg: "#3a2f1d", accent: "#3a2f1d" },
  },
];

export function getDesignById(id: string | null): DesignMeta | null {
  if (id === null) return null;
  return DESIGNS.find((d) => d.id === id) ?? null;
}

// 移除 shell.head 中所有 <style data-weavepage-design>...</style>
// 注入位置:若 <style id="wp-toc-style"> 存在 → 插在它后面
//          否则 → 插在 </head> 之前
export function applyDesignToShellHead(
  head: string,
  id: string | null,
  css: string | null
): string {
  let next = head.replace(
    /<style[^>]*data-weavepage-design[^>]*>[\s\S]*?<\/style>/g,
    ""
  );
  if (id === null || css === null) return next;
  const styleTag = `<style data-weavepage-design="${id}">\n${css}\n</style>`;
  const tocMatch = next.match(
    /(<style\s+id="wp-toc-style"[^>]*>[\s\S]*?<\/style>)/
  );
  if (tocMatch) {
    return next.replace(tocMatch[1], `${tocMatch[1]}\n${styleTag}`);
  }
  // 兜底:没找到 toc style → 插到 </head> 之前
  return next.replace("</head>", `${styleTag}\n</head>`);
}

// 从 shell.head 解析当前设计 id(取第一个 data-weavepage-design 的 value)
export function parseDesignId(head: string): string | null {
  const m = head.match(/<style[^>]*data-weavepage-design="([^"]+)"/);
  return m ? m[1] : null;
}
