# WeavePage v0.1.9

## 段间距控件加 hint 文字

Ribbon「段落」组里 行距 / 段前 / 段后 三个 SelectControl 控件下方新增小字标签(`行距` / `段前` / `段后`),同时外层 `title` 属性给出完整描述(行间距倍数 / 段前空白 / 段后空白)。

修复 v0.1.7 用户反馈:控件区分不出作用,只能看 title tooltip。

## 页面背景按钮加 label

字体组三个颜色按钮(文字颜色 / 高亮 / 页面背景)之前长得完全一样(都是色块 swatch),用户难以区分。

修复:`ColorPicker` 加可选 `label` prop,文字(目前「背景」)叠加到 swatch 中央。深/浅色背景都可读(text-shadow + mix-blend-mode)。

## 下载与校验

- **NSIS 安装包**:`WeavePage_0.1.9_x64-setup.exe`
- **SHA256**:`c51e96f9e139a8cb709d57e7d5ed238b4a1a14674fa5af556fc5e2447f647857`

```
certutil -hashfile WeavePage_0.1.9_x64-setup.exe SHA256
```

## 升级到 v0.1.9 后的视觉

- 编辑功能区 / 段落组末尾附近,会看到三组控件,每组下方有 10px 灰色小字提示
- 「高亮」按钮右侧多一个色块 swatch,**中央白色文字「背景」**,点击弹出 16 色浅色色盘
- 其它 swatch 不带 label,所以一眼能区分

## v0.1.7 → v0.1.8 增量(若你还没装)

- in-app 升级改为 streaming 下载(失败不再是 Failed to fetch)
- 进度 overlay 自动显示
- 下载完成自动关主窗口让 NSIS 安装顺利
