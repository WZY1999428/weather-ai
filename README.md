# WeatherAI — 桌面 AI 天气助手

基于 **Electron + Vue 3 + TypeScript** 的桌面 AI 助手。使用 **DeepSeek API**（OpenAI 兼容格式）的 Function Calling，让模型自主决定何时调用本地注册的工具。第一阶段内置和风天气（QWeather）天气工具（城市搜索、实时天气、多日预报）。不使用 MCP。

## 功能

- DeepSeek 普通对话、多轮上下文、流式输出、停止生成、重新生成、连接测试
- 通用 `ToolRegistry` + `AgentManager`：一次响应多个工具调用、连续多轮调用、最大轮数限制（8）、AJV Schema 校验、`tool_call_id` 关联、执行状态与耗时记录、取消请求
- 天气工具：`search_city` / `get_current_weather` / `get_weather_forecast`（坐标必须来自 `search_city` 结果，模型无法编造）
- 聊天界面：会话列表（新建/重命名/删除）、Markdown 与代码高亮、复制、消息时间、工具调用卡片（Waiting / Running / Success / Failed）、右侧工具详情面板、实时天气卡片、多日预报卡片
- 设置页：API Key、Base URL、模型、Temperature、Max Tokens、超时、和风天气 API Key / API Host、默认城市、温度单位、预报天数、开机启动、自动保存、清空历史、关于
- SQLite（better-sqlite3）持久化，重启后恢复完整对话（包括工具调用与结果）

## 架构

```
src/
├── main/                     # 主进程：所有网络请求、工具执行、存储
│   ├── ai/                   # deepseek.ts / agent-manager.ts / conversation-manager.ts
│   ├── tools/                # types.ts / registry.ts / weather/*
│   ├── services/qweather.ts
│   ├── database/             # SQLite 连接 + migrations
│   ├── config/               # 配置（API Key 用 safeStorage 加密）
│   ├── ipc/                  # 带参数校验的 IPC 处理
│   └── index.ts
├── preload/                  # contextBridge 暴露 window.weatherAI（不暴露 ipcRenderer / Node API）
├── shared/                   # 主进程与 Renderer 共享的 IPC 类型
└── renderer/src/             # Vue 3 + Element Plus + Pinia
```

安全：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；Renderer 只能拿到 API Key 的掩码；只执行注册表中的工具；不使用 `eval`。

### 扩展新工具

在 `src/main/tools/` 下实现一个 `ToolDefinition`（`name`、`description`、JSON Schema `parameters`、`execute`），然后在 `src/main/tools/index.ts` 的 `createToolRegistry` 中 `registry.register(...)` 即可，AgentManager 和 UI 无需改动。

## 环境要求

- Node.js 20+
- pnpm 9（`corepack enable` 或 `npm i -g pnpm@9`）
- Windows 打包推荐在 Windows 上执行（或使用仓库自带的 GitHub Actions）

## 开发

```bash
pnpm install          # 安装依赖，并为 Electron 重编译 better-sqlite3
pnpm dev              # 启动开发模式（热更新）
pnpm typecheck        # 主进程 + Renderer 类型检查
pnpm test             # 单元/集成测试（天气相关用例需设置环境变量 QWEATHER_API_KEY，可选 QWEATHER_API_HOST；未设置时跳过）
pnpm build            # 类型检查 + 生产构建到 out/
pnpm preview          # 预览生产构建
```

首次启动后进入「设置」填写 DeepSeek API Key（https://platform.deepseek.com/api_keys），点击「测试连接」；再在「设置 → 天气」填写和风天气 API Key。默认模型 `deepseek-chat`，Base URL `https://api.deepseek.com`。

## 打包

```bash
pnpm dist:win         # Windows x64 NSIS 安装包 -> release/<version>/WeatherAI-Setup-<version>-x64.exe
pnpm dist:dir         # 当前平台的免安装目录（调试用）
```

- 安装包支持选择安装路径、创建桌面/开始菜单快捷方式，并自带卸载程序。
- 版本号取自 `package.json` 的 `version`。
- 图标：`build/icon.ico`（安装包/exe）、`resources/icon.png`（窗口）。
- 在 Linux/macOS 上交叉打包 Windows 需要安装 wine；`scripts/after-pack.cjs` 会自动下载 better-sqlite3 的 win32 预编译二进制替换。
- CI：`.github/workflows/build-windows.yml` 在 `windows-latest` 上执行类型检查、测试和打包，并上传安装包为 artifact。

## 数据位置

配置与聊天记录保存在 Electron 用户数据目录（不依赖安装路径）：

| 系统 | 路径 |
|---|---|
| Windows | `%APPDATA%\WeatherAI\` |
| macOS | `~/Library/Application Support/WeatherAI/` |
| Linux | `~/.config/WeatherAI/` |

- `config.json`：配置（API Key 已加密）
- `weather-ai.db`：SQLite 数据库（`conversations`、`messages` 表）

## 天气数据

来自 [和风天气 QWeather](https://dev.qweather.com/docs/configuration/)，天气卡片只展示真实 API 返回数据，并标注更新时间。

- 在 [和风天气控制台](https://console.qweather.com/) 创建 **API KEY** 类型凭据，填入「设置 → 天气 → 和风 API Key」（请求头 `X-QW-Api-Key`）。
- 「API Host」填写控制台中的专属 API Host（如 `abc1234xyz.def.qweatherapi.com`）；留空则使用公共域名 `geoapi.qweather.com` / `devapi.qweather.com`。
- 预报接口为 3/7/10/15 天档位，最多 15 天；和风天气每日预报不提供降水概率，卡片只显示降水量。
- CI 中通过仓库 Secret `QWEATHER_API_KEY`（可选 `QWEATHER_API_HOST`）运行真实天气测试。
