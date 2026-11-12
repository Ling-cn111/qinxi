# 琴习 QinXi

在浏览器里弹钢琴、跟着谱子练琴的轻量 Web 应用。

> 参考项目：[AutoPiano 自由钢琴](https://www.autopiano.cn/)（[Wscats/piano](https://github.com/Wscats/piano)）。
> 仅参考其 CSS 钢琴布局思路与社区键盘谱的键位约定，代码用 Vue 3 + TypeScript 重写。

## 技术栈

| 关注点 | 选型 |
| --- | --- |
| 框架 | Vue 3（`<script setup>`）+ Vite + TypeScript（strict） |
| 样式 | 原生 CSS |
| 音频 | 原生 Web Audio API（`AudioBufferSourceNode.start(when)`），不引入第三方调度 |
| 采样 | Salamander Grand Piano，断网时回落内置合成音色 |
| 测试 | Vitest |
| 包管理 | **npm** |

## 快速开始

```bash
npm install
npm run dev      # 开发服务器 http://127.0.0.1:5173
npm run test     # Vitest
npm run build    # 类型检查 + 生产构建
```

## 阶段计划

| 阶段 | 内容 | 分支 | 状态 |
| --- | --- | --- | --- |
| 0 | 仓库与脚手架 | `main` | 完成 |
| 1 | 自由弹奏（88 键、键盘映射、音频引擎） | `feature/free-play` | 待开始 |
| 2 | 键盘谱解析与自动播放 | `feature/parser-autoplay` | 待开始 |
| 3 | 跟弹判定（下落音符、Combo、结算） | `feature/follow-play` | 待开始 |
| 4 | 变速练习与上方键盘谱 | `feature/practice-tools` | 待开始 |
| 5 | 收尾 | `feature/polish` | 待开始 |

每个阶段通过独立分支 + Pull Request 提交，人工核验后再合并。
