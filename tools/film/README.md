# 演示视频工具

把网站上的手机 → 电视演示做成每种语言一支带旁白的视频（约一分钟）。录制的是真实页面上的同一个演示：同一份 `src/demo-core.js` 时间轴、同样的手势规则和画面，用 `film.css` 排成 1920×1080。每种语言录自己的页面，画面里的片名、搜索框、「发送」都是该语言。角标、片头和片尾使用网站同一个文字标志 SVG。画面里没有文字说明。

视频和音频文件不放进 Git。导出目录、Playwright、浏览器的位置都通过参数或环境变量传入，脚本里没有本机路径。

## 需要

- Node.js 18 以上。
- Playwright（Chromium）。用 `--playwright` 指向一个已有的 `playwright` 包（相对路径按当前目录解析），或用 `SOFATAP_PLAYWRIGHT`；`--browser` / `SOFATAP_BROWSER` 可指定浏览器。
- 带 libx264、AAC 和 libass 的 `ffmpeg`（`--ffmpeg` 或 `SOFATAP_FFMPEG`）。
- 能显示各语言文字的字体（烧录字幕用）。

## 步骤

```sh
# 1. 配音稿：12 种语言 × 每条字幕（src/video/cues.json），每种语言一整段（每条一行）和每条的字符位置
node tools/film/narration.mjs --out <目录>/narration-ready.json

# 2. 用配音服务为每种语言生成整段旁白和字符时间戳（不在本仓库内完成），放进一个目录：
#    <lang>.mp3 + <lang>.json（或 narration-<lang>.mp3 + .json，或每条一段 narration-<lang>-1….mp3）

# 3. 按旁白录制并合成每种语言的视频
node tools/film/voice.mjs --audio <旁白目录> --out <输出目录> --playwright <playwright 包路径> [--jobs 3]

# 4. 网站构建
node scripts/build.mjs --out <网站输出目录> --media <输出目录>/site
node scripts/check.mjs --media <输出目录>/site
```

`voice.mjs` 的输出：

| 路径 | 内容 |
| --- | --- |
| `site/sofatap-demo-<lang>.mp4` | 网站播放的视频：H.264 + AAC，带旁白，不烧字幕 |
| `site/sofatap-demo.<lang>.vtt`、`site/timing.json` | 按实测时间生成的字幕（构建会用 `timing.json`） |
| `site/sofatap-demo-poster-<lang>.jpg` | 每种语言的封面：第一次搜索之后的一帧 |
| `promo/sofatap-demo-<lang>-subtitled.mp4` | 烧录字幕的版本，供推广分享，不放进网站 |
| `report.json` | 每条旁白的位置、长度、停留时间、响度和警告 |

## 旁白如何对齐画面

- 画面有 18 个时刻，对应 18 条旁白（`src/video/cues.json` 的 `anchor`）：片头、电视和手机、滑动、轻点、连点两下、从菜单选择；点搜索框、键盘打字、发送、搜索；清除、麦克风、说出片名（旁白念出手机上出现的同一个片名）、停止检查并发送、搜索；连点两下选「播放」、影片开始、片尾。
- 字符时间戳在一段文字内可能是平均分配的，所以两条旁白之间的切点会移到附近音频里最安静的 120 毫秒正中。各段首尾相接，覆盖整段旁白，不重叠，完整保留旁白。
- 每个画面片段按原速播放；如果这条旁白更长，画面停在片段最后一个静止帧上等旁白说完（`tools/film/timeline.mjs`）。画面不会加速、不会剪掉，每个动作都在说到它的那句话开始时发生。
- 视频总长随实际旁白而定（约 55–75 秒），片尾至少停留 4.2 秒，最后一句之后留出约 1.4 秒。
- 旁白停留时画面不变，录制时同一时刻只截一次图，重复使用。

`record.mjs` 也可以单独录一支无声母版（`--duration` 指定长度），用于检查画面。

## 修改片尾或字幕（不重录、不重新配音）

`outro.mjs` 以一次已完成的输出为来源，只重新渲染片尾卡（从最后一个片段开始的那一帧起，前面的画面原样沿用），拼接后重新编码；旁白音轨原样复制（检查数据包完全一致），帧数与原视频相同。字幕按 `site/timing.json` 的实测时间和当前的字幕设置重新生成，分享用的烧录字幕版也从新的无字幕视频重新烧录。

```sh
node tools/film/outro.mjs --from <上一次的输出目录> --out <新输出目录> --playwright <playwright 包路径> [--langs en,zh-CN] [--jobs 3]
```

新输出目录与 `voice.mjs` 的布局相同（`site/`、`promo/`、`report.json`），另有 `outro-report.json`。片尾显示 `sofatap.app`；烧录字幕距画面底部 112 像素，网站字幕使用 `line:-2`（比播放器默认位置高一行）。
