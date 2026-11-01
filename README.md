# 我的个人空间

使用 HTML、CSS、JavaScript 编写的响应式个人网站，无框架、无构建步骤、无第三方运行依赖。

## 本地运行

直接用浏览器打开 `index.html`，或在项目目录启动静态服务器：

```bash
cd /workspace/codex-project
python3 -m http.server 8000
```

如果服务器运行在你自己的电脑上，可访问 `http://localhost:8000`。停止服务器按 `Ctrl+C`。

如果服务器运行在 Codex 云端，Windows 浏览器中的 localhost 无法访问它。必须由平台提供端口转发或网页预览地址；当前聊天未提供该功能，单独启动服务器不会产生公网网址。也可以将网站文件下载到本机后直接打开 `index.html`。

## 文件结构

- `index.html`：首页、介绍、项目展示、联系方式及 SEO 基础信息
- `styles.css`：响应式布局、插画、组件样式和减少动态效果设置
- `script.js`：移动端菜单、项目筛选、导航状态和自动年份
- `assets/favicon.svg`：本地图标

## 自定义内容

1. 在 `index.html` 中替换称呼、个人介绍、标题和描述。
2. 替换项目卡片内容；Focus 和灵感手记是明确标注的概念作品，没有在线演示。
3. 当前联系入口指向仓库所有者的 GitHub，可换成自己的 GitHub 或 `mailto:你的邮箱`。
4. 在 `styles.css` 的 `:root` 中调整主题色。
5. 插画全部使用 CSS 绘制，不依赖外部图片、字体或 CDN。

## 检查

```bash
node --check script.js
git diff --check
```

浏览器中检查：手机导航的开关、Escape 关闭菜单、项目筛选（全部 3 个 / 网站 2 个 / 设计 1 个）、锚点导航和 GitHub 链接。建议检查 375px 手机与 1440px 桌面宽度。

## 部署

本项目可直接通过 GitHub Pages 发布，无需构建。仓库为 `tz3558336-gif/codex-project`。

在仓库 Settings → Pages 中选择 **Deploy from a branch**，分支选择 **main**，目录选择 **/ (root)**，然后保存。根目录的 `.nojekyll` 文件让 GitHub 直接发布静态资源。

启用 Pages 并完成部署后，默认网址为 `https://tz3558336-gif.github.io/codex-project/`。该地址只有在 Pages 部署成功后才可访问。个人介绍和部分项目仍为示例。本项目不需要后端或环境变量。
