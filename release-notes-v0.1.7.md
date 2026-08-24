# WeavePage v0.1.7

## 「页面背景」按钮

编辑功能区 → 字体组末尾新增颜色按钮,**设置当前文档编辑区和预览区的页面背景**。

- 16 个预置浅色(暖白 / 奶白 / 浅米 / 浅灰 / 粉彩 / 薰衣草)
- 写入 head 内嵌 `<style id="weavepage-body-bg">`,`body { background-color: HEX }`
- App.tsx 用 `scopedCss()` 把 `body` 改名为 `.editor-body`,所以**同时影响编辑区与网页预览**
- 设置结果跟随文档保存(写入 `head` 字符串);关闭重开仍在
- 命名块与「设为默认样式」(`weavepage-default-styles`)互不影响,白名单规则不变

## 移除撤销组

Ribbon「撤销」组(撤销 ↩ + 重做 ↪)已整组移除。键盘 `Ctrl+Z` / `Ctrl+Y` 仍可走系统快捷键(由 Tauri WebView 提供)。

## 下载与校验

- **NSIS 安装包**:`WeavePage_0.1.7_x64-setup.exe`
- **SHA256**:`af1febef415d4479dec82fc0188eca1d3302798ffe68176832c8e650dccf367d`

```
certutil -hashfile WeavePage_0.1.7_x64-setup.exe SHA256
```
