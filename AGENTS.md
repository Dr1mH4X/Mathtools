# AGENTS.md

## 开发命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器，端口 3000 |
| `pnpm build` | 先执行 `tsc -b` 类型检查，再 Vite 构建 |
| `pnpm preview` | 预览生产构建 |

## 构建注意

- **类型检查在前**：`build` 脚本先运行 `tsc -b`，再执行 Vite 构建，顺序不可颠倒
- **无测试脚本**：项目未配置测试框架，无 `test`、`lint`、`typecheck` 等额外命令

## 架构要点

- **路由**：使用 `HashRouter`（`react-router-dom`），URL 格式 `/#/path`，适配静态托管环境
- **Three.js 工厂函数**：`src/composables/useThreeScene.ts` 命名以 `use` 开头但**不是 React Hook**，返回操作方法对象，供组件通过 `useRef` 持有实例
- **逐顶点着色**：3D 旋转体表面通过 `meshEngine.ts` 生成 `colors: Float32Array`，每面着色由生成它的 2D 曲线颜色决定
- **状态管理**：Zustand 5，位于 `src/stores/`，主题 store 不使用 localStorage，通过 `matchMedia` 检测系统偏好

## CSS 与主题

- **Tailwind v4**：在 `src/style.css` 中使用 `@import "tailwindcss"`，无需 `tailwind.config.js`
- **主题切换**：CSS 变量定义在 `:root`（浅色）和 `[data-theme="dark"]`（深色），通过 `useThemeStore` 同步 `data-theme` 属性到 `<html>`

## i18n

- 使用 `i18next` + `react-i18next`，自定义插值语法 `{placeholder}`（配置在 `src/i18n/config.ts`）
- 语言文件：`src/i18n/locales/en.json`、`zh.json`

## 目录结构

```
src/
├── components/     # React 组件
├── composables/    # Hooks / 工厂函数
├── i18n/          # 国际化配置与语言包
├── pages/         # 页面级组件
├── stores/        # Zustand 状态管理
└── utils/         # 纯函数引擎（mathEngine, curveEngine, regionEngine, volumeEngine, meshEngine, latex）
```