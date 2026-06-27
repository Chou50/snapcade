# Snapcade — Hackathon Demo Design

## 1. 产品概述

### 一句话定位

> Turn this exact moment into a playable game in 30 seconds.

用户上传一张当下场景的照片，并输入一句游戏指令。Gemini 理解图片中的物体与用户意图，生成受约束的 `game.json`，固定的游戏 Runtime 随即将照片中的真实物体变成一局可玩的小游戏。

### 核心演示案例

1. 拍摄 Google Japan 会场照片。
2. 输入：“让我控制电脑，躲避从天而降的咖啡杯。”
3. Gemini 识别电脑与咖啡杯，并返回它们的 bounding box。
4. 系统从原图裁切物体，生成一局 8–10 秒的 Dodge 游戏。
5. 用户完成游戏，看到胜利画面和可分享链接。

### 核心价值

产品不是通用的“Prompt to App”，而是把用户眼前的现实场景即时转化为游戏。Demo 的记忆点是：

> 评委刚刚看到的会场，在几十秒内变成了一局可以玩的游戏。

---

## 2. Hackathon 目标

比赛要求项目真实使用 Google Cloud 产品、能够现场运行并提供已部署链接。创新加分来自 Gemini 最新多模态能力和 Managed Agents，但完成度优先于技术堆叠。

### 获奖策略

按优先级完成以下能力：

| Tier | 能力 | 是否为生死线 |
|---|---|---|
| 0 | 公开 URL + 固定 Dodge 游戏 | 是 |
| 1 | Gemini 图片分析 + 合法 `game.json` | 是 |
| 2 | bounding box 裁图进入游戏 | 是，核心 wow moment |
| 3 | Managed Agent 真实工具调用 | 否，加分项 |
| 4 | 分享、下载、美化、更多模板 | 否 |

只要 Tier 0–2 稳定完成，Demo 即成立。Tier 3 未真实接入时，不在台上声称已经使用。

---

## 3. MVP 范围

### 必须实现

- 上传一张 JPEG、PNG 或 WebP 图片。
- 输入一条自然语言游戏指令。
- Gemini 分析场景并识别玩家与敌人物体。
- Gemini 返回受 Schema 约束的游戏配置。
- 所有 AI 输出经过严格清洗和默认值回退。
- 从原图按 bounding box 裁切玩家和敌人素材。
- 运行一局 8–10 秒的 Dodge 游戏。
- 包含开始、进行中、胜利和失败状态。
- 部署到 Cloud Run，提供稳定公开 URL。
- AI、网络或裁图失败时仍可使用默认素材完成游戏。

### 明确不做

- 任意类型游戏生成。
- 每次请求动态生成、安装和编译完整代码。
- 多 Agent 并行编排。
- 音频分析或语音控制。
- 实时修改正在运行的游戏。
- 完整用户系统、项目管理和权限系统。
- 自动下载完整代码工程。
- 精确语义分割或透明背景抠图。

这些能力可以作为 Roadmap 展示，但不能进入关键演示路径。

---

## 4. 用户流程

```text
打开公开 URL
  ↓
上传或拍摄现场照片
  ↓
输入游戏指令
  ↓
点击 Generate Game
  ↓
Analyzing Scene
  ↓
Detecting Objects
  ↓
Building Game
  ↓
Ready — 立即开始游戏
  ↓
8–10 秒胜利/失败结算
  ↓
Replay / Generate Another
```

### 用户可见状态

系统只展示可观察的工具活动，不展示或声称展示模型内部推理过程。

```text
✓ Scene analyzed
✓ Laptop and coffee cup detected
✓ Dodge template selected
✓ Game configuration validated
✓ Game ready
```

如果发生回退，可以使用不破坏演示感的文案：

```text
Scene analyzed with safe defaults
```

---

## 5. 系统架构

```text
Next.js UI
  ├─ 图片上传 / 拍照
  ├─ Prompt 输入
  └─ Canvas 游戏 Runtime
          ↑
          │ sanitized GameSpec
          │
Next.js API Route / Cloud Run
  ├─ 输入校验与图片预处理
  ├─ Gemini 多模态请求
  ├─ Structured Output 解析
  ├─ sanitizeGameSpec()
  └─ fallback GameSpec
```

### 设计原则

1. **AI 生成配置，不生成关键路径代码。**
2. **游戏 Runtime 是预构建、确定性且始终可运行的。**
3. **Runtime 永远假设 AI 输出不可信。**
4. **任何失败都退化为默认游戏，而不是错误页面。**
5. **公开部署从开发早期开始持续可用。**

### 推荐技术栈

- 前端：Next.js + TypeScript
- 游戏：HTML Canvas；如团队熟悉可使用 Phaser
- Schema：Zod
- AI：Gemini 3.5 Flash，多模态 Structured Output
- 部署：Cloud Run
- 状态管理：React 本地状态即可
- 图片处理：浏览器 Canvas API，避免引入重型服务端依赖

---

## 6. GameSpec 契约

### 坐标约定

Gemini bounding box 使用官方格式：

```text
[ymin, xmin, ymax, xmax]
```

所有坐标是相对图片尺寸归一化后的整数，范围为 `0–1000`。

禁止在不同层使用以下替代格式：

- `[x, y, width, height]`
- `[xmin, ymin, xmax, ymax]`
- `0–1` 浮点坐标

坐标只允许在图片裁切适配器中转换为 Canvas 像素。

### TypeScript 类型

```ts
type BoundingBox = [
  ymin: number,
  xmin: number,
  ymax: number,
  xmax: number,
];

type GameEntity = {
  label: string;
  box2d: BoundingBox | null;
  fallbackAsset: "player" | "enemy";
};

type GameSpec = {
  version: "1.0";
  template: "fish-eat" | "link-match" | "oracle" | "farming" | "racing" | "tower-defense" | "dress-up" | "bubble-pop" | "dodge";
  title: string;
  objective: string;
  scene: {
    summary: string;
    prompt: string;
    objects: string[];
  };
  player: GameEntity;
  enemy: GameEntity;
  difficulty: 1 | 2 | 3;
  durationSeconds: number;
  theme: {
    primaryColor: string;
    backgroundTint: string;
  };
};
```

### 示例

```json
{
  "version": "1.0",
  "template": "dodge",
  "title": "Coffee Break Crisis",
  "objective": "Protect the laptop and survive",
  "scene": {
    "summary": "A desk scene with a laptop and coffee cup.",
    "prompt": "Create a short survival game from this desk photo.",
    "objects": ["laptop", "coffee cup", "keyboard", "desk lamp", "notebook", "chair"]
  },
  "player": {
    "label": "laptop",
    "box2d": [600, 400, 800, 650],
    "fallbackAsset": "player"
  },
  "enemy": {
    "label": "coffee cup",
    "box2d": [100, 100, 280, 240],
    "fallbackAsset": "enemy"
  },
  "difficulty": 2,
  "durationSeconds": 9,
  "theme": {
    "primaryColor": "#8B5CF6",
    "backgroundTint": "#111827"
  }
}
```

### Zod Schema 草案

```ts
import { z } from "zod";

const box2dSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .nullable();

const entitySchema = z.object({
  label: z.string().min(1).max(40),
  box2d: box2dSchema,
  fallbackAsset: z.enum(["player", "enemy"]),
});

export const gameSpecSchema = z.object({
  version: z.literal("1.0"),
  template: z.literal("dodge"),
  title: z.string().min(1).max(60),
  objective: z.string().min(1).max(100),
  player: entitySchema,
  enemy: entitySchema,
  difficulty: z.number(),
  durationSeconds: z.number(),
  theme: z.object({
    primaryColor: z.string(),
    backgroundTint: z.string(),
  }),
});
```

Schema 只负责判断结构是否可解析；范围修正由 `sanitizeGameSpec()` 统一完成。

---

## 7. 输出清洗与回退

### 默认配置

```ts
const DEFAULT_GAME_SPEC: GameSpec = {
  version: "1.0",
  template: "dodge",
  title: "Scene Survival",
  objective: "Dodge the obstacles and survive",
  player: {
    label: "hero",
    box2d: null,
    fallbackAsset: "player",
  },
  enemy: {
    label: "obstacle",
    box2d: null,
    fallbackAsset: "enemy",
  },
  difficulty: 2,
  durationSeconds: 9,
  theme: {
    primaryColor: "#8B5CF6",
    backgroundTint: "#111827",
  },
};
```

### `sanitizeGameSpec()` 规则

- JSON 无法解析：直接返回完整默认配置。
- Schema 校验失败：尽可能读取合法字段，其余使用默认值。
- `template`：固定为 `dodge`。
- `difficulty`：四舍五入并钳位到 `1–3`。
- `durationSeconds`：四舍五入并钳位到 `8–12`；正式 Demo 使用 `9`。
- 标题、目标和 label：去除控制字符并限制长度。
- 颜色：仅接受 `#RRGGBB`，否则使用默认颜色。
- bounding box 每个值：四舍五入并钳位到 `0–1000`。
- `ymax <= ymin` 或 `xmax <= xmin`：将对应 box 设为 `null`。
- bounding box 面积过小：增加 padding 后再次钳位。
- 玩家和敌人的 box 高度重叠且几乎相同：敌人回退默认素材。
- 任一素材裁切失败：只回退该素材，不中止游戏。

### 回退层级

```text
Gemini 返回合法 GameSpec
  ↓ 失败
使用已解析字段 + 默认字段
  ↓ bbox 失败
让用户在图片上点击选取区域
  ↓ 未操作或仍失败
使用内置玩家/敌人素材
  ↓
游戏始终启动
```

### Bounding box 转换

```ts
function boxToCrop(
  box: BoundingBox,
  imageWidth: number,
  imageHeight: number,
) {
  const [ymin, xmin, ymax, xmax] = box;

  return {
    x: (xmin / 1000) * imageWidth,
    y: (ymin / 1000) * imageHeight,
    width: ((xmax - xmin) / 1000) * imageWidth,
    height: ((ymax - ymin) / 1000) * imageHeight,
  };
}
```

上传后应先统一图片方向，避免 EXIF 旋转导致识别坐标和 Canvas 坐标不一致。

---

## 8. Dodge Runtime 设计

### 游戏规则

- 玩家在屏幕底部左右移动。
- 敌人从顶部随机位置下落。
- 碰撞扣除一颗生命。
- 默认生命值为 3。
- 倒计时归零且仍有生命时胜利。
- 生命值归零时失败。
- Demo 默认时长为 9 秒。

### 难度映射

| 难度 | 下落速度 | 生成间隔 | 同屏上限 |
|---|---:|---:|---:|
| 1 | 低 | 900 ms | 4 |
| 2 | 中 | 650 ms | 6 |
| 3 | 高 | 450 ms | 8 |

### 控制方式

- 桌面：左右方向键或 A/D。
- 移动端：拖动玩家，或屏幕左右两侧按钮。
- Demo 设备必须提前确认控制方式。

### 视觉处理

- 原图经过模糊和暗色遮罩后作为背景。
- 玩家裁图增加高亮描边。
- 敌人裁图增加轻微旋转和阴影。
- 即使是矩形裁图，也要通过圆角、描边和缩放动画减弱粗糙感。
- 胜利页必须明显、快速出现，并显示生成的游戏标题。

---

## 9. Gemini 请求设计

### 模型任务

模型只负责：

1. 理解用户希望控制和躲避的对象。
2. 在图片中定位相应对象。
3. 生成标题、目标、难度和主题。
4. 输出符合 Schema 的 JSON。

模型不负责：

- 写游戏代码。
- 决定任意新游戏类型。
- 运行构建或部署。
- 返回 HTML 或 Markdown。

### Prompt 要点

```text
Create a configuration for a short dodge game from the image and user request.

Return JSON only, matching the supplied schema.
Use the template "dodge".
Bounding boxes must use [ymin, xmin, ymax, xmax], normalized to integers 0–1000.
Choose objects that are visibly present in the image.
The game must last 8–12 seconds.
If an object cannot be found confidently, return null for its box2d.
Do not invent coordinates for invisible objects.
```

### 超时策略

- API 请求设置短超时，目标为 15–20 秒内完成。
- 到达前端等待上限后立即返回默认配置。
- 对固定 Demo 图片预生成并缓存结果。
- 缓存命中时仍可展示正常的阶段动画，但不虚构 Agent 调用。

---

## 10. Managed Agent 可选集成

仅当 Tier 0–2 已完成且剩余时间超过 45 分钟时接入。

### 真实工具

```text
analyze_scene(image, user_prompt)
  → detected entities and candidate boxes

generate_game_spec(scene_analysis)
  → validated GameSpec candidate
```

### 展示规则

- 只展示真实发生的工具调用和状态。
- 不展示或声称展示模型内部 chain-of-thought。
- 未接通时只在 Roadmap 中标注，不写入“已使用技术”。
- Managed agent 失败必须回退到本地安全配置。

---

## 11. API 设计

### `POST /api/generate`

请求：`multipart/form-data`

| 字段 | 类型 | 约束 |
|---|---|---|
| `image` | File | JPEG/PNG/WebP，限制大小 |
| `prompt` | string | 可选，0–300 字符；为空时由 Gemini Vision 根据图片自动生成英文 prompt，再交给 Managed Agent 实现 |

成功响应：

```json
{
  "requestId": "demo-123",
  "source": "managed-agent",
  "gameSpec": {},
  "suggestedPrompt": "Create a neon link-match game from the office objects.",
  "agentTrace": [
    { "title": "Gemini Vision analyzed image", "status": "complete" },
    { "title": "Gemini generated prompt", "status": "complete" },
    { "title": "Managed agent implemented game", "status": "complete" }
  ],
  "warnings": []
}
```

回退响应仍返回 HTTP 200：

```json
{
  "requestId": "demo-123",
  "source": "fallback",
  "gameSpec": {},
  "warnings": ["AI response timed out; safe defaults applied"]
}
```

只有输入完全不可用时返回 4xx。AI 服务失败不应让前端进入不可恢复错误态。

---

## 12. 部署策略

### 原则

部署不是最后一步，而是从第 30 分钟开始的持续动作。

### 时间点

1. 骨架页面跑通后立即首次部署到 Cloud Run。
2. 固定 Dodge 游戏完成后再次部署。
3. Gemini 接通后再次部署。
4. bbox 裁图完成后再次部署。
5. 每次部署后从公开 URL 完成一次 smoke test。

### Cloud Run 注意项

- 使用环境变量保存 API Key，不进入前端 Bundle。
- 容器监听 `0.0.0.0:$PORT`。
- 确认图片请求大小限制。
- 避免依赖本地持久文件系统。
- Demo 前预热服务并打开公开 URL。
- 保留上一版可用 revision，必要时立即回滚。

---

## 13. 四小时执行计划

| 时间 | 任务 | 完成标准 |
|---|---|---|
| 0:00–0:30 | Next.js 骨架、上传、Prompt、Canvas 区域 | 本地可打开完整空壳流程 |
| 0:30 | 首次 Cloud Run 部署 | 获得公开 URL |
| 0:30–1:30 | 固定 Dodge Runtime | 不依赖 AI，可以开始、游玩、胜利/失败 |
| 1:30–2:10 | Gemini + Structured Output + 清洗 | 任意 AI 输出都产生合法 GameSpec |
| 2:10–3:00 | bbox 裁图与照片背景 | 照片中的两个物体进入游戏 |
| 3:00–3:30 | 持续部署、缓存、fallback | 断网或 AI 失败仍能玩 |
| 3:30–4:00 | 三次完整演练、录备用视频 | 3 分钟内稳定完成闭环 |

### 停止规则

- 1:30 固定游戏未完成：暂停所有 AI 集成，先完成 Runtime。
- 2:10 Gemini 未稳定：使用预生成 JSON，继续 bbox 与游戏整合。
- 3:00 bbox 未稳定：使用用户点选；不继续研究自动裁图。
- 3:15 后禁止添加新功能，只修复阻塞演示的问题。

---

## 14. 三分钟现场演示

| 时间 | 内容 |
|---|---|
| 0:00–0:15 | “Game creation should start from this moment, not a blank canvas.” |
| 0:15–0:35 | 拍摄或上传现场照片 |
| 0:35–0:50 | 输入“控制电脑，躲避咖啡杯” |
| 0:50–1:15 | 展示真实生成阶段与识别结果 |
| 1:15–1:30 | 展示照片物体被裁切进入游戏 |
| 1:30–1:50 | 完成一局 8–10 秒游戏 |
| 1:50–2:10 | 展示胜利页与 Replay |
| 2:10–2:35 | 简述 Gemini、Schema、Runtime 和 Cloud Run |
| 2:35–2:50 | 如已真实接入，展示 Agent 工具活动 |
| 2:50–3:00 | 收尾：“We turned this room into a game before the demo ended.” |

不要在台上：

- 等待 30 秒游戏倒计时。
- 展示代码或终端构建日志。
- 解释六个尚未实现的工具。
- 临时更换从未测试过的图片或 Prompt。

---

## 15. 测试清单

### 输入

- [ ] 横屏照片
- [ ] 竖屏且带 EXIF 旋转的手机照片
- [ ] 没有明确物体的照片
- [ ] 超大图片
- [ ] 空 Prompt
- [ ] 非英文 Prompt

### AI 输出

- [ ] 合法 JSON
- [ ] Markdown code fence 包裹的 JSON
- [ ] 非法 JSON
- [ ] 缺失字段
- [ ] bbox 超出范围
- [ ] bbox 顺序错误
- [ ] bbox 面积过小
- [ ] 找不到用户指定对象
- [ ] API 超时或 5xx

### 游戏

- [ ] 默认素材可完成完整游戏
- [ ] 玩家裁图失败不影响敌人
- [ ] 敌人裁图失败不影响玩家
- [ ] 桌面键盘控制
- [ ] 移动端控制
- [ ] 8–10 秒内出现胜利或失败结果
- [ ] Replay 不重新调用 Gemini

### 部署

- [ ] 公开 URL 无登录可访问
- [ ] API Key 不出现在浏览器源码或网络响应中
- [ ] 冷启动后首次请求可完成
- [ ] 手机网络下可使用
- [ ] 上一个稳定 revision 可以回滚

---

## 16. Demo 资产与兜底

必须提前准备：

- 一张已验证的会场照片。
- 一个已验证的中文 Prompt 和英文 Prompt。
- 该照片对应的缓存 GameSpec。
- 内置玩家和敌人素材。
- 一段完整成功流程的本地视频。
- 一个无需 AI 即可进入固定游戏的隐藏演示入口。

隐藏入口仅用于故障恢复，不应在正常演示中主动展示。

---

## 17. 成功标准

### 产品成功

- 用户不需要理解游戏开发即可创造一局游戏。
- 照片中的真实物体能被明显识别并进入游戏。
- 从点击 Generate 到游戏 Ready 不超过 30 秒。
- 一局 Demo 在 10 秒左右完成。

### 技术成功

- AI 输出永远不能让 Runtime 崩溃。
- AI 不可用时仍能完成完整游戏循环。
- 公开 Cloud Run URL 在演示开始前已经验证。
- 所有台上声称使用的 Google 技术均为真实集成。

### 演示成功

- 三分钟内完成“输入 → 生成 → 游玩 → 胜利”的完整闭环。
- 评委能用一句话复述项目：

> It turns the room you are in into a playable game.

---

## 18. 后续路线

MVP 稳定后，可按以下顺序扩展：

1. 游戏中通过文字或语音实时 Remix。
2. 增加 Catch 和 Boss 模板。
3. 使用分割 mask 提升精灵质量。
4. 生成分享页与永久游戏链接。
5. 导出代码和 Fork Prompt。
6. 使用 Managed Agents 编排素材分析、模板选择和项目打包。

---

## 19. 参考资料

- [Gemini API — Managed agents quickstart](https://ai.google.dev/gemini-api/docs/managed-agents-quickstart)
- [Gemini API — Interactions](https://ai.google.dev/gemini-api/docs/interactions)
- [Cloud Run — 部署容器](https://docs.cloud.google.com/run/docs/deploying)
- [Cloud Run — 请求超时](https://docs.cloud.google.com/run/docs/configuring/request-timeout)
- [Gemini AI Hackathon @ Google Japan](https://luma.com/geminitokyo?tk=eLnOCX)
