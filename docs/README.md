# MathTools — 项目架构文档 (React)

本文档详细介绍了 MathTools 项目的最新架构。该项目基于React，Vite 和 Tailwind CSS v4，旨在提供出色的组件化开发体验、极高的性能以及完全类型安全的开发流程。

## 目录

1. [技术栈](#技术栈)
2. [项目目录结构](#项目目录结构)
3. [核心架构详解](#核心架构详解)
   - [路由系统 (React Router)](#1-路由系统-react-router)
   - [状态管理与生命周期](#2-状态管理与生命周期)
   - [国际化系统 (i18n Hook)](#3-国际化系统-i18n-hook)
   - [SEO 与 Meta 管理](#4-seo-与-meta-管理)
   - [主题系统](#5-主题系统)
4. [数学与 3D 渲染引擎](#数学与-3d-渲染引擎)
5. [2D Canvas 渲染](#2d-canvas-渲染)
6. [CSS 与样式架构](#css-与样式架构)
7. [UX 设计规范](#ux-设计规范)
8. [构建与运行](#构建与运行)

---

## 技术栈

- **核心框架**: React 19 (Strict Mode)
- **路由管理**: React Router DOM v7 (HashRouter)
- **状态管理**: Zustand 5
- **国际化**: i18next + react-i18next
- **构建工具**: Vite 7
- **语言**: TypeScript
- **CSS 框架**: Tailwind CSS v4
- **数学计算**: Math.js
- **公式渲染**: KaTeX
- **3D 渲染**: Three.js (WebGL 旋转体网格生成与可视化, 含 OrbitControls)
- **安全防护**: DOMPurify
- **图标库**: Lucide React
- **包管理器**: pnpm

---

## 项目目录结构

```text
Mathtools/
├── docs/                   # 项目文档
├── public/                 # 静态资源
│   └── vite.svg            # Favicon (居中斜体衬线字母 x 图标)
├── src/                    # 源代码目录
│   ├── components/         # 可复用的 React 组件
│   │   ├── layout/         # 布局组件
│   │   │   └── AppHeader.tsx   # 顶部导航栏 (Logo/语言/主题)
│   │   └── revolution/     # 旋转体专用组件
│   │       └── Canvas2D.tsx    # 2D 画布 (forwardRef, 含交点检测、标注、截图导出)
│   ├── composables/        # 自定义 Hooks
│   │   ├── useSEO.ts       # SEO 与 Meta 管理
│   │   └── useThreeScene.ts # Three.js 场景工厂 (非 React Hook)
│   ├── i18n/               # 国际化 (i18next + react-i18next)
│   │   ├── config.ts       # i18next 初始化与配置
│   │   ├── index.ts        # 兼容层：re-export useTranslation / t / setLocale
│   │   └── locales/
│   │       ├── en.json     # 英文语言包
│   │       └── zh.json     # 中文语言包
│   ├── stores/             # Zustand 全局状态管理
│   │   ├── useThemeStore.ts    # 主题状态 (isDark, toggle, 持久化)
│   │   └── useRevolutionStore.ts # 旋转体页面状态 (曲线、边界、显示选项、结果等)
│   ├── pages/              # 页面级组件
│   │   ├── Home.tsx        # 首页 (工具卡片网格)
│   │   ├── PlaceholderPage.tsx # 占位页面 (Coming Soon)
│   │   └── RevolutionVolume.tsx # 旋转体体积计算与可视化
│   ├── utils/              # 核心工具库与数学/3D引擎 (纯函数)
│   │   ├── mathEngine.ts   # Barrel 导出文件
│   │   ├── types.ts        # 共享类型定义
│   │   ├── curveDefaults.ts # 数值常量与诊断
│   │   ├── latex.ts        # LaTeX 标准化与转换
│   │   ├── curveEngine.ts  # 曲线解析、编译、采样、交点检测
│   │   ├── regionEngine.ts # 2D 有界区域计算
│   │   ├── volumeEngine.ts # 数值积分与体积计算
│   │   ├── meshEngine.ts   # 3D 旋转体网格生成
│   │   └── presets.ts      # 预设示例数据
│   ├── App.tsx             # 根组件与路由配置
│   ├── env.d.ts            # TypeScript 环境声明
│   ├── main.tsx            # 应用程序入口文件 (引导 i18n 与 theme store)
│   └── style.css           # 全局样式与 Tailwind v4 入口
├── index.html              # HTML 模板
├── package.json            # 项目依赖与脚本
├── tsconfig.json           # TypeScript 配置
├── tsconfig.app.json       # TypeScript 应用配置
├── tsconfig.node.json      # TypeScript Node 配置
└── vite.config.ts          # Vite 构建配置
```

---

## 核心架构详解

项目采用现代 React 函数式组件与 Hooks 架构，将 UI 渲染与底层数学计算逻辑严格分离。

### 1. 路由系统 (React Router)

使用 `react-router-dom` 的 `<HashRouter>` 实现纯前端的 SPA 路由，确保在静态托管环境（如 GitHub Pages）下刷新页面不会出现 404 错误。

**路由配置 (`App.tsx`)：**
```tsx
<Router>
  <AppHeader />
  <main>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/revolution" element={<RevolutionVolume />} />
      <Route path="/matrix" element={<PlaceholderPage ... />} />
      <Route path="/graphing" element={<PlaceholderPage ... />} />
      <Route path="/derivatives" element={<PlaceholderPage ... />} />
      <Route path="/geometry" element={<PlaceholderPage ... />} />
      <Route path="/statistics" element={<PlaceholderPage ... />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </main>
</Router>
```

### 2. 状态管理 (Zustand)

使用 **Zustand 5** 作为全局状态管理方案，替代了原先散落在各组件中的 15+ 个 `useState` 调用。所有 Store 位于 `src/stores/` 目录下：

#### `useThemeStore.ts` — 主题状态
```tsx
import { useThemeStore } from "@/stores/useThemeStore";
const { isDark, toggleTheme } = useThemeStore();
```
- **不使用 localStorage**：每次进入网站时通过 `matchMedia("(prefers-color-scheme: dark)")` 自动检测系统偏好。
- 模块加载时通过 `subscribe` 自动同步 `data-theme` 属性到 `<html>`，无需在组件内手动 `useEffect`。
- 模块加载时还注册 `matchMedia` 的 `change` 事件监听，系统主题变化时 store 自动跟随。
- `AppHeader` 组件直接消费 `useThemeStore()`，不再持有本地 theme state。

#### `useRevolutionStore.ts` — 旋转体页面状态
```tsx
import { useRevolutionStore } from "@/stores/useRevolutionStore";
const { curveInputs, addCurve, display, setDisplay, reset, ... } = useRevolutionStore();
```
- 统一管理曲线输入、边界、旋转轴、显示选项、计算结果、UI 开关等全部页面状态。
- 提供 `addCurve()`, `removeCurve()`, `updateCurve()`, `reset()` 等原子操作。
- 页面组件 `RevolutionVolume.tsx` 通过解构获取所需状态与 action，代码量大幅减少。

#### React 原生 Hooks（辅助）
- **性能优化**: 使用 `useMemo` 缓存解析后的数学曲线，`useCallback` 缓存事件处理函数。
- **DOM 引用**: 使用 `useRef` 获取 Canvas 和 Three.js 容器的引用。
- **Three.js 初始化**: 通过 `requestAnimationFrame` 延迟 `init()` 调用，确保 DOM 容器已获得布局尺寸，兼容 React 18+ Strict Mode 的双重挂载/卸载机制。

### 3. 国际化系统 (i18next + react-i18next)

使用 **i18next** 与 **react-i18next** 实现完整的国际化方案

- **配置文件**: `src/i18n/config.ts` 负责初始化 i18next 实例，加载 `locales/en.json` 和 `locales/zh.json` 资源。
- **插值语法**: 使用 `{placeholder}` 风格（与原有语言包 JSON 保持一致），通过 `interpolation.prefix / suffix` 配置。
- **语言自动检测**: 每次进入网站时通过 `navigator.language` 自动检测浏览器语言；切换语言时仅更新 `<html lang>` 属性。
- **React 集成**: react-i18next 的 `useTranslation` 自动订阅语言变化，组件精确重渲染。
- **使用方式**:
```tsx
import { useTranslation } from "@/i18n";

export default function MyComponent() {
  const { t, locale, setLocale } = useTranslation();
  return <h1>{t("app.title", "Fallback Title")}</h1>;
}
```

### 4. SEO 与 Meta 管理

通过自定义 Hook `useSEO` 动态管理页面的 `<title>`, `<meta name="description">` 以及 Open Graph 标签。该 Hook 监听路由变化和语言切换，自动更新 DOM 的头部信息。

### 5. 主题系统 (Zustand)

主题状态由 `useThemeStore` (Zustand) 统一管理：

1. **每次进入网站** → 通过 `matchMedia("(prefers-color-scheme: dark)")` 自动检测系统偏好
2. **用户手动切换** → 调用 `toggleTheme()` 在当前会话中取反
3. **系统偏好变化** → 全局 `matchMedia` change 监听器自动更新 store，实时跟随系统

Store 的 `subscribe` 回调在状态变化时自动同步 `data-theme="dark"` 属性到 `<html>` 元素，配合 Three.js 的 `updateBackground()` 保持 3D 场景背景同步。组件无需再编写 `useEffect` 来管理 DOM 属性。

---

## 数学与 3D 渲染引擎

核心业务逻辑（旋转体体积计算与可视化）被拆分为多个职责单一的纯函数引擎，位于 `src/utils/` 目录下，与 React UI 层完全解耦：

1. **`latex.ts`**: 负责将用户输入的 LaTeX 字符串标准化，并转换为 Math.js 可识别的表达式。
2. **`curveEngine.ts`**: 负责解析数学表达式，编译为可执行函数，并在 2D 空间进行离散采样。还提供 `findIntersectionsXRange()` 用于扫描并二分搜索两条曲线的交点 x 坐标。
3. **`regionEngine.ts`**: 负责计算两条或多条曲线在指定区间 `[xMin, xMax]` 内的交点，并构建出封闭的 2D 区域 (Region)。支持 `y=f(x)`, `x=g(y)`, 以及常数线。
4. **`volumeEngine.ts`**: 负责使用圆盘法/圆柱壳法进行数值积分（Simpson 法则），计算旋转体的精确体积，并生成体积公式的 LaTeX 表示。
5. **`meshEngine.ts`**: 负责将 2D 区域绕指定轴（X轴或Y轴）旋转，生成 Three.js 的 `BufferGeometry` 3D 网格数据。使用 washer/shell 构造法生成内外轮廓，闭合剖面后进行角度扫描 (sweep) 得到三角网格。支持**逐顶点着色 (per-vertex coloring)**：每个轮廓点通过 `TaggedProfilePoint.origin` 标记来源曲线（`"upper"` / `"lower"`），`generateRevolutionGeometry()` 接收 `upperColor` / `lowerColor` 两个可选参数，生成额外的 `colors: Float32Array`（RGB per-vertex）供 Three.js `vertexColors` 消费。

**Three.js 集成 (`useThreeScene.ts`)：**

> ⚠️ 注意：`useThreeScene` 命名虽以 `use` 开头，但实际上是一个**工厂函数**，不是 React Hook。它返回一组操作方法的对象，供组件通过 `useRef` 持有实例。

Three.js 的场景、相机、渲染器被封装在 `useThreeScene` 工厂中。关键设计点：

- **Strict Mode 兼容**: 在 `useEffect` 中创建实例，通过 `requestAnimationFrame` 延迟 `init()`，确保容器有布局尺寸。清理函数中调用 `dispose()` 并将 ref 置空。
- **OrbitControls**: 启用阻尼（damping）、旋转、缩放、平移，支持鼠标拖动交互。右键菜单已全局禁用。
- **动画系统**: 支持旋转体生成动画（缓入缓出三次方），通过 `startAnimation(duration)` 触发。
- **自动相机适配**: 基于几何体的包围球 (BoundingSphere) 自动调整相机位置和远近裁剪面。
- **主题感知**: `updateBackground(isDark)` 同步更新渲染器背景色和网格颜色。
- **内存管理**: `dispose()` 严格释放所有 GPU 资源（几何体、材质、纹理），防止 WebGL 上下文泄漏。

**Generate 流程：**
1. 点击 Generate 按钮触发 `handleGenerate()`（使用 `useCallback` 缓存）
2. 使用 `computeRegion()` 计算 2D 有界区域
3. 使用 `computeVolume()` 数值积分计算体积
4. **自动切换到 3D 视图** (`setActiveView("3d")`)
5. **从前两条曲线的颜色构建 `curveColors: [string, string]`**，传入 `buildSolid()` 和 `generateRevolutionGeometry()` 以生成逐顶点颜色
6. 调用 `buildSolid()` 生成 3D 网格并添加到场景（含 `requestAnimationFrame` 重试以确保场景就绪）
7. 如果启用动画，触发 `startAnimation()`

**3D 逐曲线着色 (Per-Curve Coloring)：**
- 3D 旋转体表面使用**逐顶点颜色 (vertex colors)**，由 2D 曲线的颜色决定：旋转后由某条曲线生成的那一面，着色为该曲线在 2D 中的颜色
- `meshEngine.ts` 中的 `generateMeshProfiles()` 为每个轮廓点标记 `origin: "upper" | "lower"`，`generateRevolutionGeometry()` 据此生成 `colors` Float32Array
- Three.js 材质设置 `vertexColors: true`，不再使用单一 `color` 属性
- 截面高亮 (`buildCrossSection`) 中，上轮廓线和下轮廓线也分别使用各自曲线的颜色，填充区域使用两色混合
- 当用户修改曲线颜色时，通过 `useEffect` 监听 `curveInputs` 变化，自动调用 `updateDisplay(display, curveColors)` 触发网格重建以同步顶点颜色

---

## 2D Canvas 渲染

`Canvas2D.tsx` 组件提供交互式 2D 函数图形预览：

### 组件设计
- 使用 `forwardRef` + `useImperativeHandle` 暴露 `Canvas2DHandle` 接口
- 导出 `takeScreenshot(): string | null` 方法，供父组件调用以导出 2D 画布为 PNG 图片
- 所有图标（缩放按钮）使用 lucide-react 的 `ZoomIn` / `ZoomOut`

### 核心功能
- **坐标系**: 自适应网格、坐标轴、箭头、轴标签 (x/y)
- **刻度值**: 在 x 轴和 y 轴的刻度位置显示数值标签，方便读取坐标
- **原点标识**: 在坐标原点显示 "O" 标记
- **曲线绘制**: 使用 `sampleCurve()` 采样后连线，支持断点处理 (NaN/Infinity)
- **区域填充**: 半透明蓝色填充上下轮廓之间的封闭区域
- **旋转轴**: 红色虚线标示当前旋转轴位置

### 交点检测与标注
- 自动检测视口内所有曲线对的交点（扫描 + 二分法）
- **性能优化**: `findIntersections` 在进入曲线对嵌套循环之前，先为每条曲线预计算一次采样结果（`samplesCache`）和编译后的求值函数（`compiledCache`），在不同曲线对和二分步骤中复用这些缓存数据，避免重复调用 `sampleCurve`；二分搜索阶段直接使用 `compileCurve` / `evalCurve` 进行单点求值，而非对微小范围重新采样
- 在交点处绘制醒目的圆形标记
- 显示交点坐标标签，如 `(1, 1)`，带有背景色胶囊
- 从交点向 x 轴和 y 轴绘制虚线投影线
- 在坐标轴对应位置标注交点的 x 和 y 值

### 交互
- 鼠标拖拽平移视口
- 滚轮缩放（限制 1–1000 倍）
- 右键菜单已禁用（组件级 `onContextMenu`）
- 当区域或边界变化时自动适配视口

---

## CSS 与样式架构

项目使用 **Tailwind CSS v4** 结合原生 CSS 变量进行样式管理。

### Tailwind v4 集成
直接在 `src/style.css` 中使用 `@import "tailwindcss";`，无需繁琐的 `tailwind.config.js`。

### 主题系统
- 在 `:root` 和 `[data-theme="dark"]` 中定义 CSS 变量（如 `--c-bg`, `--c-primary`）。
- 使用 Tailwind v4 的 `@theme` 指令将这些 CSS 变量映射为 Tailwind 的实用类（如 `bg-primary`, `text-text-soft`）。
- 统一圆角设计令牌：`--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 16px`, `--radius-xl: 24px`。

### 组件类提取
使用 `@layer components` 将常用的组合样式提取为独立的 CSS 类，保持 JSX 结构的整洁：

| 类名 | 用途 | 圆角 |
|------|------|------|
| `.btn` | 通用按钮 | `rounded-md` |
| `.btn-primary` | 主要操作按钮 | 继承 `.btn` |
| `.btn-sm` | 小号按钮 | 继承 `.btn` |
| `.card` | 卡片容器 | `rounded-md` |
| `.card-header` | 卡片头部 | — |
| `.card-body` | 卡片内容区 | — |
| `.input` | 输入框 | `rounded-md` |
| `.mode-btn` | 模式切换按钮 | `rounded-md` |
| `.axis-btn` | 轴选择按钮 | `rounded-md` |
| `.preset-btn` | 预设按钮 | `rounded-md` |
| `.view-tab` | 视图切换标签 | `rounded-md` |
| `.nav-link` | 导航链接 | `rounded-md` |
| `.header-btn` | 头部图标按钮 | `rounded-md` |
| `.canvas-ctrl-btn` | 画布控制按钮 | `rounded-md` |

> **设计规范**: 所有交互组件统一使用 `rounded-md`（10px 圆角），确保视觉一致性。

### 卡片式设计
侧边栏中的所有面板（帮助说明、曲线输入、显示选项等）统一使用 `.card` / `.card-header` / `.card-body` 组合，保持一致的视觉风格。

---

## UX 设计规范

### 图标规范
- **所有 UI 图标均使用 lucide-react 图标库**，不使用任何内联 SVG 或其他图标库
- 包括：导航、操作按钮、视图切换、缩放控制（`ZoomIn`/`ZoomOut`）、导出（`Download`）、帮助（`HelpCircle`）、语言（`Globe`）等

### Header 设计
- **Logo**: 居中的斜体衬线字母 `x`，圆角蓝色方块背景 (`bg-primary`)，纯 HTML+CSS 渲染（非 SVG 图标）
- **Favicon**: 同样的斜体 `x` 主题 SVG（`public/vite.svg`），蓝色渐变圆角方块
- **语言切换**: 使用 lucide-react 的 `Globe` 图标，点击在中/英之间切换
- **主题切换**: `Sun`/`Moon` 图标 (lucide-react)，默认跟随系统偏好，点击取反

### 旋转轴选择
- 使用 i18n 键 `revolution.axis.xAxis` / `revolution.axis.yAxis`
- **X 轴按钮** (`axis = "x"`): 标签 `"X 轴 (y=c)"` / `"X-Axis (y=c)"`，绕水平轴（平行于 X 轴的线 `y = c`）旋转，引擎使用圆盘/垫圈法
- **Y 轴按钮** (`axis = "y"`): 标签 `"Y 轴 (x=c)"` / `"Y-Axis (x=c)"`，绕竖直轴（平行于 Y 轴的线 `x = c`）旋转，引擎使用柱壳法
- 下方输入框显示 `y =` 或 `x =` 用于设置轴偏移值 (`axisValue`)

### 显示选项
- **模式** (Mode): `solid` / `wireframe` / `transparent` 三选一
- **不透明度** (Opacity): 仅在 `transparent` 模式下显示滑块
- **分辨率** (Resolution): 角度分段数，影响 3D 网格精度
- **颜色**: 已从显示选项中移除独立的颜色选择器，3D 实体颜色通过逐顶点着色自动跟随对应 2D 曲线的颜色（在曲线定义区修改），旋转体的每一面都着色为生成它的那条曲线的颜色
- **复选框**: 坐标轴 / 网格 / 截面 / 动画

### 视口设计（2D / 3D 统一卡片）
- **默认视图为 2D**（`activeView` 初始值 `"2d"`），用户可在侧边栏输入曲线后直接预览 2D 图形
- 2D 和 3D 视图共享**同一个卡片容器**（`rounded-xl border shadow-sm`），位置和大小完全一致
- 通过 `opacity` + `pointer-events` 切换可见性，无布局跳动
- 卡片底部紧贴结果面板收起态的上方，通过动态 `paddingBottom` 实现
- 3D 占位状态显示 `Layers` 图标 + 提示文字，背景色为 `bg-bg`

### 结果面板
- 定位于主视口的**底部**，占满左右宽度（`left-0 right-0 bottom-0`）
- 毛玻璃背景 (`backdrop-blur-xl`)，上方 border 投影
- 可折叠：点击头部收起/展开，收起时仅显示标题栏（44px）
- 内容区横向排列 Volume 和 Formula，节省垂直空间
- **公式框点击即复制**：鼠标悬停显示 `Copy` 图标提示，点击自动复制 LaTeX 到剪贴板，无独立的 Copy 按钮

### 导出图片
- Export Image 按钮（`Download` 图标）在 2D 和 3D 视图中**均可用**，位置固定在右上角
- 3D 导出调用 `threeSceneRef.takeScreenshot()`
- 2D 导出调用 `canvas2DRef.takeScreenshot()`（通过 `forwardRef` / `useImperativeHandle` 暴露）

### 默认曲线与边界
- 默认加载 `y = x^2` 和 `y = x`，边界 `[0, 1]`（对应预设 "抛物线与直线"）
- 两条曲线在 `x = 0` 和 `x = 1` 处相交，区域完全位于交点之间，不会出现越界区域
- Reset 恢复到与初始状态一致的默认预设（`y = x^2`、`y = x`，边界 `[0, 1]`）

### 右键菜单
- 右键菜单禁用的作用范围**仅限于 2D/3D 视口容器**（通过 `viewportRef` 绑定 `contextmenu` 事件），不影响侧边栏、导航栏等其他 UI 元素的浏览器默认行为
- 2D Canvas 组件也在自身 JSX 上独立禁用右键（`onContextMenu`）

### 自动视图切换
- 默认进入页面时显示 2D 视图
- 点击 Generate 后自动切换到 3D 视图，无需手动操作
- Reset 时自动切换回 2D 视图

---

## 构建与运行

项目使用 Vite 作为构建工具，提供极速的冷启动和 HMR（热更新）。

### 安装依赖
```bash
pnpm install
```

### 开发环境
```bash
pnpm dev
```
启动本地开发服务器，默认端口 `3000`。

### 生产构建
```bash
pnpm build
```
执行 TypeScript 类型检查 (`tsc -b`) 并使用 Vite 进行生产环境打包。打包配置中已对 `three`, `mathjs`, `katex`, `react` 等大型依赖进行了分包 (Manual Chunks) 优化。

### 预览生产构建
```bash
pnpm preview
```
