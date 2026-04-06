<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/664ebf0a-1d98-4b9b-8bc0-7c3774f934c0

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## GitHub Copilot Pro 常见问题 / FAQ

### 禁用 GitHub Copilot Chat 后还能使用 Copilot Pro 的配额吗？

**是的，可以正常使用。**

GitHub Copilot Chat 和 Copilot Pro 的核心代码补全功能是两个相对独立的功能模块：

- **GitHub Copilot Chat**：是 IDE（如 VS Code）中的对话式 AI 界面，禁用它只会关闭聊天窗口功能，**不会影响** Copilot Pro 订阅本身的有效性，也不会取消你的付费配额。
- **Copilot Pro 代码补全**：即编辑器中实时的行内代码建议（inline suggestions），与 Chat 功能独立运行。禁用 Chat 后，代码补全仍然正常工作。
- **本地 Agent / 第三方工具**：如果你通过本地 Agent（如 Auto 模式）或其他工具调用 Copilot API，这些调用会消耗你 Copilot Pro 订阅的配额，与是否启用 Chat 无关。

### Token 消耗说明

| 功能 | 是否消耗 Copilot Pro 配额 |
|------|--------------------------|
| VS Code 行内代码补全 | ✅ 是 |
| GitHub Copilot Chat | ✅ 是 |
| 本地 Agent（Auto 模式）调用 Copilot | ✅ 是 |
| Gemini API（本项目使用） | ❌ 否（消耗 Gemini 配额） |

> **提示**：本项目使用的是 Google Gemini API（`GEMINI_API_KEY`），与 GitHub Copilot Pro 订阅无关，不会消耗你的 Copilot 配额。
