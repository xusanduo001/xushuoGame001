/**
 * ChatViewProvider — 方法1: WebView聊天面板
 *
 * 在VS Code侧边栏中嵌入一个完整的聊天界面，
 * 通过扩展主机转发请求到Token汇聚平台。
 */

import * as vscode from 'vscode';
import { TokenPlatformClient, ChatMessage } from './tokenPlatformClient';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tokenPlatform.chatView';

  private _view?: vscode.WebviewView;
  private _messages: ChatMessage[] = [];
  private _abortController?: AbortController;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // 处理来自WebView的消息
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleUserMessage(data.text);
          break;
        case 'clearChat':
          this._clearChat();
          break;
        case 'stopGeneration':
          this._abortController?.abort();
          break;
      }
    });
  }

  /** 清空聊天记录 */
  public clearChat() {
    this._clearChat();
  }

  private _clearChat() {
    this._messages = [];
    this._abortController?.abort();
    this._view?.webview.postMessage({ type: 'clearChat' });
  }

  private _getClient(): TokenPlatformClient {
    const config = vscode.workspace.getConfiguration('tokenPlatform');
    return new TokenPlatformClient({
      baseUrl: config.get<string>('baseUrl', 'http://localhost:3000'),
      apiKey: config.get<string>('apiKey', ''),
      model: config.get<string>('model', 'gpt-4o'),
      maxTokens: config.get<number>('maxTokens', 4096),
    });
  }

  private async _handleUserMessage(text: string) {
    if (!text.trim()) {
      return;
    }

    const config = vscode.workspace.getConfiguration('tokenPlatform');
    const baseUrl = config.get<string>('baseUrl', '');
    const apiKey = config.get<string>('apiKey', '');

    if (!baseUrl || !apiKey) {
      this._view?.webview.postMessage({
        type: 'error',
        text: '请先在VS Code设置中配置 tokenPlatform.baseUrl 和 tokenPlatform.apiKey',
      });
      return;
    }

    this._messages.push({ role: 'user', content: text });
    this._view?.webview.postMessage({ type: 'startAssistant' });

    this._abortController = new AbortController();
    const client = this._getClient();

    try {
      let fullResponse = '';
      await client.streamChat(
        this._messages,
        (chunk) => {
          fullResponse += chunk;
          this._view?.webview.postMessage({ type: 'chunk', text: chunk });
        },
        this._abortController.signal
      );
      this._messages.push({ role: 'assistant', content: fullResponse });
      this._view?.webview.postMessage({ type: 'done' });
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      // 用户主动取消不显示错误
      if (!isAbort) {
        const message = err instanceof Error ? err.message : '未知错误';
        this._view?.webview.postMessage({ type: 'error', text: message });
      } else {
        this._view?.webview.postMessage({ type: 'done' });
      }
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // 使用nonce防止XSS
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Token Platform Chat</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .message {
      display: flex;
      flex-direction: column;
      max-width: 100%;
    }
    .message-role {
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 2px;
      opacity: 0.7;
    }
    .message-content {
      padding: 8px 10px;
      border-radius: 6px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }
    .message.user .message-role { color: var(--vscode-textLink-foreground); }
    .message.user .message-content {
      background: var(--vscode-editor-selectionBackground);
      border: 1px solid var(--vscode-editor-selectionHighlightBorder, transparent);
    }
    .message.assistant .message-role { color: var(--vscode-charts-green); }
    .message.assistant .message-content {
      background: var(--vscode-editor-inactiveSelectionBackground);
    }
    .message.error .message-content {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
    }
    #input-area {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    #user-input {
      width: 100%;
      min-height: 60px;
      max-height: 150px;
      resize: vertical;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 6px 8px;
      font-family: inherit;
      font-size: inherit;
      outline: none;
    }
    #user-input:focus {
      border-color: var(--vscode-focusBorder);
    }
    .btn-row {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
    button {
      padding: 4px 12px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
    }
    #send-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    #send-btn:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }
    #send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #stop-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      display: none;
    }
    #stop-btn.visible { display: inline-block; }
    .cursor {
      display: inline-block;
      width: 2px;
      height: 1em;
      background: currentColor;
      vertical-align: text-bottom;
      animation: blink 1s step-end infinite;
    }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
    #empty-hint {
      text-align: center;
      opacity: 0.4;
      padding: 20px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div id="messages">
    <div id="empty-hint">发送消息开始与Token平台AI对话</div>
  </div>
  <div id="input-area">
    <textarea id="user-input" placeholder="输入消息... (Ctrl+Enter 发送)" rows="3"></textarea>
    <div class="btn-row">
      <button id="stop-btn">停止</button>
      <button id="send-btn">发送</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const emptyHint = document.getElementById('empty-hint');

    let currentAssistantEl = null;
    let generating = false;

    function setGenerating(val) {
      generating = val;
      sendBtn.disabled = val;
      stopBtn.classList.toggle('visible', val);
    }

    function appendMessage(role, content, isError) {
      if (emptyHint) emptyHint.remove();
      const msg = document.createElement('div');
      msg.className = 'message ' + (isError ? 'error' : role);

      const roleLabel = document.createElement('div');
      roleLabel.className = 'message-role';
      roleLabel.textContent = role === 'user' ? '你' : role === 'assistant' ? 'AI' : '错误';

      const contentEl = document.createElement('div');
      contentEl.className = 'message-content';
      contentEl.textContent = content;

      msg.appendChild(roleLabel);
      msg.appendChild(contentEl);
      messagesEl.appendChild(msg);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return contentEl;
    }

    function send() {
      const text = inputEl.value.trim();
      if (!text || generating) return;
      appendMessage('user', text);
      inputEl.value = '';
      inputEl.style.height = 'auto';
      setGenerating(true);
      vscode.postMessage({ type: 'sendMessage', text });
    }

    sendBtn.addEventListener('click', send);
    stopBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'stopGeneration' });
    });

    inputEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        send();
      }
    });

    window.addEventListener('message', (event) => {
      const data = event.data;
      switch (data.type) {
        case 'startAssistant': {
          const contentEl = appendMessage('assistant', '');
          const cursor = document.createElement('span');
          cursor.className = 'cursor';
          contentEl.appendChild(cursor);
          currentAssistantEl = contentEl;
          break;
        }
        case 'chunk': {
          if (currentAssistantEl) {
            const cursor = currentAssistantEl.querySelector('.cursor');
            if (cursor) {
              currentAssistantEl.insertBefore(
                document.createTextNode(data.text), cursor
              );
            } else {
              currentAssistantEl.textContent += data.text;
            }
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          break;
        }
        case 'done': {
          if (currentAssistantEl) {
            const cursor = currentAssistantEl.querySelector('.cursor');
            if (cursor) cursor.remove();
            currentAssistantEl = null;
          }
          setGenerating(false);
          break;
        }
        case 'error': {
          if (currentAssistantEl) {
            const cursor = currentAssistantEl.querySelector('.cursor');
            if (cursor) cursor.remove();
            currentAssistantEl = null;
          }
          appendMessage('error', data.text, true);
          setGenerating(false);
          break;
        }
        case 'clearChat': {
          messagesEl.innerHTML = '<div id="empty-hint">发送消息开始与Token平台AI对话</div>';
          currentAssistantEl = null;
          setGenerating(false);
          break;
        }
      }
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
