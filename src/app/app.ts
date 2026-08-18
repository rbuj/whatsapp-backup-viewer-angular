import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Chart, type ChartConfiguration, registerables } from 'chart.js';
import { parseChatContent } from './chat-parser';
import { calculateStats } from './chat-stats';
import { ChatMessage, ChatStats, MediaType } from './models';

Chart.register(...registerables);

type FilterMediaType = 'all' | MediaType;

interface TimelineItem {
  type: 'date' | 'message';
  dateLabel?: string;
  message?: ChatMessage;
}

interface MediaModalState {
  type: 'image' | 'video';
  url: string;
  filename: string;
}

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('participantschart') participantsChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('mediachart') mediaChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('hourlychart') hourlyChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('dailychart') dailyChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatfiles') fileInputRef?: ElementRef<HTMLInputElement>;

  readonly mediaFilters: { value: FilterMediaType; label: string }[] = [
    { value: 'all', label: 'Tot' },
    { value: 'image', label: 'Imatges' },
    { value: 'video', label: 'Vídeos' },
    { value: 'audio', label: 'Àudios' },
    { value: 'document', label: 'Documents' },
    { value: 'sticker', label: 'Adhesius' },
  ];

  readonly mediaLabels: Record<MediaType | 'text', string> = {
    text: 'Text',
    image: 'Imatge',
    video: 'Vídeo',
    audio: 'Àudio',
    document: 'Document',
    sticker: 'Adhesiu',
    contact: 'Contacte',
    gif: 'Gif',
    unknown: 'Altres',
  };

  readonly allMessages = signal<ChatMessage[]>([]);
  readonly stats = signal<ChatStats | null>(null);

  readonly selectedParticipant = signal('all');
  readonly selectedMediaFilter = signal<FilterMediaType>('all');
  readonly searchQuery = signal('');
  readonly startDate = signal('');
  readonly endDate = signal('');

  readonly loadedChatName = signal('');
  readonly loadError = signal('');
  readonly isLoading = signal(false);
  readonly mediaModal = signal<MediaModalState | null>(null);

  private readonly timelinePageSize = 180;
  readonly timelineRenderCount = signal(this.timelinePageSize);

  readonly participants = computed(() => {
    const value = this.stats();
    return value ? value.userActivity.map((item) => item.name) : [];
  });

  readonly filteredMessages = computed(() => {
    let result = [...this.allMessages()];

    const participant = this.selectedParticipant();
    if (participant !== 'all') {
      result = result.filter((message) => message.sender === participant);
    }

    const mediaFilter = this.selectedMediaFilter();
    if (mediaFilter !== 'all') {
      result = result.filter((message) => message.attachment?.mediaType === mediaFilter);
    }

    const startDate = this.startDate();
    const endDate = this.endDate();
    if (startDate || endDate) {
      const minDate = startDate && endDate && startDate > endDate ? endDate : startDate;
      const maxDate = startDate && endDate && startDate > endDate ? startDate : endDate;

      result = result.filter((message) => {
        if (minDate && message.dateStr < minDate) {
          return false;
        }
        if (maxDate && message.dateStr > maxDate) {
          return false;
        }
        return true;
      });
    }

    const normalizedQuery = this.searchQuery().trim().toLowerCase();
    if (normalizedQuery) {
      result = result.filter((message) => {
        const haystack = `${message.sender} ${message.text}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }

    return result;
  });

  readonly filteredStats = computed(() => calculateStats(this.filteredMessages()));

  readonly timelineItems = computed(() => this.buildTimeline(this.filteredMessages()));
  readonly displayedTimelineItems = computed(() => {
    const allItems = this.timelineItems();
    const start = Math.max(0, allItems.length - this.timelineRenderCount());
    return allItems.slice(start);
  });
  readonly hasMoreTimelineItems = computed(
    () => this.displayedTimelineItems().length < this.timelineItems().length,
  );

  readonly hasData = computed(() => this.stats() !== null);

  private participantsChart: Chart | null = null;
  private mediaChart: Chart | null = null;
  private hourlyChart: Chart | null = null;
  private dailyChart: Chart | null = null;
  private objectUrls: string[] = [];

  ngAfterViewInit(): void {
    this.scheduleChartRender();
  }

  ngOnDestroy(): void {
    this.destroyCharts();
    this.revokeObjectUrls();
  }

  openFilePicker(): void {
    this.fileInputRef?.nativeElement.click();
  }

  async onChatFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }

    this.loadError.set('');
    this.isLoading.set(true);

    try {
      const fileList = Array.from(files);
      const chatFile =
        fileList.find((file) => file.name.toLowerCase() === '_chat.txt') ??
        fileList.find((file) => file.name.toLowerCase().endsWith('.txt'));

      if (!chatFile) {
        throw new Error("No s'ha trobat cap fitxer de xat. Inclou _chat.txt.");
      }

      const chatText = await chatFile.text();
      const parsedMessages = parseChatContent(chatText);

      this.revokeObjectUrls();
      this.assignAttachmentUrls(parsedMessages, fileList);

      this.allMessages.set(parsedMessages);
      this.loadedChatName.set(chatFile.name);
      this.stats.set(calculateStats(parsedMessages));

      this.selectedParticipant.set('all');
      this.selectedMediaFilter.set('all');
      this.searchQuery.set('');
      this.startDate.set('');
      this.endDate.set('');
      this.resetTimelineWindow();

      this.scheduleChartRender();
    } catch (error) {
      this.loadError.set(
        error instanceof Error ? error.message : 'Error desconegut processant el xat.',
      );
      this.stats.set(null);
      this.allMessages.set([]);
    } finally {
      this.isLoading.set(false);
      input.value = '';
    }
  }

  setParticipant(participant: string): void {
    this.selectedParticipant.set(participant);
    this.resetTimelineWindow();
    this.scheduleChartRender();
  }

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
    this.resetTimelineWindow();
    this.scheduleChartRender();
  }

  setMediaFilter(filter: FilterMediaType): void {
    this.selectedMediaFilter.set(filter);
    this.resetTimelineWindow();
    this.scheduleChartRender();
  }

  setStartDate(value: string): void {
    this.startDate.set(value);
    this.resetTimelineWindow();
    this.scheduleChartRender();
  }

  setEndDate(value: string): void {
    this.endDate.set(value);
    this.resetTimelineWindow();
    this.scheduleChartRender();
  }

  onConversationScroll(event: Event): void {
    const container = event.target as HTMLElement;
    if (!container || !this.hasMoreTimelineItems()) {
      return;
    }

    if (container.scrollTop < 120) {
      const previousHeight = container.scrollHeight;
      const previousTop = container.scrollTop;

      this.timelineRenderCount.update((count) => count + this.timelinePageSize);

      setTimeout(() => {
        const newHeight = container.scrollHeight;
        container.scrollTop = previousTop + (newHeight - previousHeight);
      }, 0);
    }
  }

  trackByMessageId(index: number, item: TimelineItem): number | string {
    if (item.type === 'date') {
      return `date-${item.dateLabel}-${index}`;
    }
    return item.message?.id ?? Math.random();
  }

  asMessage(item: TimelineItem): ChatMessage {
    return item.message as ChatMessage;
  }

  formatDateLabel(dateStr: string): string {
    const parsed = new Date(`${dateStr}T00:00:00`);
    return parsed.toLocaleDateString('ca-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  getAttachmentLabel(mediaType: MediaType): string {
    return this.mediaLabels[mediaType] ?? 'Adjunt';
  }

  totalMedia(stats: ChatStats | null): number {
    if (!stats) {
      return 0;
    }

    return Object.entries(stats.mediaStats)
      .filter(([type]) => type !== 'text')
      .reduce((sum, [, count]) => sum + count, 0);
  }

  shouldHideAttachmentFilename(attachment: NonNullable<ChatMessage['attachment']>): boolean {
    if (!attachment.objectUrl) {
      return false;
    }

    return ['image', 'video', 'audio'].includes(attachment.mediaType);
  }

  openMediaModal(type: 'image' | 'video', url: string, filename: string): void {
    this.mediaModal.set({ type, url, filename });
  }

  closeMediaModal(): void {
    this.mediaModal.set(null);
  }

  private resetTimelineWindow(): void {
    this.timelineRenderCount.set(this.timelinePageSize);
  }

  private scheduleChartRender(): void {
    setTimeout(() => {
      if (!this.hasData()) {
        this.destroyCharts();
        return;
      }

      this.renderCharts(this.filteredStats());
    }, 0);
  }

  private assignAttachmentUrls(messages: ChatMessage[], files: File[]): void {
    const attachmentsByName = new Map<string, File>();

    for (const file of files) {
      attachmentsByName.set(file.name, file);
    }

    for (const message of messages) {
      if (!message.attachment) {
        continue;
      }

      const attachmentFile = attachmentsByName.get(message.attachment.filename);
      if (attachmentFile) {
        const objectUrl = URL.createObjectURL(attachmentFile);
        message.attachment.objectUrl = objectUrl;
        this.objectUrls.push(objectUrl);
      }
    }
  }

  private buildTimeline(messages: ChatMessage[]): TimelineItem[] {
    const items: TimelineItem[] = [];
    let currentDate = '';

    for (const message of messages) {
      if (message.dateStr !== currentDate) {
        currentDate = message.dateStr;
        items.push({ type: 'date', dateLabel: currentDate });
      }
      items.push({ type: 'message', message });
    }

    return items;
  }

  private renderCharts(stats: ChatStats): void {
    this.renderParticipantsChart(stats);
    this.renderMediaChart(stats);
    this.renderHourlyChart(stats);
    this.renderDailyChart(stats);
  }

  private renderParticipantsChart(stats: ChatStats): void {
    const canvas = this.participantsChartRef?.nativeElement;
    if (!canvas) {
      return;
    }

    this.participantsChart?.destroy();

    const topUsers = stats.userActivity.slice(0, 10);
    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: topUsers.map((item) => item.name),
        datasets: [
          {
            label: 'Missatges',
            data: topUsers.map((item) => item.count),
            backgroundColor: 'rgba(25, 118, 210, 0.7)',
            borderRadius: 8,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
      },
    };

    this.participantsChart = new Chart(canvas, config);
  }

  private renderMediaChart(stats: ChatStats): void {
    const canvas = this.mediaChartRef?.nativeElement;
    if (!canvas) {
      return;
    }

    this.mediaChart?.destroy();

    const entries = Object.entries(stats.mediaStats)
      .filter(([key, value]) => key !== 'text' && value > 0)
      .map(([key, value]) => ({ key, value }));

    const config: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels: entries.map((entry) => this.mediaLabels[entry.key as MediaType]),
        datasets: [
          {
            data: entries.map((entry) => entry.value),
            backgroundColor: ['#ff7043', '#42a5f5', '#26a69a', '#ef5350', '#8d6e63', '#5c6bc0'],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      },
    };

    this.mediaChart = new Chart(canvas, config);
  }

  private renderHourlyChart(stats: ChatStats): void {
    const canvas = this.hourlyChartRef?.nativeElement;
    if (!canvas) {
      return;
    }

    this.hourlyChart?.destroy();

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: Array.from({ length: 24 }, (_, hour) => `${hour}h`),
        datasets: [
          {
            label: 'Missatges',
            data: stats.hourlyActivity,
            borderColor: '#2e7d32',
            backgroundColor: 'rgba(46, 125, 50, 0.12)',
            fill: true,
            pointRadius: 2,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
      },
    };

    this.hourlyChart = new Chart(canvas, config);
  }

  private renderDailyChart(stats: ChatStats): void {
    const canvas = this.dailyChartRef?.nativeElement;
    if (!canvas) {
      return;
    }

    this.dailyChart?.destroy();

    const sortedDates = Object.keys(stats.dailyActivity).sort();
    const dailyCounts = sortedDates.map((date) => stats.dailyActivity[date]);

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: sortedDates,
        datasets: [
          {
            label: 'Missatges',
            data: dailyCounts,
            borderColor: '#f57c00',
            backgroundColor: 'rgba(245, 124, 0, 0.12)',
            fill: true,
            pointRadius: 2,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
      },
    };

    this.dailyChart = new Chart(canvas, config);
  }

  private destroyCharts(): void {
    this.participantsChart?.destroy();
    this.mediaChart?.destroy();
    this.hourlyChart?.destroy();
    this.dailyChart?.destroy();
    this.participantsChart = null;
    this.mediaChart = null;
    this.hourlyChart = null;
    this.dailyChart = null;
  }

  private revokeObjectUrls(): void {
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls = [];
  }
}
