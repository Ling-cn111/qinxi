<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import PianoKeyboard from '@/components/PianoKeyboard.vue';
import ControlDeck from '@/components/ControlDeck.vue';
import NoteVisualizer from '@/components/NoteVisualizer.vue';
import ThemeMenu from '@/components/ThemeMenu.vue';
import UiToggle from '@/components/UiToggle.vue';
import FollowCanvas from '@/components/FollowCanvas.vue';
import ScoreScroller from '@/components/ScoreScroller.vue';
import CalibrationPanel from '@/components/CalibrationPanel.vue';
import { PianoEngine, type EngineStatus } from '@/audio/PianoEngine';
import {
  BASE_START_MIDI,
  isBindableCode,
  modifierFromEvent,
  PianoKeyMap,
  resolveBinding,
  type CustomBinding,
} from '@/keyboard/keyMap';
import {
  clearCustomBindings,
  loadCustomBindings,
  saveCustomBindings,
} from '@/keyboard/customKeymap';
import {
  bindingsSignature,
  loadKeymapSchemes,
  MAX_SCHEME_NAME,
  newSchemeId,
  saveKeymapSchemes,
  type KeymapScheme,
} from '@/keyboard/keymapSchemes';
import { midiToName } from '@/audio/note';
import { BUILT_IN_SCORES, DEFAULT_SCORE_ID, findScore, loadScore } from '@/data/scores';
import { activeNotesAt, samePitchSet } from '@/transport/activeNotes';
import { Transport, type TransportSnapshot } from '@/transport/transport';
import { collectMissed, judgeHit, type Grade, type Judgment } from '@/game/judge';
import { findLearnMatch, groupEndIndex, isGroupComplete, nextTargetHints } from '@/game/learn';
import {
  CALIBRATION_TAPS_MAX,
  CALIBRATION_TAPS_REQUIRED,
  computeOffset,
  loadInputOffsetMs,
  saveInputOffsetMs,
  type CalibrationResult,
} from '@/game/calibration';
import type { NoteEvent } from '@/types';
import type { NoteLabelMode } from '@/keyboard/labels';
import { DEFAULT_VIEWPORT_ID, PIANO_VIEWPORTS, type PianoViewport } from '@/keyboard/layout';
import type { DeckTab } from '@/types';

const engine = new PianoEngine();

const customBindings = ref<CustomBinding[]>(loadCustomBindings());
const schemes = ref<KeymapScheme[]>(loadKeymapSchemes());

const viewportId = ref<PianoViewport['id']>(DEFAULT_VIEWPORT_ID);
/**
 * 键位跟随音区：开的时候，切换视口会把整组键位跟着挪一个八度，
 * 让同一套按键弹到当前看得见的那段琴键上（关着时键位固定在 C2–C7）。
 */
const followViewport = ref(false);

/** 映射起点：跟随模式对齐视口最左侧的音（C1 / C2 / C3），否则固定在 C2 */
function keymapStartMidi(): number {
  if (!followViewport.value) return BASE_START_MIDI;
  const target = PIANO_VIEWPORTS.find((item) => item.id === viewportId.value);
  return target?.startPitch ?? BASE_START_MIDI;
}

/**
 * 编辑时点到的音高是琴键上的绝对值，落盘要换回默认布局（C2 起）的坐标 ——
 * 这样自定义键位会跟着音区一起平移，而不是留在一个绝对音高上。
 */
function toBasePitch(pitch: number): number {
  return pitch - (keymapStartMidi() - BASE_START_MIDI);
}

function createKeyMap(): PianoKeyMap {
  return new PianoKeyMap({ startMidi: keymapStartMidi(), custom: customBindings.value });
}

const keyMap = shallowRef(createKeyMap());

/**
 * 当前键位对应哪个方案：把改动列表拼成签名，和每个方案比一次。
 * 这样无论从哪条路径改键位（绑定 / 空置 / 恢复），标签高亮都自动正确，
 * 也不需要额外存「上次应用了哪个方案」。
 */
const activeSchemeId = computed<string | null>(() => {
  const current = bindingsSignature(customBindings.value);
  const hit = schemes.value.find((item) => bindingsSignature(item.bindings) === current);
  if (hit) return hit.id;
  return current === '' ? 'default' : null;
});

const pressed = reactive(new Set<number>());
const status = ref<EngineStatus>(engine.status);
const volume = ref(100);
const recent = ref<string[]>([]);
const visualizer = ref<InstanceType<typeof NoteVisualizer> | null>(null);
const followCanvas = ref<InstanceType<typeof FollowCanvas> | null>(null);

// 控制台状态
const deckTab = ref<DeckTab>('display');
const showHints = ref(true);
const showNoteNames = ref(true);
const showSolfege = ref(false);
const diagramMode = ref<'char' | 'note'>('note');

// 自定义键位
const editMode = ref(false);

// ---------------------------------------------------------------- 延迟校准
const calibrationOpen = ref(false);
const calibrationPhase = ref<'idle' | 'running' | 'settled'>('idle');
/** 已收录的每次按键偏差（ms，带符号：正 = 按晚了） */
const calibrationTaps = ref<number[]>([]);
const calibrationResult = ref<CalibrationResult | null>(null);
/** 输入延迟修正（ms）：判定时刻 = AudioContext.currentTime − inputOffset */
const inputOffsetMs = ref(loadInputOffsetMs(window.localStorage));
/** 校准用合成谱：120 BPM，一拍一个长条，共 16 拍（8 次即结算，后面是容错余量） */
const CALIB_BEATS = 16;
const calibNotes = shallowRef<NoteEvent[]>(
  Array.from({ length: CALIB_BEATS }, (_, index) => ({
    id: `calib${index}`,
    pitch: 96,
    startBeat: index,
    durationBeats: 0.5,
  })),
);

watch(inputOffsetMs, (value) => {
  saveInputOffsetMs(window.localStorage, value);
});

/** 校准节拍器：onNote 发一声「嗒」（C7 采样短音），其余与主 Transport 同一套时钟机制 */
const calibrationTransport = new Transport({
  now: () => engine.now(),
  bpm: 120,
  callbacks: {
    onNote: (item) => engine.playNote(item.pitch, item.when, 0.09, 34),
    onEnd: () => finishCalibration(false),
  },
});

function openCalibration(): void {
  calibrationOpen.value = true;
  calibrationPhase.value = 'idle';
  calibrationResult.value = null;
}

function closeCalibration(): void {
  if (calibrationPhase.value === 'running') calibrationTransport.stop();
  calibrationOpen.value = false;
}

function startCalibration(): void {
  void engine.start();
  calibrationTaps.value = [];
  calibrationResult.value = null;
  calibrationPhase.value = 'running';
  calibrationTransport.load(calibNotes.value, { bpm: 120 });
  // 2s 预备：第一根长条从画布顶部落到线，和跟弹一个手感
  calibrationTransport.play(2);
}

/**
 * 收一次按键偏差。取「离当前拍位最近的整数拍」为标准点，
 * 同一拍多次按键只算第一次（防抖）。预备期（负拍位）不收。
 */
function recordCalibrationTap(): void {
  if (calibrationPhase.value !== 'running' || !calibrationTransport.playing) return;
  const beatNow = calibrationTransport.rawBeat;
  if (beatNow < 0) return;
  const beatIndex = Math.round(beatNow);
  if (beatIndex < 0 || beatIndex > CALIB_BEATS - 1) return;
  // 同一拍多次按键只算第一次
  if (tapBeats.has(beatIndex)) return;
  tapBeats.add(beatIndex);
  const deltaMs = (beatNow - beatIndex) * calibrationTransport.secondsPerBeat * 1000;
  calibrationTaps.value = [...calibrationTaps.value, deltaMs];
  if (calibrationTaps.value.length >= Math.min(CALIBRATION_TAPS_REQUIRED, CALIBRATION_TAPS_MAX)) {
    finishCalibration(true);
  }
}

/** 同一拍去重用的记录 */
const tapBeats = new Set<number>();

/** 结算：8 次满 → 统计；节拍播完仍不足 → 失败 */
function finishCalibration(complete: boolean): void {
  calibrationTransport.stop();
  tapBeats.clear();
  if (complete && calibrationTaps.value.length >= CALIBRATION_TAPS_REQUIRED) {
    const result = computeOffset(calibrationTaps.value);
    calibrationResult.value = result;
    if (result.stable) inputOffsetMs.value = Math.round(result.offsetMs);
  } else {
    calibrationResult.value = {
      offsetMs: 0,
      stddevMs: Number.POSITIVE_INFINITY,
      sampleCount: calibrationTaps.value.length,
      stable: false,
    };
  }
  calibrationPhase.value = 'settled';
}

/** 手动微调：±5ms 一档，随改随存 */
function adjustOffset(deltaMs: number): void {
  inputOffsetMs.value = Math.max(-500, Math.min(500, inputOffsetMs.value + deltaMs));
}

/** 恢复默认（0） */
function resetOffset(): void {
  inputOffsetMs.value = 0;
}

/** 校准画布不显示命中反馈，用同一个空 Map 占位 */
const emptyJudged = new Map<number, Grade>();

// ---------------------------------------------------------------- 自动播放 / 跟弹
/** 选中的内置曲谱 */
const scoreId = ref<string>(DEFAULT_SCORE_ID);
/** idle = 没在播；playing / paused 对应 Transport 的状态 */
const playState = ref<'idle' | 'playing' | 'paused'>('idle');
/**
 * 播放模式：listen = 自动播放（引擎发声，琴键自己亮）；
 * follow = 跟弹（Transport 只当节拍器，声音由用户按键发，Canvas 落音符 + 判定）；
 * learn = 自助学弹（没有进度条与时钟推进，只显示谱面，按对当前音才往后走）。
 */
const playMode = ref<'listen' | 'follow' | 'learn'>('listen');
/** 自动播放正在响的音（琴键高亮的数据源，渲染循环里更新） */
const autoPressed = ref<ReadonlySet<number>>(new Set());
const playProgressText = ref('');
/** 谱面按「默认布局（C2 起）+ 用户自定义」解释，不跟随音区视口 —— 换音区不能让曲子变调 */
const baseKeyMap = computed(() => new PianoKeyMap({ custom: customBindings.value }));
const currentNotesRef = shallowRef<NoteEvent[]>([]);
/** 跟弹：当前谱面的 BPM（决定下落速度） */
const followBpm = ref(96);
/**
 * 跟弹起播预备（秒）：锚点推到未来，第一条音要过这么久才到判定线，
 * 长条正好从画布顶部落到线 —— 给玩家完整的下落时间反应，不做零帧起手。
 * 必须与 FollowCanvas 的 LEAD_SECONDS 一致（长条提前这么久入场）。
 */
const FOLLOW_PREROLL_SECONDS = 2;
/**
 * 变速练习：50–100（%）。只改播放 BPM —— 判定窗口仍按「拍差 × 当前拍长」换算回
 * 物理毫秒（见 judge.ts），所以慢速下判定不会变宽松。
 */
const speed = ref(100);

// ---------------------------------------------------------------- A-B 循环与进度条
/** 循环点（拍位）；A/B 都设置后才启用循环。停止后保留，换曲或装谱时清除 */
const loopA = ref<number | null>(null);
const loopB = ref<number | null>(null);
/** 进度条状态：onTick 推着走，拖动时让位给 scrubBeat */
const progressBeat = ref(0);
const totalBeatsUi = ref(0);
const scrubbing = ref(false);
const scrubBeat = ref(0);

/** 跟弹视图显示模式：下落画布 / 键盘谱 / 两者（持久化） */
const SCORE_VIEW_KEY = 'qinxi:scoreview:v1';
function loadScoreView(): 'falling' | 'sheet' | 'both' {
  try {
    const raw = window.localStorage.getItem(SCORE_VIEW_KEY);
    if (raw === 'falling' || raw === 'sheet' || raw === 'both') return raw;
  } catch { /* 隐私模式忽略 */ }
  return 'both';
}
const scoreView = ref<'falling' | 'sheet' | 'both'>(loadScoreView());
watch(scoreView, (value) => {
  try {
    window.localStorage.setItem(SCORE_VIEW_KEY, value);
  } catch { /* 隐私模式忽略 */ }
});

/** 谱面字符样式：键帽字母 / 音名 —— 二选一，互斥显示（持久化） */
const SCORE_CHAR_KEY = 'qinxi:scorechar:v1';
function loadScoreChar(): 'char' | 'note' {
  try {
    const raw = window.localStorage.getItem(SCORE_CHAR_KEY);
    if (raw === 'char' || raw === 'note') return raw;
  } catch { /* 隐私模式忽略 */ }
  return 'char';
}
const scoreChar = ref<'char' | 'note'>(loadScoreChar());
watch(scoreChar, (value) => {
  try {
    window.localStorage.setItem(SCORE_CHAR_KEY, value);
  } catch { /* 隐私模式忽略 */ }
});

/** 谱面的显示字符：键帽字母（按当前键位表反查）或音名（C4 / A#5），空置用 · 占位 */
const scoreChars = computed(() =>
  currentNotesRef.value.map((note) =>
    scoreChar.value === 'note'
      ? midiToName(note.pitch)
      : keyMap.value.charFor(note.pitch) ?? '·',
  ),
);
/** 音名（C#4 这类三字符）比键帽字母宽，字符格随之加宽 */
const scoreCellWidth = computed(() => (scoreChar.value === 'note' ? 36 : 26));
/** 跟弹：音符下标 → 判定等级。判定频率高，走可变对象，不走 Vue 响应式 */
const judgedMap = new Map<number, Grade>();
const followStats = reactive({ perfect: 0, good: 0, miss: 0 });
const lastGrade = ref<Grade | null>(null);
/** 弹完（或停止）后的结算：各档数量 + 占谱面总音符数的比例 */
const followSummary = ref('');
/** 跟弹进行中（判定与清扫挂在这个条件下） */
const followActive = computed(() => playMode.value === 'follow' && playState.value === 'playing');

// ---------------------------------------------------------------- 自助学弹
/** 学弹指针：下一个待弹音的下标；-1 = 未开始。没有时钟，按对当前组才推进 */
const learnCursor = ref(-1);
/** 已弹对的音数（judgedMap 是可变对象不进响应式，这里留个响应式镜像给界面） */
const learnDone = ref(0);
/** 学弹中的错音次数：错音照常发声，但不推进指针 */
const learnWrong = ref(0);
/** 学弹进行中 */
const learnActive = computed(() => playMode.value === 'learn' && playState.value === 'playing');
/** 学弹进度文案：第 x / n 音 */
const learnProgressText = computed(() => {
  const total = currentNotesRef.value.length;
  if (total === 0 || learnCursor.value < 0) return '';
  return `第 ${Math.min(learnCursor.value + 1, total)} / ${total} 音`;
});

// ---------------------------------------------------------------- 下一音琴键黄提示
/** 「下一个要弹的音」的音高集合：跟弹 = 第一个未判定的组；学弹 = 当前待弹组 */
const hintPitches = ref<ReadonlySet<number>>(new Set());

/**
 * 判定 / 漏按清扫共用的拍位：先按输入延迟修正时刻，再换算拍位。
 * `rawBeat` = beatFromAudioTime(now)，这里只是把 now 换成 now − offset。
 */
function correctedBeat(): number {
  if (!transport.playing) return transport.rawBeat;
  return transport.beatFromAudioTime(engine.now() - inputOffsetMs.value / 1000);
}
let currentNotes: NoteEvent[] = [];
let renderRafId = 0;

/**
 * 播放时间轴：时钟只有一个（engine.now() = AudioContext.currentTime）。
 * onNote 只管把音按绝对时刻交给引擎发声；琴键高亮不在 onNote 里做 ——
 * 那时离发声还有约 100ms，会提前亮。高亮由渲染循环按 Transport 的拍位推。
 */
const transport = new Transport({
  now: () => engine.now(),
  bpm: 96,
  callbacks: {
    // 跟弹模式下 Transport 只当节拍器：不发声，声音由用户按键发
    onNote: (item) => {
      if (playMode.value === 'listen') engine.playNote(item.pitch, item.when, item.duration, item.velocity);
    },
    onCancelAll: () => engine.stopAll(),
    onTick: (snapshot) => updateProgress(snapshot),
    onEnd: () => onPlaybackEnd(),
    onLoopJump: (aBeat) => onLoopJumped(aBeat),
  },
});

/**
 * A-B 循环跳回 A 点：把 [A, B) 段的判定清掉、统计回退 —— 这段可以重新死磕，
 * 重弹的音重新判定，不会因为「已经判过」而全被跳过。
 */
function onLoopJumped(aBeat: number): void {
  for (let index = 0; index < currentNotesRef.value.length; index += 1) {
    const note = currentNotesRef.value[index];
    if (note.startBeat < aBeat - 1e-6) continue;
    const grade = judgedMap.get(index);
    if (!grade) continue;
    judgedMap.delete(index);
    followStats[grade] -= 1;
  }
}

function updateProgress(snapshot: TransportSnapshot): void {
  playProgressText.value = `${snapshot.beat.toFixed(1)} / ${snapshot.totalBeats.toFixed(1)} 拍`;
  totalBeatsUi.value = snapshot.totalBeats;
  if (!scrubbing.value) progressBeat.value = snapshot.beat;
}

/** 渲染循环：每帧从拍位推出「此刻该亮的键」，集合没变就不动 DOM（CSS 类切换交给 PianoKeyboard） */
function renderAutoplayKeys(): void {
  // rawBeat 不做钳制：留白期是负数，此时不该有任何音亮着
  const beat = transport.rawBeat;
  const active = activeNotesAt(currentNotes, beat);
  const next = new Set(active.map((note) => note.pitch));
  const previous = autoPressed.value;
  if (!samePitchSet(next, previous)) {
    autoPressed.value = next;
    for (const note of active) {
      if (!previous.has(note.pitch)) visualizer.value?.trigger(note.pitch, 100);
    }
  }
  renderRafId = playState.value === 'playing' ? requestAnimationFrame(renderAutoplayKeys) : 0;
}

function stopRenderLoop(): void {
  if (renderRafId) cancelAnimationFrame(renderRafId);
  renderRafId = 0;
}

// ---------------------------------------------------------------- 跟弹判定

const GRADE_ORDER: ReadonlyArray<Grade> = ['perfect', 'good', 'miss'];

/** 结算文案：各档数量 + 占谱面总音符数的百分比（错音多按会让 Miss 超过总数，照实显示） */
function buildFollowSummary(totalNotes: number): string {
  if (totalNotes === 0) return '';
  const parts = GRADE_ORDER.map((grade) => {
    const count = followStats[grade];
    const percent = totalNotes > 0 ? ((count / totalNotes) * 100).toFixed(1) : '0.0';
    return `${GRADE_LABEL[grade]} ${count} (${percent}%)`;
  });
  return `跟弹统计（共 ${totalNotes} 音）：${parts.join(' · ')}`;
}

function resetFollowProgress(): void {
  judgedMap.clear();
  followStats.perfect = 0;
  followStats.good = 0;
  followStats.miss = 0;
  lastGrade.value = null;
  followSummary.value = '';
}

const GRADE_LABEL: Record<Grade, string> = { perfect: 'Perfect', good: 'Good', miss: 'Miss' };

function fmtDelta(deltaMs: number): string {
  const rounded = Math.round(deltaMs);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/** 记一条判定：统计 + 控制台日志（验收看这里） */
function recordJudgment(hit: Judgment): void {
  followStats[hit.grade] += 1;
  lastGrade.value = hit.grade;
  if (hit.note) {
    console.info(
      `[琴习·判定] ${GRADE_LABEL[hit.grade]} ${midiToName(hit.note.pitch)} Δ${fmtDelta(hit.deltaMs)}ms`,
    );
  } else {
    console.info(`[琴习·判定] MISS（错音）${midiToName(hit.pitch)}`);
  }
}

/** 用户按键（键盘 / 点琴键都走这里）：音高 + 时间双重判定 */
function judgeFollowPress(pitch: number): void {
  // hitBeat 从 AudioContext.currentTime 换算（transport.rawBeat 内部就是 beatAtTime，
  // 与自动播放的排程锚点同源同刻）
  const hit = judgeHit(
    { pitch, hitBeat: correctedBeat() },
    currentNotesRef.value,
    judgedMap,
    transport.secondsPerBeat,
  );
  if (hit.note) judgedMap.set(hit.index, hit.grade);
  // 四档都在判定线上闪：Perfect 金 / Great·Good 白 / Miss 红
  followCanvas.value?.flash(hit.pitch, hit.grade);
  recordJudgment(hit);
}

/** 漏按清扫：把窗口已过、还没判的音记成 Miss */
function recordMissed(index: number): void {
  const item = currentNotesRef.value[index];
  judgedMap.set(index, 'miss');
  followStats.miss += 1;
  lastGrade.value = 'miss';
  console.info(`[琴习·判定] MISS（漏按）${midiToName(item.pitch)} @${item.startBeat}拍`);
}

/** 跟弹渲染循环：每帧清扫一次漏按 + 刷新「下一音」琴键黄提示（判定本身在按键事件里做） */
function renderFollowLoop(): void {
  for (const index of collectMissed(currentNotesRef.value, judgedMap, correctedBeat(), transport.secondsPerBeat)) {
    recordMissed(index);
  }
  updateFollowHint();
  renderRafId = followActive.value ? requestAnimationFrame(renderFollowLoop) : 0;
}

/** 跟弹的下一音提示：从谱面头找第一个未判定的音，它所在组的全部未判成员一起亮 */
function updateFollowHint(): void {
  const next = nextTargetHints(currentNotesRef.value, judgedMap);
  const previous = hintPitches.value;
  // 集合没变就不换实例，避免每帧都触发 PianoKeyboard 的 props 比较
  if (next.size === previous.size && [...next].every((pitch) => previous.has(pitch))) return;
  hintPitches.value = next;
}

function startRenderLoop(): void {
  if (renderRafId) cancelAnimationFrame(renderRafId);
  renderRafId = playMode.value === 'follow' ? requestAnimationFrame(renderFollowLoop) : requestAnimationFrame(renderAutoplayKeys);
}

function startPlayback(): void {
  if (playMode.value === 'learn') {
    startLearn();
    return;
  }
  const score = findScore(scoreId.value);
  if (!score) return;
  if (editMode.value) exitEdit();
  // 用户手势里启动音频上下文；AudioContext 在 start() 里同步创建，engine.now() 随即可用
  void engine.start();
  const parsed = loadScore(score, baseKeyMap.value);
  if (parsed.warnings.length > 0) {
    console.warn('[琴习] 谱面解析有警告：', parsed.warnings);
  }
  currentNotes = parsed.notes;
  currentNotesRef.value = parsed.notes;
  followBpm.value = (score.bpm * speed.value) / 100;
  resetFollowProgress();
  // 空闲时用户可能拖过进度条：记住落点，装谱后回到那里（「拖到哪就从哪播」）
  // （beat getter 在非播放态返回暂停停留点；播放中不会走进 startPlayback）
  const resumeBeat = transport.beat;
  transport.load(parsed.notes, { bpm: followBpm.value });
  // 死磕场景：停止 / 换播放后再播，循环点仍然保留（load 会清 transport 侧，这里重挂）
  if (loopA.value !== null && loopB.value !== null) {
    try {
      transport.setLoop(loopA.value, loopB.value);
    } catch {
      loopA.value = null;
      loopB.value = null;
    }
  }
  if (resumeBeat > 0) transport.seek(resumeBeat);
  transport.play(playMode.value === 'follow' ? FOLLOW_PREROLL_SECONDS : undefined);
  playState.value = 'playing';
  startRenderLoop();
}

/**
 * 自助学弹：不用 Transport 推进（不 play，没有任何时钟在走）。
 * 谱面装好后指针停在第一个音，「下一个要弹的音」在琴上亮黄，
 * 按对当前组（和弦要弹满）指针才推到下一组 —— 快慢完全由学习者掌握。
 */
function startLearn(): void {
  const score = findScore(scoreId.value);
  if (!score) return;
  if (editMode.value) exitEdit();
  void engine.start();
  const parsed = loadScore(score, baseKeyMap.value);
  if (parsed.warnings.length > 0) {
    console.warn('[琴习] 谱面解析有警告：', parsed.warnings);
  }
  currentNotes = parsed.notes;
  currentNotesRef.value = parsed.notes;
  followBpm.value = (score.bpm * speed.value) / 100;
  resetFollowProgress();
  learnWrong.value = 0;
  learnDone.value = 0;
  // 只装谱统一状态（清循环 / 归零），学弹全程不 play
  transport.load(parsed.notes, { bpm: followBpm.value });
  learnCursor.value = 0;
  updateLearnHints();
  followSummary.value = '';
  playState.value = 'playing';
  console.info(`[琴习·学弹] 开始「${score.title}」：共 ${parsed.notes.length} 音，按对当前音才往后走`);
}

/** 学弹的下一音提示：当前组里还没弹的音一起亮 */
function updateLearnHints(): void {
  const notes = currentNotesRef.value;
  const cursor = learnCursor.value;
  const set = new Set<number>();
  if (cursor >= 0 && cursor < notes.length) {
    const end = groupEndIndex(notes, cursor);
    for (let index = cursor; index < end; index += 1) {
      if (!judgedMap.has(index)) set.add(notes[index].pitch);
    }
  }
  hintPitches.value = set;
}

/** 学弹按键：命中当前组 → 标记并（弹满时）推进；错音只计数，指针不动 */
function handleLearnPress(pitch: number): void {
  const notes = currentNotesRef.value;
  const cursor = learnCursor.value;
  const matched = findLearnMatch(notes, cursor, judgedMap, pitch);
  if (matched.length === 0) {
    learnWrong.value += 1;
    lastGrade.value = 'miss';
    return;
  }
  for (const index of matched) {
    judgedMap.set(index, 'perfect');
    console.info(`[琴习·学弹] ✓ ${midiToName(notes[index].pitch)}（${learnDone.value + 1}/${notes.length}）`);
  }
  learnDone.value += matched.length;
  lastGrade.value = 'perfect';
  if (isGroupComplete(notes, cursor, judgedMap)) {
    learnCursor.value = groupEndIndex(notes, cursor);
    if (learnCursor.value >= notes.length) {
      // 全谱弹完：收摊，结算行交给 followSummary
      playState.value = 'idle';
      hintPitches.value = new Set();
      followSummary.value = `学弹完成：共 ${notes.length} 音 · 错音 ${learnWrong.value} 次`;
      console.info(`[琴习·学弹] 完成「${scoreId.value}」：错音 ${learnWrong.value} 次`);
      return;
    }
  }
  updateLearnHints();
}

function togglePlay(): void {
  // 学弹没有「暂停」语义：播放键 = 开始 / 重新开始
  if (playMode.value === 'learn') {
    startLearn();
    return;
  }
  if (playState.value === 'playing') {
    transport.pause();
    playState.value = 'paused';
    stopRenderLoop();
    autoPressed.value = new Set();
    return;
  }
  if (playState.value === 'paused') {
    transport.play();
    playState.value = 'playing';
    startRenderLoop();
    return;
  }
  startPlayback();
}

function stopPlayback(): void {
  // 停止前先把跟弹里「已落过线但没判」的音清成 Miss（stop 会把拍位归零）
  if (followActive.value) {
    const beat = transport.rawBeat;
    for (let index = 0; index < currentNotesRef.value.length; index += 1) {
      if (!judgedMap.has(index) && currentNotesRef.value[index].startBeat < beat) recordMissed(index);
    }
  }
  transport.stop();
  playState.value = 'idle';
  stopRenderLoop();
  autoPressed.value = new Set();
  hintPitches.value = new Set();
  if (playMode.value === 'follow') {
    followSummary.value = buildFollowSummary(currentNotesRef.value.length);
  } else if (playMode.value === 'learn') {
    learnCursor.value = -1;
    followSummary.value = '';
  }
  updateProgress(transport.snapshot);
}

function onPlaybackEnd(): void {
  // 播完：剩下没弹的音全部记 Miss（漏按）
  if (playMode.value === 'follow') {
    for (let index = 0; index < currentNotesRef.value.length; index += 1) {
      if (!judgedMap.has(index)) recordMissed(index);
    }
    followSummary.value = buildFollowSummary(currentNotesRef.value.length);
  }
  playState.value = 'idle';
  stopRenderLoop();
  autoPressed.value = new Set();
  hintPitches.value = new Set();
  updateProgress({ ...transport.snapshot, beat: 0 });
}

/**
 * 松手应用变速：播放中 Transport 重锚续播（拍位连续），空闲 / 暂停只改拍长。
 * 下落画布的 pxPerBeat 跟随 followBpm，变速后下落速度同步变慢。
 */
function applySpeed(): void {
  const score = findScore(scoreId.value);
  if (!score) return;
  followBpm.value = (score.bpm * speed.value) / 100;
  transport.setTempo(followBpm.value);
}

/** 设 A / 设 B：取当前拍位（播放 / 暂停都取停留点） */
function setLoopPoint(which: 'a' | 'b'): void {
  const beat = Math.round(transport.beat * 100) / 100;
  if (which === 'a') {
    if (loopB.value !== null && beat >= loopB.value) {
      flash('A 点必须设在 B 点之前');
      return;
    }
    loopA.value = beat;
  } else {
    if (loopA.value === null) {
      flash('先设 A 点，再设 B 点');
      return;
    }
    if (beat <= loopA.value) {
      flash('B 点必须设在 A 点之后');
      return;
    }
    loopB.value = beat;
  }
  if (loopA.value !== null && loopB.value !== null) {
    transport.setLoop(loopA.value, loopB.value);
  }
}

function clearLoopRange(): void {
  loopA.value = null;
  loopB.value = null;
  transport.clearLoop();
}

function onScrubInput(event: Event): void {
  scrubbing.value = true;
  scrubBeat.value = Number((event.target as HTMLInputElement).value);
}

function onScrubEnd(): void {
  if (scrubbing.value) seekTo(scrubBeat.value);
  scrubbing.value = false;
}

/** 拖进度条跳转：空闲时落到该拍（下次播放从这开始），播放 / 暂停中即时 seek */
function seekTo(beat: number): void {
  const total = transport.snapshot.totalBeats || totalBeatsUi.value || 0;
  const target = Math.max(0, Math.min(beat, total));
  transport.seek(target);
  progressBeat.value = target;
}

/** 进度条上的 A-B 区段底色 */
const loopTrackStyle = computed(() => {
  const total = totalBeatsUi.value || 1;
  const pct = (value: number) => `${((value / total) * 100).toFixed(2)}%`;
  const a = loopA.value;
  const b = loopB.value;
  const dim = 'rgba(var(--qin-accent-rgb), 0.07)';
  const lit = 'rgba(var(--qin-accent-rgb), 0.4)';
  if (a !== null && b !== null) {
    return { background: `linear-gradient(90deg, ${dim} 0%, ${dim} ${pct(a)}, ${lit} ${pct(a)}, ${lit} ${pct(b)}, ${dim} ${pct(b)}, ${dim} 100%)` };
  }
  if (a !== null) {
    return { background: `linear-gradient(90deg, ${dim} 0%, ${dim} ${pct(a)}, ${lit} ${pct(a)}, ${lit} 100%)` };
  }
  if (b !== null) {
    return { background: `linear-gradient(90deg, ${lit} 0%, ${lit} ${pct(b)}, ${dim} ${pct(b)}, ${dim} 100%)` };
  }
  return undefined;
});

// 换曲目：正在播/暂停中都先停，避免「暂停在 A 曲第 3 拍、切到 B 曲接着放」的怪状态
watch(scoreId, () => {
  if (playState.value !== 'idle') stopPlayback();
});

// 换模式：正在播就先停（三种模式的发声与推进方式完全不同，不能热切）
watch(playMode, () => {
  hintPitches.value = new Set();
  if (playState.value !== 'idle') stopPlayback();
});

// 进自定义键位编辑时，自动播放让位（两套高亮叠在一起没法看）
watch(editMode, (on) => {
  if (on && playState.value !== 'idle') stopPlayback();
});

/** 用户按的键 + 自动播放的键，合并给琴键做高亮 */
const combinedPressed = computed<ReadonlySet<number>>(() => {
  if (autoPressed.value.size === 0) return pressed;
  const merged = new Set(pressed);
  for (const pitch of autoPressed.value) merged.add(pitch);
  return merged;
});

const editPitch = ref<number | null>(null);
const lastAction = ref('');
let lastActionTimer: number | undefined;

const noteMode = computed<NoteLabelMode>(() => {
  if (showSolfege.value) return 'solfege';
  if (showNoteNames.value) return 'note';
  return 'none';
});

const customCount = computed(() => keyMap.value.customCount);

/** 记录物理按键当前锁定的音高，避免 Shift 状态变化导致"松不掉" */
const heldKeys = new Map<string, number>();

let unsubscribeStatus: (() => void) | null = null;

const sourceLabel = computed(() => {
  switch (status.value.source) {
    case 'autopiano':
      return 'AutoPiano 采样';
    case 'salamander':
      return '降级采样';
    case 'synth':
      return '合成音色';
    default:
      return '音频待启用';
  }
});

const loadedText = computed(() =>
  status.value.total > 0 ? `${status.value.loaded}/${status.value.total}` : '',
);

const currentViewport = computed(
  () => PIANO_VIEWPORTS.find((item) => item.id === viewportId.value) ?? PIANO_VIEWPORTS[1],
);

function flash(message: string): void {
  lastAction.value = message;
  window.clearTimeout(lastActionTimer);
  lastActionTimer = window.setTimeout(() => {
    lastAction.value = '';
  }, 4000);
}

function applyCustomBindings(next: CustomBinding[]): void {
  customBindings.value = next;
  saveCustomBindings(next);
  keyMap.value = createKeyMap();
}

function startEdit(): void {
  editMode.value = true;
  editPitch.value = null;
  lastAction.value = '';
}

function exitEdit(): void {
  editMode.value = false;
  editPitch.value = null;
}

function toggleEdit(): void {
  if (editMode.value) exitEdit();
  else startEdit();
}

/** 把当前选中的音绑到某个物理键上：同一个键、同一个音都只保留一条 */
function bindSelected(code: string, modifier: 'none' | 'shift' | 'alt'): void {
  const pitch = editPitch.value;
  if (pitch === null) return;
  const base = toBasePitch(pitch);
  const next = customBindings.value.filter(
    (item) => !(item.code === code && item.modifier === modifier) && item.pitch !== base,
  );
  next.push({ code, modifier, pitch: base });
  applyCustomBindings(next);
  flash(`已把 ${midiToName(pitch)} 绑到 ${keyMap.value.labelFor(pitch) ?? code}`);
  editPitch.value = null;
}

/** 取消该音的自定义，回到默认键位 */
function restoreSelected(): void {
  const pitch = editPitch.value;
  if (pitch === null) return;
  const base = toBasePitch(pitch);
  const next = customBindings.value.filter((item) => item.pitch !== base);
  if (next.length === customBindings.value.length) {
    flash(`${midiToName(pitch)} 本来就是默认键位`);
    return;
  }
  applyCustomBindings(next);
  flash(`${midiToName(pitch)} 已恢复默认键位`);
}

/**
 * 空置：这个音不绑任何键。
 *
 * 默认布局里它本来有键，所以要写一条「空置」记录压住默认绑定；
 * 这条记录同样要落盘，否则刷新之后键位又回来了。
 */
function clearSelected(): void {
  const pitch = editPitch.value;
  if (pitch === null) return;
  if (keyMap.value.clearedPitches.has(pitch) && keyMap.value.bindingsForPitch(pitch).length === 0) {
    flash(`${midiToName(pitch)} 已经是空置状态`);
    return;
  }
  const base = toBasePitch(pitch);
  const next = customBindings.value.filter((item) => item.pitch !== base);
  next.push({ code: null, modifier: 'none', pitch: base });
  applyCustomBindings(next);
  flash(`${midiToName(pitch)} 已空置，不绑定任何键`);
  editPitch.value = null;
}

function resetBindings(): void {
  clearCustomBindings();
  applyCustomBindings([]);
  editPitch.value = null;
  flash('已恢复全部默认键位，空置的音也一并恢复');
}

/** 应用方案：`default` 是内置的 C 大调，其余是保存过的快照 */
function applyScheme(id: string): void {
  if (id === 'default') {
    if (customBindings.value.length === 0) {
      flash('当前就是「C大调」默认键位');
      return;
    }
    applyCustomBindings([]);
    editPitch.value = null;
    flash('已切回「C大调」默认键位');
    return;
  }
  const scheme = schemes.value.find((item) => item.id === id);
  if (!scheme) return;
  applyCustomBindings(scheme.bindings.map((item) => ({ ...item })));
  editPitch.value = null;
  flash(`已应用方案「${scheme.name}」`);
}

/** 把当前键位存成一个具名方案（只存与默认布局不同的条目） */
function saveScheme(rawName: string): void {
  // 内容没变化就不新增：默认布局、或与某个已存方案完全一致
  const signature = bindingsSignature(customBindings.value);
  if (signature === '') {
    flash('当前就是「C大调」默认键位，未新增');
    return;
  }
  const same = schemes.value.find((item) => bindingsSignature(item.bindings) === signature);
  if (same) {
    flash(`与「${same.name}」内容相同，未新增`);
    return;
  }

  const name = rawName.trim().slice(0, MAX_SCHEME_NAME);
  if (!name) {
    flash('方案名不能为空');
    return;
  }
  if (schemes.value.some((item) => item.name === name)) {
    flash(`已有同名方案「${name}」，换个名字`);
    return;
  }
  const scheme: KeymapScheme = {
    id: newSchemeId(),
    name,
    bindings: customBindings.value.map((item) => ({ ...item })),
    createdAt: Date.now(),
  };
  schemes.value = [...schemes.value, scheme];
  saveKeymapSchemes(schemes.value);
  flash(`已保存方案「${name}」`);
}

function deleteScheme(id: string): void {
  const scheme = schemes.value.find((item) => item.id === id);
  if (!scheme) return;
  schemes.value = schemes.value.filter((item) => item.id !== id);
  saveKeymapSchemes(schemes.value);
  flash(`已删除方案「${scheme.name}」，当前键位不变`);
}

function pressPitch(pitch: number, velocity = 100): void {
  void engine.start();
  if (editMode.value) {
    editPitch.value = pitch;
  } else if (followActive.value) {
    // 跟弹中：这次按键先送判定（键盘与点琴键共用此路径）
    judgeFollowPress(pitch);
  } else if (learnActive.value) {
    // 学弹中：按对推进 / 错音计数（声音照常发，学习者听得到自己按了什么）
    handleLearnPress(pitch);
  }
  if (pressed.has(pitch)) return;
  pressed.add(pitch);
  engine.noteOn(pitch, velocity);
  visualizer.value?.trigger(pitch, velocity);
  recent.value = [midiToName(pitch), ...recent.value].slice(0, 8);
}

function releasePitch(pitch: number): void {
  if (!pressed.has(pitch)) return;
  pressed.delete(pitch);
  engine.noteOff(pitch);
}

function releaseAll(): void {
  for (const pitch of [...pressed]) releasePitch(pitch);
  heldKeys.clear();
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.repeat || isTypingTarget(event.target)) return;

  // 延迟校准：空格 = 记一次按键，其他键照常
  if (calibrationOpen.value && calibrationPhase.value === 'running' && event.code === 'Space') {
    event.preventDefault();
    recordCalibrationTap();
    return;
  }

  // 自定义键位：按键用于「绑定」而不是「演奏」
  if (editMode.value) {
    if (event.code === 'Escape') {
      event.preventDefault();
      exitEdit();
      return;
    }
    if (editPitch.value === null) return;
    event.preventDefault();
    if (event.code === 'Backspace') {
      restoreSelected();
      return;
    }
    // Delete = 空置：这个音不绑任何键
    if (event.code === 'Delete') {
      clearSelected();
      return;
    }
    if (!isBindableCode(event.code)) return;
    const modifier = modifierFromEvent(event);
    if (!modifier) return;
    bindSelected(event.code, modifier);
    return;
  }

  const modifier = modifierFromEvent(event);
  if (!modifier) return;
  const binding = resolveBinding(keyMap.value, event.code, modifier);
  if (!binding) return;

  event.preventDefault();
  const keyId = `${binding.modifier}:${event.code}`;
  if (heldKeys.has(keyId)) return;
  heldKeys.set(keyId, binding.pitch);
  pressPitch(binding.pitch);
}

function onKeyUp(event: KeyboardEvent): void {
  const entries = [...heldKeys.entries()].filter(([keyId]) => keyId.endsWith(`:${event.code}`));
  for (const [keyId, pitch] of entries) {
    heldKeys.delete(keyId);
    releasePitch(pitch);
  }
}

function onBlur(): void {
  releaseAll();
}

watch(volume, (value) => {
  engine.setVolume(Math.min(1, Math.max(0, value / 100)));
});

/**
 * 换视口、或开关「键位跟随音区」时重建映射：
 * 起点没变（比如跟随关着，换视口只是滚动）就什么都不做，别打断按住的音；
 * 真要平移八度时先松开所有音，否则旧映射下按下的音在 keyup 时对不上。
 */
watch([viewportId, followViewport], () => {
  if (keymapStartMidi() === keyMap.value.baseStartMidi) return;
  releaseAll();
  editPitch.value = null;
  keyMap.value = createKeyMap();
});

onMounted(() => {
  unsubscribeStatus = engine.onStatus((next) => {
    status.value = { ...next };
  });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
});

onBeforeUnmount(() => {
  unsubscribeStatus?.();
  transport.dispose();
  calibrationTransport.dispose();
  stopRenderLoop();
  window.clearTimeout(lastActionTimer);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  void engine.dispose();
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand__name">琴习</span>
        <span class="brand__latin">QINXI</span>
      </div>

      <div class="topbar__right">
        <span class="source">{{ sourceLabel }}<template v-if="loadedText"> {{ loadedText }}</template></span>

        <label class="volume">
          <svg class="volume__icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.6 6.2h2.2L8.2 3.4v9.2L4.8 9.8H2.6z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.15"
              stroke-linejoin="round"
            />
            <path
              d="M10.3 6.1a3.1 3.1 0 0 1 0 3.8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.15"
              stroke-linecap="round"
            />
          </svg>
          <input v-model.number="volume" type="range" min="0" max="100" step="1" aria-label="主音量" />
        </label>

        <!-- 最右侧：外观主题下拉菜单（只换背景与外壳，琴体不变） -->
        <ThemeMenu />
      </div>
    </header>

    <main class="stage">
      <div class="controls">
        <div class="controls__left">
          <div class="ranges" role="group" aria-label="音域视口">
            <button
              v-for="item in PIANO_VIEWPORTS"
              :key="item.id"
              type="button"
              class="range"
              :class="{ 'is-active': item.id === viewportId }"
              @click="viewportId = item.id"
            >
              {{ item.label }}<span>{{ item.span }}</span>
            </button>
          </div>

          <div
            class="follow"
            title="开启后切换音区时，整组键位跟着移动一个八度，同样的按键始终弹当前可见的琴键"
          >
            <UiToggle v-model="followViewport" label="键位跟随音区" />
          </div>
        </div>

        <div class="tools">
          <div class="player" role="group" aria-label="播放与跟弹">
            <div class="mode-switch" role="group" aria-label="播放模式">
              <button
                type="button"
                :class="{ 'is-active': playMode === 'listen' }"
                @click="playMode = 'listen'"
              >自动</button>
              <button
                type="button"
                :class="{ 'is-active': playMode === 'follow' }"
                @click="playMode = 'follow'"
              >跟弹</button>
              <button
                type="button"
                :class="{ 'is-active': playMode === 'learn' }"
                @click="playMode = 'learn'"
              >学弹</button>
            </div>
            <select v-model="scoreId" class="player__select" aria-label="选择曲谱" :disabled="playState !== 'idle'">
              <option v-for="item in BUILT_IN_SCORES" :key="item.id" :value="item.id">{{ item.title }}</option>
            </select>
            <label v-if="playMode !== 'learn'" class="player__speed" title="练习速度（判定窗口不随速度变化）">
              <input
                v-model.number="speed"
                type="range"
                min="50"
                max="100"
                step="5"
                aria-label="练习速度"
                @change="applySpeed"
              />
              <span>{{ speed }}%</span>
            </label>
            <button type="button" class="text-btn player__play" @click="togglePlay">
              <svg class="player__icon" viewBox="0 0 10 10" aria-hidden="true">
                <template v-if="playState === 'playing' && playMode !== 'learn'">
                  <rect x="1.6" y="1.6" width="2.4" height="6.8" fill="currentColor" />
                  <rect x="6" y="1.6" width="2.4" height="6.8" fill="currentColor" />
                </template>
                <template v-else>
                  <path d="M2.4 1.3 8.4 5 2.4 8.7z" fill="currentColor" />
                </template>
              </svg>
              {{
                playMode === 'learn'
                  ? playState === 'playing' ? '重新开始' : '开始学弹'
                  : playState === 'playing' ? '暂停' : playState === 'paused' ? '继续' : '播放'
              }}
            </button>
            <button type="button" class="text-btn" :disabled="playState === 'idle'" @click="stopPlayback">停止</button>
            <span class="player__beat">{{ playMode === 'learn' ? learnProgressText : playProgressText }}</span>
            <div v-if="playMode !== 'learn'" class="player__bar" role="group" aria-label="进度与 A-B 循环">
              <input
                class="player__progress"
                type="range"
                min="0"
                :max="totalBeatsUi || 1"
                step="0.05"
                :value="scrubbing ? scrubBeat : progressBeat"
                :style="loopTrackStyle"
                aria-label="播放进度（拖动跳转）"
                @input="onScrubInput"
                @change="onScrubEnd"
              />
              <div class="player__loopbtns">
                <button
                  type="button"
                  class="text-btn player__loopbtn"
                  :class="{ 'is-marked': loopA !== null }"
                  title="把当前位置设为循环起点"
                  @click="setLoopPoint('a')"
                >设 A</button>
                <button
                  type="button"
                  class="text-btn player__loopbtn"
                  :class="{ 'is-marked': loopB !== null }"
                  title="把当前位置设为循环终点"
                  @click="setLoopPoint('b')"
                >设 B</button>
                <button
                  v-if="loopA !== null || loopB !== null"
                  type="button"
                  class="text-btn player__loopbtn"
                  @click="clearLoopRange"
                >清除循环</button>
              </div>
            </div>
            <span v-if="playMode === 'follow' && playState !== 'idle'" class="player__judge">
              <b :class="`grade-${lastGrade ?? 'none'}`">{{ lastGrade ? GRADE_LABEL[lastGrade] : '—' }}</b>
              <span>Perfect {{ followStats.perfect }} · Good {{ followStats.good }} · Miss {{ followStats.miss }}</span>
            </span>
            <span v-else-if="playMode === 'learn' && playState !== 'idle'" class="player__judge">
              <b>学弹</b>
              <span>已弹 {{ learnDone }} / {{ currentNotesRef.length }} · 错音 {{ learnWrong }} · 按对当前音才往后走</span>
            </span>
            <span v-else-if="followSummary" class="player__judge player__judge--summary" role="status">{{ followSummary }}</span>
          </div>
          <button type="button" class="text-btn" @click="releaseAll">全部松开</button>
          <button type="button" class="text-btn" @click="openCalibration">延迟校准</button>
        </div>
      </div>

      <!-- 视图区：校准节拍优先；跟弹播放按显示模式组合下落画布与谱面；
           学弹只显示谱面（无进度条、无下落）；自动播放 = 频谱 + 谱面（若开启）；空闲 = 频谱 -->
      <div v-if="calibrationOpen" class="viz-slot">
        <FollowCanvas
          ref="followCanvas"
          class="viz-slot__canvas"
          :notes="calibNotes"
          :judged="emptyJudged"
          :get-beat="() => calibrationTransport.rawBeat"
          :playing="calibrationTransport.playing"
          :bpm="120"
        />
        <CalibrationPanel
          class="viz-slot__panel"
          :phase="calibrationPhase"
          :taps="calibrationTaps"
          :required="CALIBRATION_TAPS_REQUIRED"
          :result="calibrationResult"
          :offset-ms="inputOffsetMs"
          @start="startCalibration"
          @close="closeCalibration"
          @adjust="adjustOffset"
          @reset="resetOffset"
          @tap="recordCalibrationTap"
        />
      </div>
      <div
        v-else-if="playMode === 'follow' && playState !== 'idle'"
        class="viz-stack"
        :class="`viz-stack--${scoreView}`"
      >
        <FollowCanvas
          v-if="scoreView !== 'sheet'"
          ref="followCanvas"
          :notes="currentNotesRef"
          :judged="judgedMap"
          :get-beat="() => transport.rawBeat"
          :playing="playState === 'playing'"
          :bpm="followBpm"
        />
        <ScoreScroller
          v-if="scoreView !== 'falling'"
          :notes="currentNotesRef"
          :chars="scoreChars"
          :judged="judgedMap"
          :get-beat="() => transport.rawBeat"
          :playing="playState === 'playing'"
          :cell-width="scoreCellWidth"
        />
      </div>
      <div v-else-if="playMode === 'learn' && playState !== 'idle'" class="viz-stack viz-stack--sheet">
        <ScoreScroller
          :notes="currentNotesRef"
          :chars="scoreChars"
          :judged="judgedMap"
          :get-beat="() => transport.rawBeat"
          :playing="true"
          :learn-cursor="learnCursor"
          :cell-width="scoreCellWidth"
        />
      </div>
      <div v-else-if="playState !== 'idle' && scoreView !== 'falling'" class="viz-stack">
        <NoteVisualizer ref="visualizer" />
        <ScoreScroller
          :notes="currentNotesRef"
          :chars="scoreChars"
          :judged="null"
          :get-beat="() => transport.rawBeat"
          :playing="playState === 'playing'"
          :cell-width="scoreCellWidth"
        />
      </div>
      <NoteVisualizer v-else ref="visualizer" />

      <PianoKeyboard
        :pressed="combinedPressed"
        :key-map="keyMap"
        :show-hints="showHints"
        :note-mode="noteMode"
        :viewport="viewportId"
        :edit-mode="editMode"
        :edit-pitch="editPitch"
        :hint-pitches="hintPitches"
        @press="pressPitch"
        @release="releasePitch"
      />

      <ControlDeck
        v-model:tab="deckTab"
        v-model:show-hints="showHints"
        v-model:note-names="showNoteNames"
        v-model:solfege="showSolfege"
        v-model:score-view="scoreView"
        v-model:score-char="scoreChar"
        v-model:volume="volume"
        v-model:diagram-mode="diagramMode"
        v-model:edit-mode="editMode"
        :key-map="keyMap"
        :pressed="pressed"
        :edit-pitch="editPitch"
        :custom-count="customCount"
        :last-action="lastAction"
        :schemes="schemes"
        :active-scheme-id="activeSchemeId"
        @toggle-edit="toggleEdit"
        @restore="restoreSelected"
        @clear="clearSelected"
        @reset="resetBindings"
        @apply-scheme="applyScheme"
        @save-scheme="saveScheme"
        @delete-scheme="deleteScheme"
      />

      <div class="foot">
        <span class="foot__item">最近音符 <b>{{ recent.length ? recent.join(' ') : '—' }}</b></span>
        <span class="foot__item">视口 <b>{{ currentViewport.label }} {{ currentViewport.span }}</b></span>
        <span class="foot__item foot__item--state">{{ status.message }}</span>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ------------------------------------------------------------------ 顶栏 */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 24px;
  border-bottom: 1px solid rgba(var(--qin-w-rgb), 0.07);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.brand__name {
  font-size: 14px;
  letter-spacing: 0.12em;
  color: rgb(var(--qin-ink-rgb));
}

.brand__latin {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.3em;
  color: rgba(var(--qin-w-rgb), 0.26);
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.source {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: rgba(var(--qin-w-rgb), 0.42);
}

.volume {
  display: flex;
  align-items: center;
  gap: 9px;
  color: rgba(var(--qin-w-rgb), 0.45);
}

.volume__icon {
  width: 16px;
  height: 16px;
  display: block;
}

.volume input[type='range'] {
  appearance: none;
  width: 100px;
  height: 14px;
  background: transparent;
  cursor: pointer;
}

.volume input[type='range']::-webkit-slider-runnable-track {
  height: 1px;
  background: rgba(var(--qin-w-rgb), 0.3);
}

.volume input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 9px;
  height: 9px;
  margin-top: -4px;
  border-radius: 50%;
  background: var(--qin-accent);
}

.volume input[type='range']::-moz-range-track {
  height: 1px;
  background: rgba(var(--qin-w-rgb), 0.3);
}

.volume input[type='range']::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border: 0;
  border-radius: 50%;
  background: var(--qin-accent);
}

/* ------------------------------------------------------------------ 舞台 */
.stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  /* AutoPiano 的钢琴是 margin:20px auto 贴着内容流排的，不做垂直居中 */
  padding-top: 10px;
  padding-bottom: 28px;
}

/* 控制栏：深色底 + 细分割线 + 纯文本，宽度与钢琴一致 */
.controls {
  width: 90%;
  margin: 4px auto 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(var(--qin-w-rgb), 0.08);
  border-bottom: 1px solid rgba(var(--qin-w-rgb), 0.08);
}

.ranges {
  display: flex;
}

/* 「键位跟随音区」：贴着高音区右边，用竖细分隔线跟视口按钮分开 */
.controls__left {
  display: flex;
  align-items: center;
}

.follow {
  display: flex;
  align-items: center;
  margin-left: 14px;
  padding-left: 18px;
  border-left: 1px solid rgba(var(--qin-w-rgb), 0.08);
}

.follow :deep(.switch) {
  gap: 8px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: rgba(var(--qin-w-rgb), 0.48);
  transition: color 120ms ease;
}

.follow :deep(.switch.is-on) {
  color: var(--qin-accent-strong);
}

.follow :deep(.switch__track) {
  width: 30px;
  height: 16px;
}

.follow :deep(.switch__thumb) {
  width: 12px;
  height: 12px;
}

.follow :deep(.switch.is-on .switch__thumb) {
  transform: translateX(14px);
}

.range {
  padding: 9px 14px 8px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: rgba(var(--qin-w-rgb), 0.42);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease;
}

.range:hover {
  color: rgba(var(--qin-w-rgb), 0.72);
}

.range.is-active {
  color: rgb(var(--qin-ink-rgb));
  border-bottom-color: var(--qin-accent);
}

.range span {
  margin-left: 6px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  color: rgba(var(--qin-w-rgb), 0.26);
}

.tools {
  display: flex;
  align-items: center;
  gap: 16px;
}

.text-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(var(--qin-w-rgb), 0.42);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 120ms ease;
}

.text-btn:hover {
  color: rgba(var(--qin-w-rgb), 0.8);
}

.text-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.text-btn:disabled:hover {
  color: rgba(var(--qin-w-rgb), 0.42);
}

/* -------------------------------------------- 频谱带插槽（跟弹 / 校准共用） */
.viz-slot {
  position: relative;
  width: 90%;
  height: 96px;
  margin: 12px auto -12px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.34));
}

/* FollowCanvas 根元素在此容器内铺满（类会透传到组件根） */
.viz-slot__canvas {
  position: absolute;
  inset: 0;
  margin: 0;
  width: 100%;
  height: 100%;
}

@media (max-width: 820px) {
  .viz-slot {
    width: 92%;
    height: 84px;
  }
}

/* ------------------------------------------------------------------ 播放控制条 */
.mode-switch {
  display: inline-flex;
  border: 1px solid rgba(var(--qin-w-rgb), 0.14);
  border-radius: 2px;
  overflow: hidden;
}

.mode-switch button {
  appearance: none;
  margin: 0;
  padding: 4px 12px;
  border: 0;
  background: transparent;
  color: rgba(var(--qin-w-rgb), 0.42);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.mode-switch button + button {
  border-left: 1px solid rgba(var(--qin-w-rgb), 0.14);
}

.mode-switch button:hover {
  color: rgba(var(--qin-ink-rgb), 0.85);
}

.mode-switch button.is-active {
  background: var(--qin-surface-active);
  color: var(--qin-accent-strong);
}

.player__judge {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(var(--qin-w-rgb), 0.38);
}

.player__judge b {
  min-width: 62px;
  font-size: 12.5px;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.player__judge .grade-perfect { color: var(--qin-accent-strong); }
.player__judge .grade-good { color: rgb(var(--qin-ink-rgb)); }
.player__judge .grade-miss { color: var(--qin-danger-strong); }

.player {
  display: flex;
  align-items: center;
  gap: 14px;
}

.player__select {
  appearance: none;
  padding: 4px 22px 4px 9px;
  border: 1px solid rgba(var(--qin-w-rgb), 0.14);
  border-radius: 2px;
  background-color: transparent;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath d='M1.2 2.9 4 5.7l2.8-2.8' fill='none' stroke='%238a8a8a' stroke-width='1.1'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 7px center;
  background-size: 8px;
  color: rgba(var(--qin-ink-rgb), 0.8);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
}

.player__select:hover:not(:disabled) {
  border-color: rgba(var(--qin-accent-rgb), 0.42);
  color: rgba(var(--qin-ink-rgb), 0.92);
}

.player__select:disabled {
  opacity: 0.4;
  cursor: default;
}

.player__select option {
  background: var(--qin-surface-2);
  color: rgb(var(--qin-ink-rgb));
}

.player__play {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.player__icon {
  width: 10px;
  height: 10px;
  display: block;
}

/* 变速滑块 */
.player__speed {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.player__speed input {
  appearance: none;
  width: 86px;
  height: 3px;
  border-radius: 2px;
  background: rgba(var(--qin-w-rgb), 0.16);
  outline: none;
  cursor: pointer;
}

.player__speed input::-webkit-slider-thumb {
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(var(--qin-ink-rgb), 0.75);
  border: none;
}

.player__speed input::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(var(--qin-ink-rgb), 0.75);
  border: none;
}

.player__speed span {
  min-width: 34px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: rgba(var(--qin-accent-strong), 0.9);
  font-variant-numeric: tabular-nums;
}

/* 进度条 + A/B 循环 */
.player__bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 180px;
}

.player__progress {
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background-color: rgba(var(--qin-w-rgb), 0.1);
  background-clip: content-box;
  outline: none;
  cursor: pointer;
}

.player__progress::-webkit-slider-thumb {
  appearance: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgb(var(--qin-ink-rgb));
  border: none;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
}

.player__progress::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgb(var(--qin-ink-rgb));
  border: none;
}

.player__loopbtns {
  display: flex;
  gap: 10px;
}

.player__loopbtn.is-marked {
  color: var(--qin-accent-strong);
}

/* 视图堆叠：下落画布 + 键盘谱 */
.viz-stack {
  display: flex;
  flex-direction: column;
}

.viz-stack--sheet .score-scroller,
.viz-stack--falling .follow-viz {
  height: 96px;
}

.viz-stack--sheet .score-scroller {
  width: 90%;
  margin: 12px auto -12px;
}

.viz-stack .score-scroller {
  width: 90%;
  margin: 0 auto -12px;
  border-top: none;
  border-bottom: 1px solid rgba(var(--qin-w-rgb), 0.06);
}

.player__beat {
  min-width: 92px;
  text-align: right;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.05em;
  color: rgba(var(--qin-w-rgb), 0.32);
  font-variant-numeric: tabular-nums;
}

/* 控制台下方的纯文本行 */
.foot {
  width: 90%;
  margin: 14px auto 0;
  display: flex;
  align-items: baseline;
  gap: 24px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.05em;
  color: rgba(var(--qin-w-rgb), 0.28);
}

.foot__item b {
  font-weight: 400;
  color: rgba(var(--qin-w-rgb), 0.6);
  letter-spacing: 0.1em;
}

.foot__item--state {
  margin-left: auto;
  color: rgba(var(--qin-w-rgb), 0.22);
}

@media (max-width: 820px) {
  .controls,
  .foot {
    width: 92%;
  }

  .range span,
  .foot__item:nth-child(2),
  .player__beat,
  .player__speed,
  .follow :deep(.switch__label) {
    display: none;
  }
}
</style>
