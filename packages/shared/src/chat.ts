export type ChatChannel = 'all' | 'team';

export const CHAT_MAX_LENGTH = 80;

/** Preset quick-chat lines shown in the in-game panel. */
export const QUICK_CHAT_PHRASES = [
  '加油！',
  '小心身后！',
  '干得漂亮！',
  '等等我',
  '进攻！',
  '撤退',
  '有埋伏',
  '需要支援',
  '掩护我',
  'GG',
] as const;

export type ChatMessagePayload = {
  fromId: string;
  fromLabel: string;
  team: number;
  channel: ChatChannel;
  text: string;
  at: number;
};

export function sanitizeChatText(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}

export function formatChatSenderLabel(opts: {
  colorIndex: number;
  team: number;
  teamMode: boolean;
  self?: boolean;
  playerId?: string;
}): string {
  if (opts.self) return '你';
  if (opts.playerId === 'p1') return 'P1';
  if (opts.playerId === 'p2') return 'P2';
  if (opts.teamMode) {
    const n = (opts.colorIndex % 4) + 1;
    return opts.team === 0 ? `红${n}` : `蓝${n}`;
  }
  return `P${opts.colorIndex + 1}`;
}

export function chatChannelLabel(channel: ChatChannel, teamMode: boolean): string {
  if (!teamMode) return '全员';
  return channel === 'team' ? '阵营' : '全员';
}
