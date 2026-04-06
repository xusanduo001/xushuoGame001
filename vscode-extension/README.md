# Token Platform for VS Code

将你自己的 **Token 汇聚平台**集成到 VS Code 窗口中使用。

> **Token 汇聚平台**指的是像 [one-api](https://github.com/songquanpeng/one-api)、[new-api](https://github.com/Calcium-Ion/new-api) 这类能聚合多个 AI API Key 并对外提供统一 OpenAI 兼容接口的中转服务。

---

## 集成方式总览

共有 **4 种**将 Token 汇聚平台集成到 VS Code 的方式：

| 方式 | 难度 | 效果 |
|------|------|------|
| [方法1：WebView 聊天面板](#方法1-webview-聊天面板侧边栏) | ⭐⭐ | 侧边栏独立聊天 UI |
| [方法2：语言模型 API 提供者](#方法2-语言模型-api-提供者) | ⭐⭐⭐ | 原生 Copilot 能力 |
| [方法3：Copilot Chat 参与者](#方法3-copilot-chat-参与者) | ⭐⭐ | @token-platform 指令 |
| [方法4：配置现有 AI 扩展](#方法4-配置现有-ai-扩展无需写代码) | ⭐ | 零代码接入 |

---

## 方法1：WebView 聊天面板（侧边栏）

**原理**：编写 VS Code 扩展，使用 `WebviewViewProvider` 在侧边栏中嵌入一个自定义 HTML 聊天界面。扩展主机进程负责调用 Token 平台 API，再将结果通过 `postMessage` 传回 WebView 渲染。

**本仓库实现**：[`src/chatViewProvider.ts`](./src/chatViewProvider.ts) + [`src/extension.ts`](./src/extension.ts)

### 核心代码结构

```typescript
// package.json 中声明 WebView 视图
"contributes": {
  "viewsContainers": {
    "activitybar": [{ "id": "tokenPlatformContainer", "title": "Token Platform" }]
  },
  "views": {
    "tokenPlatformContainer": [{
      "type": "webview",
      "id": "tokenPlatform.chatView",
      "name": "AI 聊天"
    }]
  }
}

// extension.ts 中注册提供者
vscode.window.registerWebviewViewProvider(
  'tokenPlatform.chatView',
  new ChatViewProvider(context.extensionUri)
);
```

### 数据流
```
用户输入 → WebView (postMessage) → 扩展主机
     → fetch(baseUrl/v1/chat/completions) → Token平台
     → SSE流式响应 → postMessage → WebView渲染
```

**优点**：
- 完全自定义 UI，体验好
- 不依赖 Copilot 订阅
- 支持流式输出

**缺点**：
- 需要编写和维护扩展代码
- WebView CSP 限制，需通过扩展主机转发请求

---

## 方法2：语言模型 API 提供者

**原理**：VS Code 1.94+ 引入了 `vscode.lm.registerChatModelProvider`，允许扩展将自己注册为原生语言模型提供者。注册后，VS Code 内置的 AI 功能（如内联补全、智能操作）和其他扩展都可以通过 `vscode.lm` API 使用你的 Token 平台。

**本仓库实现**：[`src/extension.ts`](./src/extension.ts) 中的 `registerLanguageModelProvider` 函数

### 核心代码结构

```typescript
vscode.lm.registerChatModelProvider(
  'tokenPlatform.lm-provider',
  {
    async provideLanguageModelResponse(messages, options, extensionId, progress, token) {
      // 调用你的 Token 平台 API
      await client.streamChat(messages, (chunk) => {
        progress.report({ index: 0, part: new vscode.LanguageModelTextPart(chunk) });
      });
    },
    async provideTokenCount(text, token) {
      return Math.ceil(text.length / 4); // 估算 token 数量
    }
  },
  {
    name: 'Token Platform',
    vendor: 'custom',
    family: 'custom',
    version: '1.0',
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
  }
);
```

### 其他扩展如何使用你的提供者

```typescript
// 其他扩展可以选择你的模型
const [model] = await vscode.lm.selectChatModels({
  vendor: 'custom',
  family: 'custom'
});
const response = await model.sendRequest(messages, {});
```

**优点**：
- 与 VS Code 原生 AI 体系深度集成
- 其他扩展可以直接调用你的平台
- 支持 VS Code 的 AI 权限管理

**缺点**：
- 需要 VS Code 1.94+
- API 仍在演进中，可能有兼容性变化

---

## 方法3：Copilot Chat 参与者

**原理**：使用 `vscode.chat.createChatParticipant` 在 GitHub Copilot Chat 窗口中注册一个 `@token-platform` 指令参与者。用户在 Copilot Chat 中输入 `@token-platform <问题>` 时，请求会被转发到你的 Token 平台。

**本仓库实现**：[`src/extension.ts`](./src/extension.ts) 中的 `registerCopilotChatParticipant` 函数

### 核心代码结构

```typescript
// package.json 中声明参与者（必须）
"contributes": {
  "chatParticipants": [{
    "id": "tokenPlatform.assistant",
    "name": "token-platform",
    "fullName": "Token Platform AI",
    "description": "使用你的Token汇聚平台进行AI对话"
  }]
}

// extension.ts 中实现处理逻辑
const participant = vscode.chat.createChatParticipant(
  'tokenPlatform.assistant',
  async (request, chatContext, response, token) => {
    // 将历史对话 + 当前问题发给 Token 平台
    await client.streamChat(messages, (chunk) => response.markdown(chunk));
  }
);
```

### 使用示例

在 Copilot Chat 窗口中：
```
@token-platform 帮我解释这段代码的作用
@token-platform 用中文重写以下函数，使其更简洁
@token-platform 这里有什么 Bug？
```

**优点**：
- 复用 Copilot Chat 的界面和上下文感知能力
- 支持代码块引用、文件引用等 Copilot Chat 特性
- 用户体验与 Copilot 一致

**缺点**：
- 依赖 GitHub Copilot Chat 扩展（免费版也支持）
- 需要在 `package.json` 的 `chatParticipants` 中静态声明

---

## 方法4：配置现有 AI 扩展（无需写代码）

如果你的 Token 平台提供 OpenAI 兼容 API，可以直接配置以下任意一款已有扩展，**无需编写任何代码**：

### 4a. Continue.dev

[Continue.dev](https://marketplace.visualstudio.com/items?itemName=Continue.continue) 是最流行的开源 AI 编程助手。

在 `~/.continue/config.json` 中配置：

```json
{
  "models": [{
    "title": "My Token Platform",
    "provider": "openai",
    "model": "gpt-4o",
    "apiBase": "http://your-token-platform.com/v1",
    "apiKey": "your-api-key"
  }]
}
```

### 4b. Cline（原 Claude Dev）

[Cline](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) 支持自定义 OpenAI 兼容端点。

在扩展设置中选择 **OpenAI Compatible** 提供者，然后填入：
- API Base URL: `http://your-token-platform.com/v1`
- API Key: 你的密钥
- Model: 模型名称

### 4c. Copilot 自定义端点（企业版）

GitHub Copilot 企业版支持通过网络代理或自定义端点使用。在 VS Code 设置中配置：

```json
{
  "github.copilot.advanced": {
    "authProvider": "github"
  },
  "http.proxy": "http://your-token-platform.com"
}
```

### 4d. 通用 OpenAI 扩展

任何支持配置 `baseURL` 的扩展都可以接入你的平台，例如：
- [ChatGPT - Genie AI](https://marketplace.visualstudio.com/items?itemName=genieai.chatgpt-vscode)
- [CodeGPT](https://marketplace.visualstudio.com/items?itemName=DanielSanMedium.dscodegpt)

**优点**：
- 零开发工作量
- 可立即使用成熟扩展的所有功能

**缺点**：
- 依赖第三方扩展的维护状态
- 自定义能力受限

---

## 快速开始（使用本扩展）

### 1. 安装依赖

```bash
cd vscode-extension
npm install
npm run compile
```

### 2. 调试运行

在 VS Code 中按 `F5` 启动扩展开发主机窗口。

### 3. 配置 Token 平台

打开 VS Code 设置（`Ctrl+,`），搜索 `tokenPlatform`：

| 设置项 | 说明 | 示例 |
|--------|------|------|
| `tokenPlatform.baseUrl` | 平台基础 URL | `http://localhost:3000` |
| `tokenPlatform.apiKey` | API 密钥 | `sk-xxxx` |
| `tokenPlatform.model` | 默认模型 | `gpt-4o` |
| `tokenPlatform.maxTokens` | 最大 Token 数 | `4096` |

或者直接编辑 `settings.json`：

```json
{
  "tokenPlatform.baseUrl": "http://your-token-platform.com",
  "tokenPlatform.apiKey": "sk-your-key",
  "tokenPlatform.model": "gpt-4o"
}
```

### 4. 使用方式

- **侧边栏聊天**：点击活动栏中的 Token Platform 图标（方法1）
- **Copilot Chat**：在 Copilot Chat 中输入 `@token-platform <问题>`（方法3）
- **命令面板**：`Ctrl+Shift+P` → 搜索 `Token Platform`

---

## 项目结构

```
vscode-extension/
├── package.json              # 扩展清单（贡献点声明）
├── tsconfig.json             # TypeScript 配置
├── media/
│   └── icon.svg              # 活动栏图标
├── src/
│   ├── extension.ts          # 扩展入口（方法2、3在此注册）
│   ├── chatViewProvider.ts   # 方法1：WebView 聊天面板
│   └── tokenPlatformClient.ts # OpenAI 兼容 API 客户端
└── README.md                 # 本文档
```

---

## Token 平台 API 格式要求

本扩展使用 **OpenAI 兼容格式**。你的 Token 平台需要支持以下端点：

```
POST /v1/chat/completions   # 聊天补全（支持 stream: true）
GET  /v1/models             # 可选：模型列表
```

主流 Token 汇聚平台（one-api、new-api、LiteLLM 等）均默认支持此格式。
