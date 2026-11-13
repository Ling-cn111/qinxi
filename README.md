# 琴习 QinXi

在浏览器里弹钢琴、跟着谱子练琴的轻量 Web 应用。当前处于 **MVP 阶段 1：自由弹奏**。

- 88 键钢琴，**5 八度视口**：白键宽 2.775%（AutoPiano 原值），一屏 36 个白键，横向滚动提供低/中/高三档
- 电脑键盘 + 鼠标 / 触屏双输入，按下即有视觉反馈
- 原生 Web Audio API 直接调度 `AudioBufferSourceNode.start(when)`，不经任何第三方音频调度
- 音色使用 **AutoPiano 原版单音采样**（本地 61 个 mp3，C2–C7 全半音），88 键靠相邻采样移调全覆盖
- 深色界面，尺寸/配色严格对齐 AutoPiano：黑漆顶盖、`.wkey` / `.bkey` 的渐变色与边框均取自其源码
- 钢琴下方是**三页签控制台**：显示（键面标注）、声音（乐器目录 + 音量）、键位（方案 + 键盘映射图）

> 参考项目：[AutoPiano 自由钢琴](https://www.autopiano.cn/)（[Wscats/piano](https://github.com/Wscats/piano)）。
> 本仓库仅参考其 **CSS 钢琴布局思路** 与 **社区键盘谱的键位映射约定**，代码用 Vue 3 + TypeScript 全部重写，
> 未继承其 Vue 2 组件与 Tone.js 触发/调度链路。

## 快速开始

包管理器：**npm**（本仓库未提供 lockfile 之外的包管理器配置，请统一使用 npm）。

```bash
npm install
npm run dev      # 开发服务器 http://127.0.0.1:5173
npm run test     # Vitest 单元测试
npm run build    # 类型检查 + 生产构建
npm run preview  # 预览构建产物
```

浏览器首次需要一次用户手势（按键 / 点击）才能启动 `AudioContext`，这是浏览器的自动播放策略。

## 技术栈

| 关注点 | 选型 |
| --- | --- |
| 框架 | Vue 3（`<script setup>`）+ Vite + TypeScript（strict） |
| 样式 | 原生 CSS（组件内 scoped） |
| 音频 | 原生 Web Audio API；采样源为 AutoPiano 原版 mp3（`fetch` + `decodeAudioData`） |
| 测试 | Vitest（纯逻辑单测，不依赖浏览器） |
| 包管理 | npm |

## 目录结构

```
public/samples/piano/   AutoPiano 原版单音采样（61 个 mp3，C2–C7）
src/
  audio/      采样表、采样库、节点池、降级染色、钢琴引擎、音高工具
  keyboard/   88 键几何布局、键盘映射表、键面标注（音名 / 唱名）
  components/ 钢琴键盘、控制台（页签 / 显示 / 声音 / 键位）、键盘映射图、开关
  data/       音色目录（GM 音色表 + 采样接入状态）
  types/      共享类型（NoteEvent / KeyBinding / DeckTab）
tests/        Vitest 单元测试
docs/screenshots/  界面截图（PR 用）
```

后续阶段会补上 `src/transport/`（权威时钟与调度）、`src/parser/`（键盘谱解析）、`src/game/`（判定引擎）、`src/data/`（内置谱面）。

## 钢琴布局数值（对齐 AutoPiano）

取自 `WarpPrism/AutoPiano` 的 `src/components/Piano.vue`，本项目原样沿用：

| 元素 | 数值 |
| --- | --- |
| `.piano-wrap` | `width: 90%; margin: 20px auto; border-radius: 5px; overflow: hidden` |
| `.piano-key-wrap` | 背景 `#222`，一屏 36 个白键，高度 280px |
| `.wkey` | `width: 2.775%`、`height: 100%`、`border: 1px solid #222`、`border-radius: 0 0 5px 5px` |
| `.wkey` 背景 | `linear-gradient(white 10%, rgb(251,251,251) 92%, rgb(220,220,220) 93%, white 97%)` |
| `.wkey:active` | `linear-gradient(#eee 10%, #ddd 60%, #bbb 93%, #ccc 97%)` + 上移 1% / 高 99% + 两侧三角阴影 |
| `.bkey` | 宽 2%（白键的 2/2.775）、高 70%、`linear-gradient(-20deg,#333,#000,#333)`、`border: 1px 2px 7px`、`border-radius: 0 0 2px 2px` |
| 键床 | 52 白键 × 2.775% = **144.3%** 视口宽，滚动容器提供 5 八度窗口 |

**关键点**：2.775% 是「相对 36 键视口」的宽度。88 键有 52 个白键，如果直接平分视口会变成 1.92%，
因此键床被放大到 144.3%，由外层横向滚动裁出 5 八度窗口 —— 视觉上的键宽、疏密与原站一致。

**三档视口**（切换只滚动，不重建 DOM）：低音区 C1–C5 / 中音区 C2–C7 / 高音区 C3–C8，
分别滚动到第 2 / 9 / 16 个白键（单位：白键宽度）。键盘事件始终映射完整 88 键。

## 控制台（钢琴下方）

深色面板，与钢琴同宽（90%），三个页签只切换内容，不做页面跳转。所有状态由 `App.vue` 持有，
子组件通过 `v-model` 读写，因此页签来回切换不会丢设置。

**显示** —— 键面标注的三种元素，直接嵌在琴键里（白键：字符在上、音名在下，13.5px）：

| 开关 | 作用 |
| --- | --- |
| 显示按键提示 | 白键标 `G`，黑键标 `⇧` + 字符（分两行，避免 25px 宽的键放不下） |
| 显示音名 | `C4` / `C♯4` |
| 显示唱名（C 大调） | `Do` / `♯Do`，固定唱名法，跨八度不变 |

音名与唱名共用键面下方同一行，开启其一时自动关闭另一个（`PanelDisplay.vue` 里的两个 `watch`）。

**声音** —— 乐器目录 + 音量。目录是给多音色预留的骨架：29 个条目按 GM 音色表排布，
只有「高音立式钢琴」（AutoPiano 采样）可用，其余 28 张卡片 `disabled` 并压暗。
接入新采样只需修改 `src/data/instruments.ts` 里对应条目的 `available`，面板结构不用动。
音量与顶栏滑块共用同一个 `volume`，双向同步。

**键位** —— 三套方案的按钮（当前仅 AutoPiano / VirtualPiano 方案可用，另两套虚线禁用）、
一段方案说明，以及**电脑键盘映射图**：5 排键帽按 15 个单位宽度排版，有映射的键显示音名
（可切换成键盘字符），演奏时对应键帽点亮 —— 这是「哪个键弹哪个音」的直观答案。

## 键盘映射

AutoPiano 社区键盘谱用「字母 / 数字行 + Shift 组合」描述旋律，本项目的映射表按同样约定实现，
定义在 `src/keyboard/keyMap.ts`，可自由修改。

**白键**：四排由低到高连续排列，覆盖 C2–C8。

| 行 | 键位 | 起始音 |
| --- | --- | --- |
| 下排 | `Z X C V B N M , . /` | C2 |
| 中排 | `A S D F G H J K L ; '` | F3 |
| 上排 | `Q W E R T Y U I O P [ ]` | C5 |
| 数字排 | `1 2 3 4 5 6 7 8 9 0` | A6 |

其中 `G` 正好落在中央 C（C4），便于以 C 为锚点找音。

**黑键**：`Shift` + 左侧白键（`⇧Z` = C♯2，`⇧G` = C♯4，`⇧K` = F♯4……）；
同时接受 `Alt` + 右侧白键作为同义写法（`⌥X` 也是 C♯2）。`E` / `B` 上方没有黑键，对应组合不生效。

**映射实现说明**：键位用 `KeyboardEvent.code` 匹配（而非 `key`），因此不受 Shift 改变字符、输入法或大小写影响；
`Ctrl` / `Meta` 组合不参与演奏，避免与浏览器快捷键冲突。

**音域**：键盘可弹 36–108（C2–C8，共 73 个音）。88 键中最低的 A0 / A♯0 / B0 没有分配物理按键（键盘只有 4 排），
可用鼠标 / 触屏点击演奏。

## 音频实现

- `src/audio/PianoEngine.ts`：唯一音频出口。所有发声都是 `AudioBufferSourceNode` → `GainNode` → 主音量 → `DynamicsCompressor` → `destination`，
  调度时刻由 `AudioContext.currentTime` 决定，按键路径上没有任何 `await`，不引入额外延迟。
- 音源优先级：**本地 AutoPiano 采样 → Salamander（加染色）→ 现场合成**，三者共用同一套复音管理与调度。
- **逐音归一化**：每个采样解码后取峰值，增益 `0.89 / peak`（目标 -1dBFS）。实测同一批采样里
  C4 峰值 0.536、E4 0.289、G4 0.287（相差 5.7dB），不归一化会出现明显的"有的音响有的音闷"。
- **包络**：每个 `AudioBufferSourceNode` 串一个 `GainNode`，`setValueAtTime(0)` → 8ms 线性起音 →
  `setTargetAtTime(0)` 指数衰减，衰减时常数按音区为 2.5s（<C3）/ 1.8s（C3–B4）/ 1.2s（≥C5）。
- **总线**：所有发声汇入一个 `GainNode`，默认 0.7；活跃 source 超过 12 个时按 `12/active` 等比下压，
  最低 0.4。总线上再串一级阈值 -1dB 的峰值限制器兜底（实测三音和弦叠加峰 0.784 / -2.11dBFS，未削顶）。
- 采样来源：AutoPiano（`Wscats/piano`）的 `public/samples/piano/*.mp3`，原样放在本项目 `public/samples/piano/`，
  共 61 个音（C2–C7 全半音）。文件名编号是该仓库自定的（`A2 → a54.mp3`），映射表见 `src/audio/autopianoSamples.ts`。
  原表漏了 A♯2，其 `b54.mp3` 实际存在于目录中，已按同组编号规律补回。
- 覆盖 88 键：C2–C7 之外的低音 / 高音用最近锚点 `playbackRate` 移调（如 A0 用 C2 降低 15 个半音），不会出现哑键。
- 加载：中央音区优先、6 路并发，`fetch` 后 `decodeAudioData` 成 `AudioBuffer`；每个发声复用 `NodePool` 里的 `GainNode`。
- 降级：本地采样拿不到时改用远程 Salamander，并在主链路上串一条 4.2kHz 低通 + tanh 软削波（`src/audio/legacyTone.ts`），
  把过于干净的采样压回"旧录音"质感；两者都失败才用加法合成，界面状态会如实显示当前音源。
- 发声参数校验（音高 21–108、力度 0–127、`when` 不得早于当前时钟）由 `src/audio/note.ts` 的
  `normalizeNoteParams` 负责，非法请求抛 `RangeError`，引擎侧记录告警并忽略。

## 测试

```bash
npm run test
```

当前覆盖：

- `tests/pianoLayout.test.ts`：88 键布局（52/36 拆分、黑白比例、黑键落点、坐标单调性）
- `tests/keyMap.test.ts`：映射表（音域覆盖、C4 锚点、Shift/Alt 黑键、无黑键位回落、字符索引、修饰键判定）
- `tests/note.test.ts`：音高工具与 `playNote` 参数校验边界
- `tests/sampleBank.test.ts`：最近锚点选择、播放速率换算、来源优先级、88 键移调兜底
- `tests/autopianoSamples.test.ts`：采样表完整性（61 音全半音、文件真实存在、无多余/无重复、命名前缀）
- `tests/nodePool.test.ts`：GainNode 复用、断开连接、上限与并发借用
- `tests/legacyTone.test.ts`：软削波曲线（端点归一、奇对称、单调、驱动量）
- `tests/gain.test.ts`：峰值检测、逐音归一化、包络衰减时常数、总线限幅与下压曲线
- `tests/labels.test.ts`：唱名映射（含黑键升号、跨八度）、三档音名模式、黑键提示拆行
- `tests/instruments.test.ts`：音色目录（id 唯一、默认音色可用、GM 编号合法且不重复）
- `tests/pianoLayout.test.ts`（扩充）：2.775% 键宽、2% 黑键宽、144.3% 键床、三档视口滚动单位

Canvas 渲染与音频节点创建不做单测，验收方式见 PR 描述中的手动步骤。

## 阶段进度

| 阶段 | 内容 | 分支 | 状态 |
| --- | --- | --- | --- |
| 0 | 仓库与脚手架 | `main` | 完成 |
| 1 | 自由弹奏 | `feature/free-play` | 进行中 |
| 2 | 谱面解析与自动播放 | `feature/parser-autoplay` | 待开始 |
| 3 | 跟弹判定 | `feature/follow-play` | 待开始 |
| 4 | 变速与上方键盘谱 | `feature/practice-tools` | 待开始 |
| 5 | 收尾 | `feature/polish` | 待开始 |

## 已知限制

- 最低三个音（A0 / A♯0 / B0）暂无键盘映射（键盘只有四排，C2–C8 已排满），只能用鼠标 / 触屏演奏。
- AutoPiano 采样的音色取决于原仓库文件，未做力度分层：力度只影响增益，不影响音色明暗。
- 采样范围外（A0–B1、C♯7–C8）靠移调，音色会比原位采样略"薄"。
- 声音面板只有「高音立式钢琴」真正可切换，其余 28 种是占位；键位方案只实现了 AutoPiano 一套。
- 移动端为横向滚动的 88 键全键盘，窄屏下需要左右滑动。
