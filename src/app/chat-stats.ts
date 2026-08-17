import { ChatMessage, ChatStats, MediaStats } from './models';

function emptyMediaStats(): MediaStats {
  return {
    text: 0,
    image: 0,
    video: 0,
    audio: 0,
    document: 0,
    sticker: 0,
    contact: 0,
    gif: 0,
    unknown: 0
  };
}

export function calculateStats(messages: ChatMessage[]): ChatStats {
  const userActivity: Record<string, number> = {};
  const mediaStats = emptyMediaStats();
  const hourlyActivity = Array<number>(24).fill(0);
  const dailyActivity: Record<string, number> = {};

  let totalMessages = 0;

  for (const msg of messages) {
    if (msg.isSystem) {
      continue;
    }

    totalMessages += 1;
    userActivity[msg.sender] = (userActivity[msg.sender] ?? 0) + 1;

    if (msg.attachment) {
      const mediaType = msg.attachment.mediaType;
      mediaStats[mediaType] = (mediaStats[mediaType] ?? 0) + 1;
    } else {
      mediaStats.text += 1;
    }

    const hour = msg.timestamp.hour;
    if (hour >= 0 && hour < 24) {
      hourlyActivity[hour] += 1;
    }

    dailyActivity[msg.dateStr] = (dailyActivity[msg.dateStr] ?? 0) + 1;
  }

  const sortedUserActivity = Object.entries(userActivity)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalMessages,
    userActivity: sortedUserActivity,
    mediaStats,
    hourlyActivity,
    dailyActivity
  };
}
