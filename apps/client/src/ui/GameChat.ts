import Phaser from 'phaser';
import {
  CHAT_MAX_LENGTH,
  QUICK_CHAT_PHRASES,
  chatChannelLabel,
  type ChatChannel,
  type ChatMessagePayload,
} from '@tanktrouble/shared';

const MAX_LOG_LINES = 10;

export type GameChatOptions = {
  teamMode: boolean;
  onSend: (text: string, channel: ChatChannel) => void;
};

export class GameChat {
  private readonly scene: Phaser.Scene;
  private teamMode: boolean;
  private readonly onSend: (text: string, channel: ChatChannel) => void;
  private channel: ChatChannel = 'all';
  private panelOpen = false;
  private root: HTMLDivElement | null = null;
  private logEl: HTMLDivElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private channelBtn: HTMLButtonElement | null = null;
  private hintEl: HTMLDivElement | null = null;
  private boundResize = () => this.layout();
  private boundKeyDown = (e: KeyboardEvent) => this.onGlobalKeyDown(e);

  constructor(scene: Phaser.Scene, opts: GameChatOptions) {
    this.scene = scene;
    this.teamMode = opts.teamMode;
    this.onSend = opts.onSend;
    this.buildDom();
    window.addEventListener('resize', this.boundResize);
    window.addEventListener('keydown', this.boundKeyDown, true);
    this.layout();
    this.appendSystem('按 Enter 或 T 打开聊天');
  }

  isInputActive(): boolean {
    return this.panelOpen && document.activeElement === this.inputEl;
  }

  isPanelOpen(): boolean {
    return this.panelOpen;
  }

  setTeamMode(teamMode: boolean): void {
    this.teamMode = teamMode;
    if (!teamMode) this.channel = 'all';
    this.refreshChannelUi();
  }

  receive(msg: ChatMessagePayload): void {
    const ch = chatChannelLabel(msg.channel, this.teamMode);
    const teamTint = this.teamMode && msg.channel === 'team' ? (msg.team === 0 ? '#ef9a9a' : '#90caf9') : '#cfd8dc';
    this.appendLine(`[${ch}] ${msg.fromLabel}: ${msg.text}`, teamTint);
  }

  destroy(): void {
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('keydown', this.boundKeyDown, true);
    this.root?.remove();
    this.root = null;
    this.logEl = null;
    this.inputEl = null;
    this.channelBtn = null;
    this.hintEl = null;
  }

  private buildDom(): void {
    const root = document.createElement('div');
    root.id = 'game-chat-root';
    root.style.cssText = [
      'position:fixed',
      'z-index:1000',
      'pointer-events:auto',
      'font-family:"Segoe UI","Microsoft YaHei",sans-serif',
      'font-size:13px',
      'color:#eceff1',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:rgba(15,20,28,0.88)',
      'border:1px solid rgba(255,255,255,0.12)',
      'border-radius:8px',
      'box-shadow:0 4px 20px rgba(0,0,0,0.35)',
      'overflow:hidden',
      'display:flex',
      'flex-direction:column',
    ].join(';');

    const log = document.createElement('div');
    log.style.cssText = [
      'padding:8px 10px',
      'min-height:96px',
      'max-height:140px',
      'overflow-y:auto',
      'line-height:1.45',
      'word-break:break-word',
    ].join(';');

    const hint = document.createElement('div');
    hint.style.cssText = 'padding:0 10px 6px;color:#78909c;font-size:11px;';
    hint.textContent = 'Enter / T 聊天 · Esc 关闭';

    const composer = document.createElement('div');
    composer.style.cssText = [
      'display:none',
      'flex-direction:column',
      'gap:6px',
      'padding:8px 10px 10px',
      'border-top:1px solid rgba(255,255,255,0.08)',
      'background:rgba(0,0,0,0.2)',
    ].join(';');
    composer.dataset.role = 'composer';

    const quickRow = document.createElement('div');
    quickRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
    for (const phrase of QUICK_CHAT_PHRASES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = phrase;
      btn.style.cssText = [
        'border:none',
        'border-radius:4px',
        'padding:3px 8px',
        'font-size:11px',
        'cursor:pointer',
        'background:#37474f',
        'color:#eceff1',
      ].join(';');
      btn.onmouseenter = () => {
        btn.style.background = '#455a64';
      };
      btn.onmouseleave = () => {
        btn.style.background = '#37474f';
      };
      btn.onclick = () => this.sendText(phrase);
      quickRow.appendChild(btn);
    }

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:6px;align-items:center;';

    const channelBtn = document.createElement('button');
    channelBtn.type = 'button';
    channelBtn.style.cssText = [
      'border:none',
      'border-radius:4px',
      'padding:6px 10px',
      'font-size:12px',
      'cursor:pointer',
      'background:#5e35b1',
      'color:#fff',
      'white-space:nowrap',
      'display:none',
    ].join(';');
    channelBtn.onclick = () => this.toggleChannel();
    this.channelBtn = channelBtn;

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = CHAT_MAX_LENGTH;
    input.placeholder = '输入消息…';
    input.style.cssText = [
      'flex:1',
      'border:1px solid rgba(255,255,255,0.15)',
      'border-radius:4px',
      'padding:6px 8px',
      'font-size:13px',
      'background:rgba(0,0,0,0.35)',
      'color:#fff',
      'outline:none',
    ].join(';');
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.sendFromInput();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closePanel();
      } else if (e.key === 'Tab' && this.teamMode) {
        e.preventDefault();
        this.toggleChannel();
      }
    };
    this.inputEl = input;

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = '发送';
    sendBtn.style.cssText = [
      'border:none',
      'border-radius:4px',
      'padding:6px 12px',
      'font-size:12px',
      'cursor:pointer',
      'background:#2f6fed',
      'color:#fff',
    ].join(';');
    sendBtn.onclick = () => this.sendFromInput();

    inputRow.append(channelBtn, input, sendBtn);
    composer.append(quickRow, inputRow);

    panel.append(log, hint, composer);
    root.append(panel);
    document.body.append(root);

    this.root = root;
    this.logEl = log;
    this.hintEl = hint;
    this.refreshChannelUi();
  }

  private layout(): void {
    if (!this.root) return;
    const canvas = this.scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const w = Math.min(360, Math.max(260, rect.width * 0.28));
    this.root.style.left = `${rect.left + 12}px`;
    this.root.style.top = `${rect.bottom - 220}px`;
    this.root.style.width = `${w}px`;
  }

  private onGlobalKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    const inOtherInput = tag === 'INPUT' || tag === 'TEXTAREA';
    if (inOtherInput && e.target !== this.inputEl) return;

    if (this.isInputActive()) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closePanel();
      }
      return;
    }

    if (e.key === 'Enter' || e.key === 't' || e.key === 'T') {
      e.preventDefault();
      e.stopPropagation();
      this.openPanel();
    }
  }

  private openPanel(): void {
    if (!this.root) return;
    this.panelOpen = true;
    const composer = this.root.querySelector('[data-role="composer"]') as HTMLElement | null;
    if (composer) composer.style.display = 'flex';
    if (this.hintEl) {
      this.hintEl.textContent = this.teamMode
        ? 'Tab 切换全员/阵营 · Enter 发送 · Esc 关闭'
        : 'Enter 发送 · Esc 关闭';
    }
    this.refreshChannelUi();
    this.layout();
    window.setTimeout(() => this.inputEl?.focus(), 0);
  }

  private closePanel(): void {
    if (!this.root) return;
    this.panelOpen = false;
    const composer = this.root.querySelector('[data-role="composer"]') as HTMLElement | null;
    if (composer) composer.style.display = 'none';
    if (this.inputEl) this.inputEl.value = '';
    this.inputEl?.blur();
    if (this.hintEl) this.hintEl.textContent = 'Enter / T 聊天 · Esc 关闭';
  }

  private toggleChannel(): void {
    if (!this.teamMode) return;
    this.channel = this.channel === 'all' ? 'team' : 'all';
    this.refreshChannelUi();
  }

  private refreshChannelUi(): void {
    if (!this.channelBtn) return;
    if (this.teamMode) {
      this.channelBtn.style.display = 'block';
      this.channelBtn.textContent = chatChannelLabel(this.channel, true);
      this.channelBtn.style.background = this.channel === 'team' ? '#00838f' : '#5e35b1';
    } else {
      this.channelBtn.style.display = 'none';
      this.channel = 'all';
    }
    if (this.inputEl) {
      this.inputEl.placeholder =
        this.teamMode && this.channel === 'team' ? '阵营消息…' : '全员消息…';
    }
  }

  private sendFromInput(): void {
    if (!this.inputEl) return;
    const text = this.inputEl.value;
    if (!this.sendText(text)) return;
    this.inputEl.value = '';
    this.inputEl.focus();
  }

  private sendText(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    this.onSend(trimmed, this.teamMode ? this.channel : 'all');
    return true;
  }

  private appendSystem(text: string): void {
    this.appendLine(text, '#78909c');
  }

  private appendLine(text: string, color = '#eceff1'): void {
    if (!this.logEl) return;
    const line = document.createElement('div');
    line.textContent = text;
    line.style.color = color;
    line.style.marginBottom = '2px';
    this.logEl.appendChild(line);
    while (this.logEl.childElementCount > MAX_LOG_LINES) {
      this.logEl.firstChild?.remove();
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
}
