/**
 * extension.ts — VS Code扩展入口
 *
 * 集成Token汇聚平台到VS Code的三种方式：
 *   方法1: WebView聊天面板（侧边栏）
 *   方法2: 语言模型API提供者（Language Model API Provider）
 *   方法3: Copilot Chat参与者（Chat Participant）
 */

import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { TokenPlatformClient, ChatMessage } from './tokenPlatformClient';

export function activate(context: vscode.ExtensionContext) {
  // ─────────────────────────────────────────────────────────
  // 方法1: WebView聊天面板
  // 在侧边栏注册一个全功能聊天界面，直接调用Token平台API
  // ─────────────────────────────────────────────────────────
  const chatProvider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // 命令：打开聊天面板
  context.subscriptions.push(
    vscode.commands.registerCommand('tokenPlatform.openChat', () => {
      vscode.commands.executeCommand(
        'workbench.view.extension.tokenPlatformContainer'
      );
    })
  );

  // 命令：清空聊天记录
  context.subscriptions.push(
    vscode.commands.registerCommand('tokenPlatform.clearChat', () => {
      chatProvider.clearChat();
    })
  );

  // 命令：打开配置
  context.subscriptions.push(
    vscode.commands.registerCommand('tokenPlatform.configure', () => {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'tokenPlatform'
      );
    })
  );

  // ─────────────────────────────────────────────────────────
  // 方法2: 语言模型API提供者（VS Code 1.94+）
  // 将Token平台注册为VS Code原生语言模型，
  // 使其可以被Copilot功能和其他扩展直接调用
  // ─────────────────────────────────────────────────────────
  registerLanguageModelProvider(context);

  // ─────────────────────────────────────────────────────────
  // 方法3: Copilot Chat参与者
  // 在Copilot聊天中注册 @token-platform 指令，
  // 用户可以直接在Copilot Chat窗口中使用Token平台
  // ─────────────────────────────────────────────────────────
  registerCopilotChatParticipant(context);
}

/**
 * 方法2: 注册为VS Code语言模型提供者
 *
 * 需要VS Code 1.90+，并且 package.json 中声明
 * "languageModelProvider" 贡献点。注册后，VS Code内置
 * AI功能和其他扩展可以通过 vscode.lm API 使用该平台。
 */
function registerLanguageModelProvider(
  context: vscode.ExtensionContext
): void {
  // vscode.lm.registerChatModelProvider 在 VS Code 1.94+ 可用
  // ChatResponseFragment2 是实验性类型，用 unknown 替代以保持向后兼容
  const lmApi = vscode.lm as {
    registerChatModelProvider?: (
      id: string,
      provider: {
        provideLanguageModelResponse(
          messages: vscode.LanguageModelChatMessage[],
          options: vscode.LanguageModelChatRequestOptions,
          extensionId: string,
          progress: vscode.Progress<unknown>,
          token: vscode.CancellationToken
        ): Thenable<unknown>;
        provideTokenCount(
          text: string | vscode.LanguageModelChatMessage,
          token: vscode.CancellationToken
        ): Thenable<number>;
      },
      metadata: {
        name: string;
        vendor: string;
        family: string;
        version: string;
        maxInputTokens: number;
        maxOutputTokens: number;
        isDefault?: boolean;
      }
    ) => vscode.Disposable;
  };

  if (typeof lmApi.registerChatModelProvider !== 'function') {
    // 当前VS Code版本不支持，跳过
    return;
  }

  const provider = lmApi.registerChatModelProvider(
    'tokenPlatform.lm-provider',
    {
      async provideLanguageModelResponse(
        messages,
        _options,
        _extensionId,
        progress,
        token
      ) {
        const config = vscode.workspace.getConfiguration('tokenPlatform');
        const client = new TokenPlatformClient({
          baseUrl: config.get<string>('baseUrl', 'http://localhost:3000'),
          apiKey: config.get<string>('apiKey', ''),
          model: config.get<string>('model', 'gpt-4o'),
          maxTokens: config.get<number>('maxTokens', 4096),
        });

        const chatMessages: ChatMessage[] = messages.map((m) => ({
          role:
            m.role === vscode.LanguageModelChatMessageRole.User
              ? 'user'
              : 'assistant',
          content: m.content
            .map((p) =>
              p instanceof vscode.LanguageModelTextPart ? p.value : ''
            )
            .join(''),
        }));

        const abortController = new AbortController();
        token.onCancellationRequested(() => abortController.abort());

        await client.streamChat(
          chatMessages,
          (chunk) => {
            progress.report({ index: 0, part: new vscode.LanguageModelTextPart(chunk) });
          },
          abortController.signal
        );
      },

      async provideTokenCount(text, _token) {
        const str =
          typeof text === 'string'
            ? text
            : text.content
                .map((p) =>
                  p instanceof vscode.LanguageModelTextPart ? p.value : ''
                )
                .join('');
        // 粗略估算：平均每个Token约4个字符
        return Math.ceil(str.length / 4);
      },
    },
    {
      name: 'Token Platform',
      vendor: 'custom',
      family: 'custom',
      version: '1.0',
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
      isDefault: false,
    }
  );

  context.subscriptions.push(provider);
}

/**
 * 方法3: 注册Copilot Chat参与者
 *
 * 需要GitHub Copilot Chat扩展已安装。
 * 注册后，用户可在Copilot Chat中使用 @token-platform 前缀，
 * 例如："@token-platform 解释这段代码"
 */
function registerCopilotChatParticipant(
  context: vscode.ExtensionContext
): void {
  if (!vscode.chat?.createChatParticipant) {
    // Copilot Chat API 不可用
    return;
  }

  const participant = vscode.chat.createChatParticipant(
    'tokenPlatform.assistant',
    async (
      request: vscode.ChatRequest,
      chatContext: vscode.ChatContext,
      response: vscode.ChatResponseStream,
      token: vscode.CancellationToken
    ) => {
      const config = vscode.workspace.getConfiguration('tokenPlatform');
      const baseUrl = config.get<string>('baseUrl', '');
      const apiKey = config.get<string>('apiKey', '');

      if (!baseUrl || !apiKey) {
        response.markdown(
          '⚠️ 请先配置 `tokenPlatform.baseUrl` 和 `tokenPlatform.apiKey`。\n\n' +
            '打开命令面板 (`Ctrl+Shift+P`) → **Token Platform: 配置**'
        );
        return;
      }

      const client = new TokenPlatformClient({
        baseUrl,
        apiKey,
        model: config.get<string>('model', 'gpt-4o'),
        maxTokens: config.get<number>('maxTokens', 4096),
      });

      // 将Copilot聊天历史转换为API格式
      const messages: ChatMessage[] = chatContext.history
        .map((h): ChatMessage | null => {
          if (h instanceof vscode.ChatRequestTurn) {
            return { role: 'user', content: h.prompt };
          }
          if (h instanceof vscode.ChatResponseTurn) {
            const text = h.response
              .map((p) => (p instanceof vscode.ChatResponseMarkdownPart ? p.value.value : ''))
              .join('');
            return { role: 'assistant', content: text };
          }
          return null;
        })
        .filter((m): m is ChatMessage => m !== null);

      messages.push({ role: 'user', content: request.prompt });

      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      try {
        await client.streamChat(
          messages,
          (chunk) => response.markdown(chunk),
          abortController.signal
        );
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (!isAbort) {
          const message = err instanceof Error ? err.message : '未知错误';
          response.markdown(`❌ **错误**: ${message}`);
        }
      }
    }
  );

  participant.iconPath = new vscode.ThemeIcon('robot');
  context.subscriptions.push(participant);
}

export function deactivate() {
  // 清理资源由 context.subscriptions 自动处理
}
