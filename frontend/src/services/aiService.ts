import api from './api';

// ═══════════════════════════════════════════════════════════════════════════
//  Interfaces
// ═══════════════════════════════════════════════════════════════════════════

export interface QuickAction {
  label: string;
  path?: string;
  action?: string;
}

export interface ConfirmationCard {
  action: string;
  description: string;
  params: Record<string, unknown>;
  buttons: string[];
}

export interface DocumentClassification {
  type: string;
  label: string;
  icon: string;
  confidence: number;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  action?: { type: string; path: string } | null;
  quickActions?: QuickAction[];
  confirmationCard?: ConfirmationCard | null;
  followUp?: boolean;
  followUpParam?: string | null;
  documentResult?: {
    classification: DocumentClassification;
    extractedData: Record<string, string>;
    suggestedActions: string[];
  } | null;
}

export interface AIResponse {
  success: boolean;
  data: {
    message: string;
    suggestions: string[];
    action: { type: string; path: string } | null;
    intent: string;
    quickActions: QuickAction[];
    confirmationCard?: ConfirmationCard | null;
    followUp?: boolean;
    followUpParam?: string | null;
    toolResult?: unknown;
  };
}

export interface AISuggestions {
  success: boolean;
  data: {
    title: string;
    suggestions: string[];
    quickActions: QuickAction[];
  };
}

export interface AIDocumentResponse {
  success: boolean;
  data: {
    message: string;
    classification: DocumentClassification;
    extractedData: Record<string, string>;
    suggestedActions: string[];
    suggestions: string[];
    quickActions: QuickAction[];
  };
}

export interface AIActionHistoryItem {
  id: string;
  action: string;
  entityType: string;
  details: Record<string, unknown>;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Service
// ═══════════════════════════════════════════════════════════════════════════

export const aiService = {
  async sendMessage(message: string, currentPage: string): Promise<AIResponse> {
    const res = await api.post('/ai-assistant/message', { message, currentPage });
    return res.data;
  },

  async getSuggestions(currentPage: string): Promise<AISuggestions> {
    const res = await api.get('/ai-assistant/suggestions', { params: { currentPage } });
    return res.data;
  },

  async uploadDocument(file: File): Promise<AIDocumentResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/ai-assistant/document', formData);
    return res.data;
  },

  async getActionHistory(): Promise<{ success: boolean; data: AIActionHistoryItem[] }> {
    const res = await api.get('/ai-assistant/action-history');
    return res.data;
  },
};
