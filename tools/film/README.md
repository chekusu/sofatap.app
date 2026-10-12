# 演示视频工具

把网站上的手机 → 电视模拟演示录成视频，并按语言加上字幕。录制的是真实页面上的同一个演示：同一份 `src/demo-core.js` 时间轴、同样的手势规则和画面，只是用 `film.css` 排成 1920×1080。

视频文件不放进 Git。导出目录、Playwright 和浏览器的位置都通过参数或环境变量传入，脚本里没有本机路径。

## 需要

- Node.js 18 以上。
- Playwright（Chromium）。本仓库不安装依赖，用 `--playwright` 指向一个已有的 `playwright` 包目录（相对路径按当前目录解析），或用 `SOFATAP_PLAYWRIGHT`。需要指定浏览器时用 `--browser` 或 `SOFATAP_BROWSER`。
- 带 libx264 和 libass 的 `ffmpeg`（`--ffmpeg` 或 `SOFATAP_FFMPEG`，默认用 PATH 里的 `ffmpeg`）。
- 能显示各语言文字的字体：中文、日文、韩文、阿拉伯文、天城文（印地语）。

## 步骤

```sh
# 1. 录制无声底片（约 4 分钟）：sofatap-demo.mp4、sofatap-demo-poster.jpg、timeline.json
node tools/film/record.mjs --out <导出目录> --playwright <playwright 包路径>

# 2. 为 12 种语言烧录字幕：sofatap-demo-<语言>.mp4，以及对应的 .vtt
node tools/film/burn.mjs --base <导出目录>/sofatap-demo.mp4 --out <导出目录> [--font "<字体>"]

# 3. 构建带视频的网站，并检查
node scripts/build.mjs --out <输出目录> --media <导出目录>
node scripts/check.mjs --media <导出目录>
```

- 字幕字体用 `--font` 指定；某种语言要用别的字体时设 `SOFATAP_FONT_<语言>`，例如 `SOFATAP_FONT_JA`、`SOFATAP_FONT_ZH_CN`、`SOFATAP_FONT_HI`。缺字时由 fontconfig 回退。字幕使用复杂文字排版（印地语连字、阿拉伯语从右到左）。
- 只想重做部分语言：`--langs en,ja`。
- 构建的 `--media` 目录必须在输出目录之外；它需要底片、封面和 12 个语言版本，缺一个或格式不对都会在写入前报错。

## 时间轴

| 时间（秒） | 画面 | 字幕键 |
| --- | --- | --- |
| 0–3.2 | 标题卡：标志和 Sofatap | `video.cue.intro` |
| 3.2–6.3 | 电视（显示电脑画面）和手机 | `video.cue.setup` |
| 6.5 | 在手机上滑动，电视指针移到一部影片上 | `video.cue.slide` |
| 9.5 | 轻点：左键单击，选中影片 | `video.cue.tap` |
| 11.5 | 连续轻点两下：右键，打开菜单 | `video.cue.double` |
| 14.5–15.6 | 滑到「播放」，轻点，开始模拟播放 | `video.cue.play` |
| 17.3 | 继续播放 | `video.cue.sofa` |
| 20.6–25 | 结尾卡：标志、Sofatap、GitHub 地址 | `video.cue.end` |

左上角全程显示「模拟演示 · 开发预览」标注（`video.label`），右上角是品牌标志。字幕时间在 `src/video/cues.json`，演示步骤的时间在 `src/demo-core.js` 的 `SCRIPT`，两者需要一起改；`record.mjs` 会把实际的步骤时间写到 `timeline.json` 里以便核对。
