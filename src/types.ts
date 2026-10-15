export interface DealItem {
  id: string;
  title: string;
  descriptionHtml?: string;
  originalLink: string;
  affiliateUrl: string;
  asin: string | null;
  isAmazon: boolean;
  newPrice: number | null;
  oldPrice: number | null;
  discountPercent: number | null;
  imageUrl: string | null;
  pubDate: string;
  alreadySent: boolean;
  merchant?: string;
  category?: string;
}

export interface SentDealRecord {
  id: string;
  asin?: string | null;
  title: string;
  oldPrice?: number | null;
  newPrice?: number | null;
  discountPercent?: number | null;
  affiliateUrl: string;
  originalUrl?: string;
  imageUrl?: string | null;
  publishedAt: string;
  telegramMessageId?: number | null;
  dispatchType: 'manual' | 'radar_1click' | 'autopilot';
}

export interface AutopilotLog {
  time: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

export interface AutopilotState {
  active: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  nextRun: string | null;
  totalAutoPublished: number;
  logs: AutopilotLog[];
}

export interface SystemStatus {
  amazonTag: string;
  telegram: {
    botTokenConfigured: boolean;
    chatId: string;
    status: string;
    channel: {
      title?: string;
      username: string;
      type?: string;
    };
  };
  autopilot: {
    active: boolean;
    intervalMinutes: number;
  };
  stats: {
    totalSentDeals: number;
    uniqueIdsRecorded: number;
  };
}

export interface QuickPublishFormState {
  title: string;
  oldPrice: string;
  newPrice: string;
  url: string;
  imageUrl: string;
}
