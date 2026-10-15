# Sofatap 官网

Sofatap 的公开网站：移动优先的静态页面，共 12 种语言。英文为默认语言（`index.html`），其他语言各在一个目录里：`zh/`（简体中文，保持原地址）、`es/`、`fr/`、`de/`、`pt-br/`、`ja/`、`ko/`、`ar/`（从右到左）、`hi/`、`ru/`、`id/`。页面采用产品选定的「暮色薄荷 / Mint Calm」配色，并有一个手机 → 电视的交互式模拟演示。纯 HTML/CSS/JS，构建脚本只用 Node.js 内置模块，没有依赖。

品牌名统一写作 **Sofatap**（一个词，只有 S 大写）；中文页可用市场名提案「沙发瘫」作辅助。`SofaTap` 只出现在发行包文件名等兼容标识中。

产品源码在 [chekusu/sofatap](https://github.com/chekusu/sofatap)。页面上的产品说明依据该仓库提交 [`861367ae901c1c0326f445c0807d26b2af38b780`](https://github.com/chekusu/sofatap/tree/861367ae901c1c0326f445c0807d26b2af38b780)（2026-10-12 核对）及其已发布的 GitHub Releases。产品有变化时，先核对新的提交再改文案：

- 当前 `main` 上的单屏触控、应用内语音、自动弹出键盘和新版接收端窗口属于开发版本。下载区的说明写明已发布的 alpha 安装包不含这些更新；按网站所有者的决定，营销页面和视频里不再放「开发中」「开发预览」「模拟」「示意图」之类的标签，静态检查会阻止它们回来。
- Windows / Mac 下载来自 `v0.3.0-alpha`，Linux 来自 `v0.4.0-alpha`；iPhone App 通过 TestFlight 公开测试（`https://testflight.apple.com/join/e6MuKx9S`），尚未上架 App Store。
- 未实现或尚待验证的方向（如 Windows 锁屏 PIN、Face ID、语音代操电脑）不出现在页面上。

## 命令

需要 Node.js 18 或更高版本，不需要 `npm install`。

```sh
npm run build     # 生成 dist/（每种语言一个页面，英文在 dist/index.html）
npm test          # 单元测试：下载配置、发行包数据、构建输出、12 种语言文件、字幕、手势规则与演示时间轴、预览服务器
npm run check     # 构建到临时目录并做静态检查（每种语言的结构、语言菜单、链接、资源、文字标志、演示、视频、文案限制、配色对比度）
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

语言清单只有一份：`scripts/locales.mjs`（语言代码、目录、原生名称、文字方向）。页面模板只有一份：`src/index.html`。文案在 `src/i18n/<语言>.json`，共 12 个文件：

- 模板中的 `{{t:键}}` 原样插入文案，`{{a:键}}` 用于属性，会去掉标签并转义。
- 所有文件的键必须完全一致，否则构建失败。文案不能为空（中文昵称相关的两个键除外），也不能包含脚本。测试会检查新增语言没有残留英文、占位符和链接没有丢失。
- iPhone 下载入口的三种状态文案在 `scripts/download-config.mjs`，同样覆盖 12 种语言。
- 页头的语言菜单是一组普通链接（`<details>`，不需要脚本），每个链接带 `hreflang` 和 `lang`，当前语言用 `aria-current` 标出；`<head>` 里有全部语言和 `x-default` 的备用链接。阿拉伯语页面为 `dir="rtl"`，样式使用逻辑属性；版本号、文件大小等技术信息单独按从左到右显示。
- 静态检查（`scripts/check.mjs`）对每种语言都检查必须出现的事实（如 300 毫秒、右键、开发中、尚未包含）和不允许的说法。

## iPhone 下载入口

页面只有一个手机下载入口，状态写在 `site.config.json`，修改后重新运行 `npm run build`。当前配置：

```json
{
  "mobileDownloadKind": "testflight",
  "mobileDownloadUrl": "https://testflight.apple.com/join/e6MuKx9S"
}
```

| `mobileDownloadKind` | `mobileDownloadUrl` | 页面显示 |
| --- | --- | --- |
| `unavailable` | 必须为空 `""` | 不可点击的 “iPhone beta not open yet / iPhone 测试版尚未开放” 状态，不生成链接，也不提 TestFlight 或 App Store |
| `testflight` | `https://testflight.apple.com/join/<邀请码>` | “Join the TestFlight Beta / 加入 TestFlight 公测”按钮；下载区的 iPhone 说明先请用户从 App Store 安装 TestFlight，再打开链接安装 Sofatap |
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

## 品牌和图片

- 文字标志 `src/assets/sofatap-wordmark.svg`：固定轮廓的 SVG（不含文字元素、字体或外部引用），由 `tools/brand/wordmark.mjs` 生成。圆润的单线字形，「o」的字怀里有一个薄荷色圆点（指尖点在触控面上），「t」的收笔接向后面的「a」。页头、页脚和演示视频的角标、片头、片尾都用这一个文件；品牌名不要再用普通文字排版。修改字形请改生成脚本后重新运行 `node tools/brand/wordmark.mjs`。
- 图形标志 `src/assets/sofatap-mark-256.webp`、`favicon-64.png`、`apple-touch-icon.png`：来自产品仓库 `ios/SofaTap/Assets.xcassets/BrandMark.imageset/BrandMark.png`（沙发 + 手机 + 光标，SHA-256 `bab56f45…df05`），只做了缩放。
- 手机画面 `src/assets/single-screen-{360,720}.webp`：来自产品仓库 `docs/images/sofatap-single-screen.png`（当前设计在 iOS 模拟器中的渲染），只做了缩放。
- 旧的客厅场景图（AI 生成，图中带有旧版文字标志）已不再使用；首屏改为直接展示可操作的手机 → 电视演示。页面不使用任何二维码图片。

## 手机 → 电视模拟演示

首屏有一个可直接操作的演示：电视显示一台电脑的影片库，旁边是手机的触控画面。它只在浏览器里运行，不连接、也不控制任何设备（不需要在页面上解释）。

- 鼠标在手机触控区移动、或手指滑动：电视上的指针按相对位移移动（和触控板一样）。
- 单击 / 轻点：等待双击判定（触摸 280 毫秒，与 App 一致；鼠标按桌面习惯 500 毫秒）后左键单击，选中影片。
- 双击 / 连续轻点两下，或鼠标右键：只发送一次右键，在指针处打开菜单（播放、加入待看、标记已看），不会先触发左键。
- 按住 300 毫秒后移动是拖动；双指滑动（或鼠标滚轮）滚动影片列表，指针不动。
- 键盘：聚焦手机屏幕后，方向键移动指针，Enter / 空格单击，Shift+F10 或菜单键右键，Esc 关闭菜单或返回列表。结果会在状态栏中播报。
- 「播放演示」按钮按固定时间轴自动演示一遍；首次滚动到演示时自动播放一次（开启「减少动态效果」时不会）。任何真实输入都会接管。

手势规则和时间轴在 `src/demo-core.js`（不依赖页面，测试直接加载它），页面逻辑在 `src/main.js`，影片封面是 `scripts/demo-art.mjs` 中为本演示绘制的矢量图。

## 演示视频

视频录的是同一个演示、同一条时间轴：`tools/film/record.mjs` 打开新构建的真实页面，用 `tools/film/film.css` 把演示排成 1920×1080 画面（角标、片头、片尾使用同一个文字标志 SVG），逐帧推进演示自己的时钟截图，得到无声母版。每种语言录自己的页面，所以画面里的片名、搜索框和「发送」按钮是该语言；画面里没有文字说明，旁白和字幕按语言另加。故事约一分钟，分三段：触控手势；在电视的搜索框点一下，用手机键盘打字，草稿留在手机上，点「发送」后才输入到电脑，再用指针点「搜索」；点搜索框的清除按钮，用麦克风说出片名（旁白念出这个片名），停止、检查、发送、搜索，然后播放。

- 演示与网站一致：电视上的影片库有搜索框（输入框、清除、搜索按钮），手机上有键盘按钮、麦克风和草稿编辑区。访客可以在页面上点搜索框、用手机键盘按钮打字并发送；网页无法代替 App 的本机听写，点麦克风时状态栏说明它在 App 里的作用，「播放演示」会完整演示听写这一段。发送只把草稿输入到电脑当前的输入框（接在已有文字后面），从不按回车。

- 旁白和字幕是同一段文字：各语言文件中的 18 条 `video.cue.*`，每条对应 `src/video/cues.json` 里的一个画面时刻。`tools/film/narration.mjs` 生成配音稿（读作「Sofa tap」，字幕仍写 Sofatap）。
- `tools/film/voice.mjs` 接收配好的整段旁白和字符时间戳，按字幕条数切分计时，配到母版上：网站用的每语言一个带声音、不烧字幕的 MP4，以及字幕时间 `timing.json`；另外为每种语言烧录字幕版（供推广使用，不放进网站）。
- 网站每种语言的页面播放该语言的配音视频，并显示本页语言的 WebVTT 字幕。每种语言的画面按自己的旁白计时，所以字幕只配本语言的视频；换语言请用页头的语言菜单，视频和字幕会一起切换。播放器隐藏下载按钮（`controlslist="nodownload"`），页面上没有视频或字幕的下载链接。

视频文件较大，不放进 Git。步骤见 `tools/film/README.md`；网站构建只需要：

```sh
node scripts/build.mjs --out <输出目录> --media <网站用视频目录>   # 12 个配音视频 + 12 张封面（+ timing.json）
node scripts/check.mjs --media <网站用视频目录>
```

不加 `--media` 时，构建结果没有视频区，也不引用任何视频文件。`--media` 目录必须在输出目录之外（构建会先清空输出目录），文件缺失或格式不对时构建在写入前就会失败。预览服务器为 `.mp4`、`.vtt` 返回正确的 MIME 类型并支持分段请求（Range）。对 MP4 加 `?download=1` 时返回 `Content-Disposition: attachment`（文件名取自文件本身，只保留安全字符），用于在网站之外分享的下载链接；网站页面本身不提供视频下载入口。

## 动态效果

- 首屏文字和插图只在加载时淡入一次（约 1 秒）。
- 手势一节的背景是一层点阵：鼠标经过时会轻微偏移，点击会荡开涟漪。它只在该节出现在屏幕上时运行。
- 模拟演示只在有动作时绘制，空闲时不占用动画帧；减少动态效果时没有自动播放和连续动画，但所有操作仍然有效。
- 系统开启「减少动态效果」，或浏览器无法创建画布时，点阵保持为静态 CSS 图案。画布不可用不会影响演示的操作。

## 发布到 sofatap.app

生产环境是 Cloudflare Workers Static Assets，配置在 `wrangler.jsonc`：Worker 名 `sofatap-website`，自定义域名 `sofatap.app`，不开 workers.dev 和预览地址，HTML 自动处理末尾斜杠，没有单页应用回退。

发布的是已经审核过、含视频的构建，不要为发布重新运行不带 `--media` 的 `npm run build`（那样的构建没有视频区）：

```sh
# 1. 含媒体的构建（已审核的 dist/ 就是这样得到的）
node scripts/build.mjs --out dist --media <网站用视频目录>
#    并把两个分享用的宣传视频放进 dist/exports/（sofatap-promo-en.mp4、sofatap-promo-zh-cn.mp4）

# 2. 检查并原样复制到 .wrangler/production-assets/（已在 .gitignore 中）
npm run deploy:prepare            # 或 node scripts/prepare-deploy.mjs --dist <构建目录>

# 3. 发布（需要有权限的 Cloudflare 登录）
wrangler deploy --dry-run         # 只检查配置和文件，不上传
wrangler deploy
```

`deploy:prepare` 不会构建：12 种语言的视频、封面和 18 条字幕的 WebVTT、两个宣传视频缺一不可，否则直接失败。它不复制构建记录 `.sofatap-build`，逐字节核对复制结果，并只加一份 `_headers`：`/exports/` 下的两个宣传视频以附件方式下载；网站 `/media/` 里的视频照常在页面内播放。MIME 和缓存使用平台默认。

静态文件服务对视频的分段请求（Range）只会返回整个文件，浏览器因此无法拖动进度。`worker/index.mjs` 只在 `/media/` 和 `/exports/` 下先运行（`run_worker_first`），只处理 MP4：从静态文件取得原样的文件和响应头（类型、ETag、缓存、宣传视频的附件下载），对单个字节范围（含 `bytes=N-` 和 `bytes=-N`）返回 206 和 `Content-Range`，无法满足的范围返回 416，多个范围返回整个文件；GET 和 HEAD 都支持，`If-Range` 不匹配时返回整个文件。其他文件（网页、字幕、封面等）仍由静态文件直接返回。

## 文件

| 路径 | 内容 |
| --- | --- |
| `src/index.html` | 共用页面模板 |
| `src/i18n/` | 12 种语言的文案 |
| `src/demo-core.js` | 演示的手势规则和时间轴（页面、视频、测试共用） |
| `src/video/cues.json` | 演示视频的字幕时间轴 |
| `src/releases.json` | 电脑端发行包 |
| `src/styles.css`、`src/main.js` | 样式；语言菜单、模拟演示和点阵（均为渐进增强） |
| `src/assets/` | 标志和产品图片 |
| `scripts/` | 语言清单、构建、配置与发行包校验、字幕、静态检查、预览服务器、发布准备 |
| `wrangler.jsonc`、`worker/` | 生产发布配置（Cloudflare Workers Static Assets）和为视频提供字节范围的 Worker |
| `tools/film/` | 演示视频的录制、配音稿、旁白合成与字幕烧录 |
| `tools/brand/` | 文字标志生成脚本 |
| `tests/` | `node:test` 单元测试 |

构建只会清空 `dist/`、全新的目录或以前由本构建生成的目录（`--out` 可指定其他位置，例如候选构建）。以下输出目录会被拒绝：

- 仓库本身及其上级目录；
- `src/` 等源码目录；
- 配置文件所在目录；
- 符号链接；
- 其他非空目录。
