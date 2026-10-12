# Sofatap 官网

Sofatap 的公开网站：移动优先的静态页面，英文为默认语言（`index.html`），中文版在 `zh/`。页面采用产品选定的「暮色薄荷 / Mint Calm」配色。纯 HTML/CSS/JS，构建脚本只用 Node.js 内置模块，没有依赖。

品牌名统一写作 **Sofatap**（一个词，只有 S 大写）；中文页可用市场名提案「沙发瘫」作辅助。`SofaTap` 只出现在发行包文件名等兼容标识中。

产品源码在 [chekusu/sofatap](https://github.com/chekusu/sofatap)。页面上的产品说明依据该仓库提交 [`861367ae901c1c0326f445c0807d26b2af38b780`](https://github.com/chekusu/sofatap/tree/861367ae901c1c0326f445c0807d26b2af38b780)（2026-10-12 核对）及其已发布的 GitHub Releases。产品有变化时，先核对新的提交再改文案：

- 当前 `main` 上的单屏触控、应用内语音、自动弹出键盘和新版接收端窗口属于开发版本，页面上明确标为「开发中」，并说明下载的旧 alpha 版不含这些更新。
- Windows / Mac 下载来自 `v0.3.0-alpha`，Linux 来自 `v0.4.0-alpha`；iPhone App 暂无已确认的公开安装入口。
- 未实现或尚待验证的方向（如 Windows 锁屏 PIN、Face ID、语音代操电脑）不出现在页面上。

## 命令

需要 Node.js 18 或更高版本，不需要 `npm install`。

```sh
npm run build     # 生成 dist/（dist/index.html 英文，dist/zh/index.html 中文）
npm test          # 单元测试：下载配置、发行包数据、构建输出、语言文件、预览服务器
npm run check     # 构建到临时目录并做静态检查（两种语言的结构、链接、资源、图片标注、文案限制、配色对比度）
npm run verify    # test + check
npm run preview   # 在 http://127.0.0.1:4173/ 预览 dist/
```

预览服务器只监听本机回环地址。端口被占用时可指定其他端口，`--port 0` 会自动选择空闲端口；`--base` 可模拟挂载在子路径下，例如：

```sh
npm run preview -- --port 0 --base /sofatap/
```

页面内所有资源和链接都是相对路径，部署在根路径或 `/sofatap/` 这样的子路径下都能工作。目录地址缺少结尾斜杠时（如 `/sofatap/zh`），预览服务器会重定向到 `/sofatap/zh/`，静态托管也应保持同样行为。

`.github/workflows/ci.yml` 在 push 和手动触发时，用 Node 18 和 22 运行 `npm run verify` 和 `npm run build`。它不使用任何密钥，也不发布网站。

## 文案和语言

页面模板只有一份：`src/index.html`。文案在 `src/i18n/en.json` 和 `src/i18n/zh-CN.json`：

- 模板中的 `{{t:键}}` 原样插入文案，`{{a:键}}` 用于属性，会去掉标签并转义。
- 两个文件的键必须完全一致，否则构建失败。文案不能为空（中文昵称相关的两个键除外），也不能包含脚本。
- 页头的语言切换是普通链接，指向另一种语言的页面，并带有 `hreflang` 和 `lang`。

## iPhone 下载入口

页面只有一个手机下载入口，状态写在 `site.config.json`，修改后重新运行 `npm run build`：

```json
{
  "mobileDownloadKind": "unavailable",
  "mobileDownloadUrl": ""
}
```

| `mobileDownloadKind` | `mobileDownloadUrl` | 页面显示 |
| --- | --- | --- |
| `unavailable`（默认） | 必须为空 `""` | 不可点击的 “iPhone beta not open yet / iPhone 测试版尚未开放” 状态，不生成链接，也不提 TestFlight 或 App Store |
| `testflight` | `https://testflight.apple.com/join/<邀请码>` | “Join the iPhone beta on TestFlight / 通过 TestFlight 加入 iPhone 测试”按钮 |
| `appstore` | `https://apps.apple.com/<地区>/app/<名称>/id<数字>`（地区和名称可省略） | “View on the App Store / 前往 App Store”按钮，不使用徽章图片 |

构建会先校验配置，不通过就报错退出，不会写出任何文件。以下情况会被拒绝：

- 未知类型；
- 类型与链接不一致（例如 `testflight` 配了 App Store 链接）；
- 非 https 协议（`http:`、`javascript:`、`data:`、`itms-services:` 等）；
- 相似但不同的域名；
- 带用户名或端口；
- 带 `#` 片段；
- 路径格式不对；
- 多余的查询参数；
- 大小写或空白未规范化的链接。

开放下载前，请先确认链接能打开、是 Sofatap 的正式页面，再切换状态。

## 电脑端下载

`src/releases.json` 列出 Windows、Mac、Linux 各自的发行版 tag 和安装包。链接由构建脚本固定拼成以下几种地址，数据文件本身不能写任意 URL：

- 下载：`https://github.com/chekusu/sofatap/releases/download/<tag>/<文件>`
- 版本说明：`…/releases/tag/<tag>`
- 安装说明：`…/blob/main/<guide>`

校验规则：

- 三个平台都必须有，且不能重复；
- tag 必须形如 `v0.4.0-alpha`；
- 文件名必须以对应平台前缀开头（`SofaTap-Windows-`、`SofaTap-macOS-`、`SofaTap-Linux-`），以 `.zip` 或 `.tar.gz` 结尾；
- 安装说明必须是仓库内的 `.md` 路径；
- 文件大小（字节）用于显示 MB。

发布新版本后，按 GitHub Release 中实际的资源名和大小更新这个文件。

## 图片

所有图片都来自产品仓库（上面固定的提交），只做了缩放和格式转换，未改动内容：

| 文件 | 来源 | 页面标注 |
| --- | --- | --- |
| `src/assets/sofatap-mark-256.webp`、`favicon-64.png`、`apple-touch-icon.png` | `ios/SofaTap/Assets.xcassets/BrandMark.imageset/BrandMark.png`（沙发 + 手机 + 光标标志，SHA-256 `bab56f45…df05`） | 品牌标志 |
| `src/assets/living-room-{960,1600}.webp` | `docs/images/sofatap-living-room.png`（AI 生成） | 「Illustration / 示意图」：AI 生成场景，非应用截图，图中手机界面为早期概念 |
| `src/assets/single-screen-{360,720}.webp` | `docs/images/sofatap-single-screen.png`（iOS 模拟器离线渲染） | 「Development preview / 开发预览」：并非真机测试 |

静态检查会确认这两张产品图片都放在带正确标注的 `<figure>` 中。页面不使用任何二维码图片。

## 动态效果

- 首屏文字和插图只在加载时淡入一次（约 1 秒）。
- 手势一节的背景是一层点阵：鼠标经过时会轻微偏移，点击会荡开涟漪。它只在该节出现在屏幕上时运行。
- 系统开启「减少动态效果」，或浏览器无法创建画布时，点阵保持为静态 CSS 图案，所有动画关闭。

## 文件

| 路径 | 内容 |
| --- | --- |
| `src/index.html` | 共用页面模板 |
| `src/i18n/` | 英文、中文文案 |
| `src/releases.json` | 电脑端发行包 |
| `src/styles.css`、`src/main.js` | 样式；只用于渐进增强的少量脚本 |
| `src/assets/` | 标志和产品图片 |
| `scripts/` | 构建、配置与发行包校验、静态检查、预览服务器 |
| `tests/` | `node:test` 单元测试 |

构建只会清空 `dist/`、全新的目录或以前由本构建生成的目录。以下输出目录会被拒绝：

- 仓库本身及其上级目录；
- `src/` 等源码目录；
- 配置文件所在目录；
- 符号链接；
- 其他非空目录。
