# 琴习 QinXi

在浏览器里弹钢琴、跟着谱子练琴的轻量 Web 应用。当前处于 **MVP 阶段 1：自由弹奏**。

- 88 键钢琴（52 白键 / 36 黑键，黑白宽度比 7:5），纯 CSS 布局
- 电脑键盘 + 鼠标 / 触屏双输入，按下即有视觉反馈
- 原生 Web Audio API 直接调度 `AudioBufferSourceNode.start(when)`，不经任何第三方音频调度
- Salamander Grand Piano 采样优先，断网时自动回落到内置合成音色

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
| 音频 | 原生 Web Audio API；采样源 Salamander Grand Piano（mp3 → `decodeAudioData`） |
| 测试 | Vitest（纯逻辑单测，不依赖浏览器） |
| 包管理 | npm |

## 目录结构

```
src/
  audio/      采样库、合成兜底、钢琴引擎（playNote / noteOn / noteOff）、音高工具
  keyboard/   88 键几何布局、键盘映射表
  components/ 钢琴键盘组件
  types/      共享类型（NoteEvent / KeyBinding）
tests/        Vitest 单元测试
```

后续阶段会补上 `src/transport/`（权威时钟与调度）、`src/parser/`（键盘谱解析）、`src/game/`（判定引擎）、`src/data/`（内置谱面）。

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
- 采样：Salamander Grand Piano（`https://tonejs.github.io/audio/salamander/*.mp3`），中央音区优先加载，
  其余后台补齐；每个音取最近锚点并用 `playbackRate` 换算音高。
- 兜底：采样不可用时（离线 / CDN 失败）用加法合成现场渲染类钢琴音色，保证任何环境都能发声。
  此时界面状态显示「内置合成音色」，音色不如真实采样。
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
- `tests/sampleBank.test.ts`：最近锚点选择、播放速率换算、远程采样优先级、兜底合成

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

- 最低三个音（A0 / A♯0 / B0）暂无键盘映射，只能用鼠标 / 触屏演奏。
- 合成兜底音色不如 Salamander 采样；远程采样首次加载需要网络。
- 移动端为横向滚动的 88 键全键盘，窄屏下需要左右滑动。
