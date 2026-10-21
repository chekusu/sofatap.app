# Sofatap 官网

Sofatap 的公开网站：移动优先的静态页面，共 12 种语言。英文为默认语言（`index.html`），其他语言各在一个目录里：`zh/`（简体中文，保持原地址）、`es/`、`fr/`、`de/`、`pt-br/`、`ja/`、`ko/`、`ar/`（从右到左）、`hi/`、`ru/`、`id/`。页面采用产品选定的「暮色薄荷 / Mint Calm」配色，并有一个手机 → 电视的交互式模拟演示。纯 HTML/CSS/JS，构建脚本只用 Node.js 内置模块，没有依赖。

品牌名统一写作 **Sofatap**（一个词，只有 S 大写）；中文页可用市场名提案「沙发瘫」作辅助。`SofaTap` 只出现在发行包文件名等兼容标识中。

产品源码在 [chekusu/sofatap](https://github.com/chekusu/sofatap)。页面上的产品说明依据该仓库提交 [`6cb7799d574c37c2f5ac6a455db3cdd7b7d4e856`](https://github.com/chekusu/sofatap/tree/6cb7799d574c37c2f5ac6a455db3cdd7b7d4e856)（2026-10-14 核对）。下载和版本信息来自 `src/releases.json`，它由公开的 GitHub Releases 刷新（见「电脑端和 Android TV 下载」）；2026-10-19 核对时为电脑端 [`v0.8.1-beta.1`](https://github.com/chekusu/sofatap/releases/tag/v0.8.1-beta.1)（发行版的 tag 与源码提交 `e798f8db485555b27990cc53e2eae7fff27fbc53`）和实验性的 Android TV 接收端 [`android-tv-v0.2.0-beta.1`](https://github.com/chekusu/sofatap/releases/tag/android-tv-v0.2.0-beta.1)（2026-10-17 发布；tag 指向提交 `5096e2ef061d33b316456befdd6c4f6a126c0cd1`，发行说明写明源码为 PR #9 合并的 `a9076becaad7d0d9bcca33086212de542ff8a00b`），以及 Android 手机/平板 App [`android-controller-v0.1.0-beta.1`](https://github.com/chekusu/sofatap/releases/tag/android-controller-v0.1.0-beta.1)（2026-10-21 发布；tag 和源码提交 `2fe1f554caa807797183ad41cafcbe19543911c0`，PR #19 合并）。隐私政策和支持页仍是 `6cb7799` 的原文快照（见下文），里面的日期和版本号属于那份快照。产品有变化时，先核对新的提交再改文案：

- 电脑端下载全部来自 `src/releases.json` 里的同一个 tag（Windows x64、Mac Apple Silicon / Intel、Linux x64 / ARM64），文件大小按 GitHub 报告的字节数。接收端的二维码带有电脑类型和名称，需要 iPhone App 1.0 (15) 或更高版本；下载区只用一句话说明这一点并建议两端都更新到最新版，具体改动留给发行说明。首屏电脑端按钮下的「最新接收端」版本由 `src/releases.json` 生成，不在文案里写死。
- 文字输入分两种：兼容接收端上受支持的 Windows / Mac 输入框是实时编辑（没有「发送」按钮）；其他输入框（包括许多浏览器和自定义控件，但不是全部浏览器）、Linux 和旧接收端使用草稿 +「发送」。Sofatap 不会额外添加回车或提交，但文字里的换行会被输入，在某些输入框里相当于回车。
- iPhone App 通过 TestFlight 公开测试（`https://testflight.apple.com/join/e6MuKx9S`；2026-10-17 公开邀请开放，当前说明为 build 20），尚未上架 App Store。常见问题「现在可以日常使用吗？」据此写作公开测试，仍保留 beta 的提醒。
- 手动控制和基础语音转文字免费。常见问题里只有一条「Sofatap 要收费吗？」，回答只说这一点，不提付费计划、订阅或自主操作（静态检查会拦住）；其他地方不提价格。LG webOS 和 Android/Google TV 是实验性预览，没有通过验证的电视型号。
- Android TV 接收端是单独的实验性 APK（Android 8.0 / API 26 起，需要 iPhone App 1.0 (20) 或更新版本，或 Android App）：卡片写明尚未通过家用电视和第三方应用验收（小米、索尼配对，YouTube、Netflix 和浏览器里的文字都未验证），电视按键需要启用 Android TV Remote Service，输入文字要在电视上选择 Sofatap 键盘；只链接到它的公开发行版，不承诺一般电视都能用。电脑端二维码要求的 iPhone App 1.0 (15) 不变，只对 iPhone 说。
- Android 手机/平板 App 是另一条发行线（`android-controller-v…`），和 Android TV 接收端无关：Android 8.0 / API 26 起，直接安装 APK，不经 Google Play，更新时手动覆盖安装。卡片在 iPhone 卡片旁，写明 App 界面只有英文、简体中文和日文；听写使用手机上安装的语音服务，语音如何处理由该服务决定，不承诺在本机识别或不上传；真实电脑和电视上的测试仍在进行。iPhone 的本机识别、不上传音频的说法只对 iPhone 说。常见问题区分：Android App 能控制实验性的 Android/Google TV 接收端，LG webOS 仍只有 iPhone App 的预览。首屏标题和页面标题写「手机」而不是 iPhone；隐私和支持页的原文快照不变。
- 按网站所有者的决定，营销页面和视频里不放「开发中」「开发预览」「模拟」「示意图」之类的标签，静态检查会阻止它们回来。
- 未实现或尚待验证的方向（如 Windows 锁屏 PIN、Face ID、语音代操电脑）不作为现有功能出现在页面上。
- 演示视频和网页演示展示的是草稿 +「发送」这一种流程；网页演示的说明写明了这一点。按网站所有者的决定，视频区不放标题或说明文字。视频的旁白和字幕保持原样。

## 命令

需要 Node.js 18 或更高版本，不需要 `npm install`。

```sh
npm run build     # 生成 dist/（每种语言一个页面，英文在 dist/index.html）
npm test          # 单元测试：下载配置、发行包数据、电脑类型判断、构建输出、12 种语言文件、字幕、手势规则与演示时间轴、视频播放器、预览服务器
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
- 静态检查（`scripts/check.mjs`）对每种语言都检查必须出现的事实（如 300 毫秒、右键、当前发行版版本号、1.0 (15)、「其他输入框、Linux 和旧版接收端」、换行）和不允许的说法（如 alpha、0.7.1 以及任何不是当前发行版的版本号、「所有浏览器」、价格；价格只允许出现在常见问题里关于费用的那一条）。

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

## 电脑端、Android TV 和 Android 手机下载

`src/releases.json` 列出 Windows、Mac、Linux 各自的发行版 tag 和安装包。链接由构建脚本固定拼成以下几种地址，数据文件本身不能写任意 URL：

- 下载：`https://github.com/chekusu/sofatap/releases/download/<tag>/<文件>`
- 版本说明：`…/releases/tag/<tag>`
- 安装说明：`…/blob/main/<guide>`

校验规则：

- 三个平台都必须有，且不能重复；
- tag 必须形如 `v0.4.0-alpha`；
- 文件名必须以对应平台前缀开头（`SofaTap-Windows-`、`SofaTap-macOS-`、`SofaTap-Linux-`），写明架构（`arm64` 或 `x64`），以 `.zip` 或 `.tar.gz` 结尾；
- 安装说明必须是仓库内的 `.md` 路径；
- 文件大小（字节）用于显示 MB。

`androidTv` 是单独的一项：tag 形如 `android-tv-v0.1.4-beta.1`，文件必须是 `Sofatap-Android-TV-<版本>.apk`。`androidController`（Android 手机/平板 App）也是单独的一项：tag 形如 `android-controller-v0.1.0-beta.1`，文件必须是 `Sofatap-Android-<版本>.apk`；两种 APK 的链接白名单互不通用。每个安装包和 APK 都记下 GitHub 报告的字节数和 SHA-256。

### 刷新发行版（构建/发布时，不是定时任务）

```sh
npm run release:refresh   # 只更新 src/releases.json（有变化时）
npm run build:publish -- --out <候选目录> --media <现有媒体目录>   # 先刷新，再构建要审核和发布的完整构建
```

`build:publish` 后面的参数原样交给构建脚本；不带 `--media` 的构建没有视频区，不能用于发布。

`npm run build`、测试和冻结的候选构建都不联网，只用已提交的 `src/releases.json`。刷新只在有人运行上面的命令时发生，页面本身从不调用 GitHub API，访客也不会碰到 GitHub 的频率限制；`deploy:prepare` 既不刷新也不构建。要上线新版本，先刷新、审核 `src/releases.json` 的变化并提交，再构建和审核候选。

`scripts/refresh-releases.mjs` 读取 `https://api.github.com/repos/chekusu/sofatap/releases` 的全部分页，电脑端（`v…`）、Android TV（`android-tv-v…`）和 Android 手机 App（`android-controller-v…`）三条 tag 线各自选择：

- 忽略草稿，允许 beta；按版本号排序，不看 `/latest`、列表顺序或发布时间；
- 只有当每个预期文件（电脑端为现有的五个安装包，两条 Android 线各为该版本的 APK）都已上传、链接正是该 tag 和文件的固定 GitHub 下载地址、并且有校验文件写明这个文件名和 64 位十六进制 SHA-256（GitHub 也报告摘要时两者必须一致）时，才算完整。电脑端用 `<文件>.sha256`；两条 Android 线依次接受 `<APK>.sha256`、`SHA256SUMS.txt`、`SHA256SUMS`（各版本的命名不同），不要求清单文件。源码压缩包和其他资源一律不用；
- 选最新的完整版本，但绝不早于当前快照（不会悄悄回退）；
- 网络错误、超时、频率限制或响应格式不对时，所有线都保留现有快照，命令仍正常结束并给出警告；某条线的新版本不完整或格式不对时，只有这条线保留快照，其他线照常更新；
- 本地快照本身必须有效（五个安装包同一 tag、架构齐全，Android TV 和 Android 手机 App 有效），否则在请求前就失败；写入用同目录临时文件再改名，中断不会截断快照。

页面上的版本号、首屏「最新接收端」、静态检查和测试都从这个文件推导，刷新后不需要改别处的版本号。

页面先把五个安装包全部按平台列出（没有脚本时就是这样）。`src/platform.js` 在本机浏览器里判断设备类型，同时用于首屏按钮和下载区，不存储、不发送、不探测任何东西：

- 操作系统来自 User-Agent，有 UA Client Hints 时两者必须一致，否则不判断。iPhone、iPad（包括请求桌面网站时的 iPad）和 Android 不会被当成 Mac 或 Linux；ChromeOS、FreeBSD 等也不判断。电视自带的浏览器（Android TV、Google TV、Fire TV、BRAVIA 等，User-Agent 也写 Android）不当作 Android 手机。
- Android 手机和平板：首屏的 iPhone 入口换成「获取 Android App」（Android 图标和当前 App 版本），它只链接到下载区的 Android 卡片，不会自动下载；Android 卡片排到最前并标为本机。iPhone 和 iPad 保留 TestFlight 入口，iPhone 卡片标为本机。手机上电脑端卡片都留在原处，因为手机 App 需要电脑端接收端；Android TV 卡片从不作为本机。手机不等待架构结果，脚本一运行就排好。
- 处理器架构只在浏览器的 `getHighEntropyValues(['architecture', 'bitness'])` 在 600 毫秒内给出完整且一致的 platform、architecture 和 64 位 bitness 时采用。User-Agent 里的 `Intel Mac OS X`、`Linux x86_64` 不作为依据（Apple 芯片上的 Safari 和精简后的 UA 也这样写）。Chromium 在 Rosetta 下报告 arm，所以仍会推荐 Apple 芯片版。
- 知道系统时，这台电脑的卡片排在最前，其他系统收进原生的「其他下载」（`<details>`）。架构明确时只突出对应的安装包，同系统的另一个安装包连同版本、大小、要求、说明和链接放进「其他下载」里的一张副本卡片（没有重复 id）；架构不明时这台电脑的两个安装包并列。Windows 只有 x64 包：报告 ARM 或 32 位的电脑保持原样，不把 x64 包说成匹配。
- 首屏的电脑端按钮按系统换成「下载 Mac 版」等文字和左侧的系统图标（四格窗、苹果、企鹅，都是为本站画的简单图形，没有引用外部图标），未知系统和手机显示中性的电脑图标；按钮始终只是指向下载区的链接，不会自动下载。下载区要等架构结果，访客在此之前已经在下载区里点按或聚焦时就不再移动内容。
- 选择器：`#get-app`、`#get-android`（构建时 `hidden`）、`#platform-android`、`.get-desktop__link[data-os]`、`.os-icon[data-os]`、`#download[data-os][data-arch]`、`.platform--current`、`.downloads-other`、`.downloads-other__list`、`li[data-arch]`。

## 隐私政策和支持页

每种语言都有 `privacy/` 和 `support/` 两个页面（英文在 `/privacy/`、`/support/`，其他语言如 `/zh/privacy/`），从主页页脚进入。页头、语言菜单、页脚和「隐私政策 / 支持」切换是本页语言；正文是产品仓库的英文原文，标为 `lang="en" dir="ltr"`，非英文页面上方说明正文只有英文。法律和支持内容不翻译，避免自行改写其含义。

- 原文在 `src/legal/privacy.md`（产品仓库 `PRIVACY.md`）和 `src/legal/support.md`（`docs/app-store/support.md`），`src/legal/source.json` 记录来源提交和 SHA-256。构建时逐字节核对，不一致就失败。更新时从产品仓库取新提交的文件，更新 SHA-256 和提交号。
- 构建只做一处有记录的更正（`source.json` 的 `adaptations`）：支持页把「Browsers, custom fields, Linux and older receivers use a draft… No extra Enter or form submission is added」改为「Many browser and custom fields… No extra Return is appended…, but line breaks included in the text may act as Enter」。原句说所有浏览器都不支持实时编辑、文字输入不会提交表单，与产品 `docs/TEXT-FOCUS.md`、`PROTOCOL.md`（同一提交）不符。支持页的来源说明会注明这处更正。隐私政策没有改动。若产品文档以后自己改正了这句，更正记录找不到原文，构建会失败，此时删去这条记录即可。
- `scripts/markdown.mjs` 只支持这两份文档用到的语法（标题、段落、列表、表格、粗体、代码、链接），其余按纯文本转义。文档里的相对链接：指向这两份文档的变成站内页面，其他 `.md` 指向 GitHub `main` 上的文件，其他相对链接构建失败。
- 静态检查逐词比对正文与原文（含更正），并检查公司名、生效日期、联系途径、链接白名单、语言菜单和每种语言相同的页面结构。

## 品牌和图片

- 文字标志 `src/assets/sofatap-wordmark.svg`：固定轮廓的 SVG（不含文字元素、字体或外部引用），由 `tools/brand/wordmark.mjs` 生成。圆润的单线字形，「o」的字怀里有一个薄荷色圆点（指尖点在触控面上），「t」的收笔接向后面的「a」。页头、页脚和演示视频的角标、片头、片尾都用这一个文件；品牌名不要再用普通文字排版。修改字形请改生成脚本后重新运行 `node tools/brand/wordmark.mjs`。
- 图形标志 `src/assets/sofatap-mark-256.webp`、`favicon-64.png`、`apple-touch-icon.png`：来自产品仓库 `ios/SofaTap/Assets.xcassets/BrandMark.imageset/BrandMark.png`（沙发 + 手机 + 光标，SHA-256 `bab56f45…df05`），只做了缩放。
- 手机画面 `src/assets/single-screen-{360,720}.webp`：来自产品仓库 `docs/images/sofatap-single-screen.png`（当前设计在 iOS 模拟器中的渲染），只做了缩放。
- 线稿插图 `src/assets/art-{sofa,touch,voice,connect}-{640,960,1440}.webp`：网站所有者选定的 E 款线稿风格（AI 生成，图中没有文字或标志），四张分别放在首屏、使用方式、文字输入和设置一节。只做了缩放并转成 WebP（`ffmpeg` libwebp，质量 90），构图和比例（3:2）不变。它们是装饰图，`alt=""`，首屏以外的延迟加载；画面底色与页面背景一致，样式用 `mix-blend-mode: lighten` 让各节的底色透出来，不加边框或卡片。隐私和支持页不放插图。旧的客厅场景图（带有旧版文字标志）已不再使用。页面不使用任何二维码图片。

## 手机 → 电视模拟演示

页面顺序是：首屏（文字和沙发线稿）、宣传视频、使用方式、可直接操作的演示、文字输入、设置。演示里电视显示一台电脑的影片库，旁边是手机的触控画面。它只在浏览器里运行，不连接、也不控制任何设备（不需要在页面上解释）。

- 鼠标在手机触控区移动、或手指滑动：电视上的指针按相对位移移动（和触控板一样）。
- 单击 / 轻点：等待双击判定（触摸 280 毫秒，与 App 一致；鼠标按桌面习惯 500 毫秒）后左键单击，选中影片。
- 双击 / 连续轻点两下，或鼠标右键：只发送一次右键，在指针处打开菜单（播放、加入待看、标记已看），不会先触发左键。
- 按住 300 毫秒后移动是拖动；双指滑动（或鼠标滚轮）滚动影片列表，指针不动。
- 键盘：聚焦手机屏幕后，方向键移动指针，Enter / 空格单击，Shift+F10 或菜单键右键，Esc 关闭菜单或返回列表。结果会在状态栏中播报。
- 「播放演示」按钮按固定时间轴自动演示一遍；首次滚动到演示时自动播放一次（开启「减少动态效果」时不会）。任何真实输入都会接管。

手势规则和时间轴在 `src/demo-core.js`（不依赖页面，测试直接加载它），页面逻辑在 `src/main.js`，影片封面是 `scripts/demo-art.mjs` 中为本演示绘制的矢量图。

## 演示视频

视频录的是同一个演示、同一条时间轴：`tools/film/record.mjs` 打开新构建的真实页面，用 `tools/film/film.css` 把演示排成 1920×1080 画面（角标、片头、片尾使用同一个文字标志 SVG），逐帧推进演示自己的时钟截图，得到无声母版。每种语言录自己的页面，所以画面里的片名、搜索框和「发送」按钮是该语言；画面里没有文字说明，旁白和字幕按语言另加。故事约一分钟，分三段：触控手势；在电视的搜索框点一下，用手机键盘打字，草稿留在手机上，点「发送」后才输入到电脑，再用指针点「搜索」；点搜索框的清除按钮，用麦克风说出片名（旁白念出这个片名），停止、检查、发送、搜索，然后播放。

- 演示与网站一致：电视上的影片库有搜索框（输入框、清除、搜索按钮），手机上有键盘按钮、麦克风和草稿编辑区。访客可以在页面上点搜索框、用手机键盘按钮打字并发送；网页无法代替 App 的本机听写，点麦克风时状态栏说明它在 App 里的作用，「播放演示」会完整演示听写这一段。发送只把草稿输入到电脑当前的输入框（接在已有文字后面），不额外按回车。这是不支持实时编辑的输入框使用的流程。

- 旁白和字幕是同一段文字：各语言文件中的 18 条 `video.cue.*`，每条对应 `src/video/cues.json` 里的一个画面时刻。`tools/film/narration.mjs` 生成配音稿（读作「Sofa tap」，字幕仍写 Sofatap）。
- `tools/film/voice.mjs` 接收配好的整段旁白和字符时间戳，按字幕条数切分计时，配到母版上：网站用的每语言一个带声音、不烧字幕的 MP4，以及字幕时间 `timing.json`；另外为每种语言烧录字幕版（供推广使用，不放进网站）。
- 网站每种语言的页面播放该语言的配音视频，并显示本页语言的 WebVTT 字幕。每种语言的画面按自己的旁白计时，所以字幕只配本语言的视频；换语言请用页头的语言菜单，视频和字幕会一起切换。播放器隐藏下载按钮（`controlslist="nodownload"`），页面上没有视频或字幕的下载链接。
- 视频紧跟首屏，没有标题、说明、边框或卡片；区域和播放器用本地化的 `film.label` 命名。`src/film-player.js`（与网页演示的代码分开）在初始化成功后才移除原生控件：画面四周 2.5–3 % 渐隐到页面底色（角标和界面都在更里面），字幕从本页的 WebVTT 字幕轨读出、单独画在画面上方（原生字幕保持隐藏，不会重复），画面下方是三个图标按钮 `[data-action="play"]`、`[data-action="sound"]`、`[data-action="replay"]`（播放/暂停、声音、从头播放，触控区域 44 px，标签有 12 种语言）。点击画面也能播放或暂停。不会自动播放、循环或自行恢复播放；声音默认打开，只在访客点击播放后响起。没有 JavaScript 或初始化失败时保留原生播放器和原生字幕。

视频文件较大，不放进 Git。步骤见 `tools/film/README.md`；网站构建只需要：

```sh
node scripts/build.mjs --out <输出目录> --media <网站用视频目录>   # 12 个配音视频 + 12 张封面（+ timing.json）
node scripts/check.mjs --media <网站用视频目录>
```

不加 `--media` 时，构建结果没有视频区，也不引用任何视频文件。`--media` 目录必须在输出目录之外（构建会先清空输出目录），文件缺失或格式不对时构建在写入前就会失败。预览服务器为 `.mp4`、`.vtt` 返回正确的 MIME 类型并支持分段请求（Range）。对 MP4 加 `?download=1` 时返回 `Content-Disposition: attachment`（文件名取自文件本身，只保留安全字符），用于在网站之外分享的下载链接；网站页面本身不提供视频下载入口。

## 动态效果

- 首屏文字和线稿只在加载时淡入一次（约 1 秒）。
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
| `src/releases.json` | 电脑端、Android TV 和 Android 手机 App 的发行包 |
| `src/legal/`、`src/legal.html` | 隐私政策和支持页的原文、来源记录和页面模板 |
| `src/styles.css`、`src/main.js` | 样式；语言菜单、模拟演示和点阵（均为渐进增强） |
| `src/film-player.js` | 视频的简洁播放器：图标按钮和单独的字幕层（渐进增强） |
| `src/platform.js` | 在本机判断设备类型，调整首屏按钮和下载区（渐进增强） |
| `src/assets/` | 标志、产品图片和线稿插图 |
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
