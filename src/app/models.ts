export type MediaType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'contact'
  | 'sticker'
  | 'gif'
  | 'unknown';

export interface TimestampParts {
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
}

export interface AttachmentInfo {
  filename: string;
  mediaType: MediaType;
  ext: string;
  objectUrl?: string;
}

export interface ChatMessage {
  id: number;
  timestamp: TimestampParts;
  dateStr: string;
  timeStr: string;
  sender: string;
  text: string;
  attachment: AttachmentInfo | null;
  isSystem: boolean;
  adminName: string | null;
}

export interface UserActivity {
  name: string;
  count: number;
}

export type MediaStats = Record<MediaType | 'text', number>;

export interface ChatStats {
  totalMessages: number;
  userActivity: UserActivity[];
  mediaStats: MediaStats;
  hourlyActivity: number[];
  dailyActivity: Record<string, number>;
}
