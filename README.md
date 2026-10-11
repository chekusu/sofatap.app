# Sofa Tap 官网

Sofa Tap 的公开网站：一个中文、移动优先的静态单页，主题是“用 iPhone，轻松操作客厅电脑”。纯 HTML/CSS/JS，构建脚本只用 Node.js 内置模块，没有依赖。

产品源码在 [chekusu/sofatap](https://github.com/chekusu/sofatap)。页面上的产品说明依据该仓库提交 [`26eb6ceaa1e98e046097dd6656e22da0d3d2e23f`](https://github.com/chekusu/sofatap/tree/26eb6ceaa1e98e046097dd6656e22da0d3d2e23f)（2026-10-11 核对），Windows 接收端链接指向 [`v0.1.1-alpha`](https://github.com/chekusu/sofatap/releases/tag/v0.1.1-alpha)。产品有变化时，先核对新的提交再改文案。

## 命令

需要 Node.js 18 或更高版本，不需要 `npm install`。

```sh
npm run build     # 生成 dist/
npm test          # 单元测试：下载配置校验、构建输出、预览服务器
npm run check     # 构建到临时目录并做静态检查（结构、链接、资源、文案限制、配色对比度）
npm run verify    # test + check
npm run preview   # 在 http://127.0.0.1:4173/ 预览 dist/
```

预览服务器只监听本机回环地址。端口被占用时可指定其他端口，`--port 0` 会自动选择空闲端口；`--base` 可模拟部署在子路径下：

```sh
npm run preview -- --port 0 --base /preview/sofatap/
```

页面内所有资源和链接都是相对路径，部署在根路径或任意子路径下都能正常工作。

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
| `unavailable`（默认） | 必须为空 `""` | 不可点击的“TestFlight 即将开放”状态，不生成链接 |
| `testflight` | `https://testflight.apple.com/join/<邀请码>` | “通过 TestFlight 安装测试版”按钮 |
| `appstore` | `https://apps.apple.com/<地区>/app/<名称>/id<数字>`（地区和名称可省略） | “前往 App Store”按钮，不使用 App Store 徽章图片 |

构建会先校验配置，不通过就报错退出，不会写出任何文件。会被拒绝的情况包括：未知类型、类型与链接不一致（例如 `testflight` 配了 App Store 链接）、非 https 协议（`http:`、`javascript:`、`data:`、`itms-services:` 等）、相似但不同的域名、带用户名或端口、带 `#` 片段、路径格式不对、多余的查询参数，以及大小写或空白未规范化的链接。

开放下载前，请先确认链接能打开、是 Sofa Tap 的正式页面，再切换状态。

## 文件

| 路径 | 内容 |
| --- | --- |
| `src/index.html` | 页面模板（`{{…}}` 占位符由构建填入） |
| `src/styles.css`、`src/main.js` | 样式；只用于渐进增强的少量脚本 |
| `src/assets/logo.svg` | 临时标志（沙发 + 竖屏手机 + 光标），可直接替换为正式标志 |
| `scripts/` | 构建、配置校验、静态检查、预览服务器 |
| `tests/` | `node:test` 单元测试 |

插画都是手写的内联 SVG，不是产品截图。动画只在页面加载或滚动到场景时播放一次（不超过 5 秒），系统开启“减少动态效果”时完全不播放。

构建只会清空 `dist/`、全新的目录或以前由本构建生成的目录；仓库本身、上级目录、`src/` 等源码目录、配置文件所在目录、符号链接和其他非空目录都会被拒绝。
