import { AttachmentInfo, ChatMessage, MediaType } from './models';

const HEADER_REGEX =
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2}):(\d{2})\]\s*([^:]+):\s*(.*)$/;

const ATTACHMENT_REGEX = /<(?:adjunt|attached|archivo adjunto):\s*([^>]+)>/i;

function getMediaType(filename: string): MediaType {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';

  if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
    return filename.toLowerCase().includes('-gif-') ? 'gif' : 'video';
  }
  if (['.opus', '.ogg', '.mp3', '.m4a', '.wav', '.aac'].includes(ext)) return 'audio';
  if (['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.txt', '.zip'].includes(ext)) return 'document';
  if (ext === '.vcf') return 'contact';
  if (ext === '.webp') return 'sticker';
  return 'unknown';
}

function cleanLine(line: string): string {
  return line.replace(/[\u200e\u200f]/g, '');
}

export function parseChatContent(content: string): ChatMessage[] {
  const lines = content.split(/\r?\n/);
  const messages: ChatMessage[] = [];
  let currentMessage: ChatMessage | null = null;
  let groupAdminName: string | null = null;

  const groupCreationPattern =
    /ha creat el grup|created the group|ha creado el grupo|has created this group/i;

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    const match = line.match(HEADER_REGEX);

    if (match) {
      if (currentMessage) {
        messages.push(currentMessage);
      }

      const day = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10);
      let year = Number.parseInt(match[3], 10);
      if (year < 100) year += 2000;

      const hour = Number.parseInt(match[4], 10);
      const minute = Number.parseInt(match[5], 10);
      const second = Number.parseInt(match[6], 10);

      const senderRaw = match[7].trim();
      const sender = senderRaw.replace(/^~\s*/, '').trim();
      const rawText = match[8];

      const attachmentMatch = rawText.match(ATTACHMENT_REGEX);
      let attachment: AttachmentInfo | null = null;
      let text = rawText;

      if (attachmentMatch) {
        const filename = attachmentMatch[1].trim();
        const ext = filename.includes('.')
          ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
          : '';
        attachment = {
          filename,
          mediaType: getMediaType(filename),
          ext,
        };
        text = rawText.replace(ATTACHMENT_REGEX, '').trim();
      }

      let isSystem = false;

      if (!groupAdminName && groupCreationPattern.test(text)) {
        groupAdminName = sender; // guardem el nom real del creador
        isSystem = true; // marquem com a missatge de sistema
      } else {
        const systemPatterns = [
          groupCreationPattern,
          /t'ha afegit|te ha agregado|added you/i,
          /ha afegit|ha agregado|added/i,
          /ha canviat la icona|changed the group icon|ha cambiado el icono/i,
          /ha sortit|left|salio del grupo/i,
          /t'ha eliminat|te ha eliminado|removed you/i,
          /ha eliminat|ha eliminado|removed/i,
        ];
        if (systemPatterns.some((pattern) => pattern.test(text))) {
          isSystem = true;
        }
      }

      currentMessage = {
        id: messages.length,
        timestamp: { day, month, year, hour, minute, second },
        dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        sender,
        text,
        attachment,
        isSystem,
        adminName: groupAdminName,
      };
      continue;
    }

    if (currentMessage) {
      currentMessage.text = `${currentMessage.text}\n${line}`;
    }
  }

  if (currentMessage) {
    messages.push(currentMessage);
  }

  return messages;
}
