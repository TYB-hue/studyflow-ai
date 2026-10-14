export type StudyDocument = {
  id: string;
  title: string;
  subject: string;
  status: 'processing' | 'ready' | 'failed';
  created_at: string;
  summary: string | null;
  error: string | null;
  storage_path?: string;
  mime_type?: string;
  processing_started_at?: string;
};
export type Source = { label: string; content: string; page: number; similarity?: number };
export type Question = { question: string; options: string[]; answer: number; explanation: string };
export type Flashcard = { front: string; back: string };
export type StudyResult = {
  scopeNote?: string;
  summary?: string;
  questions?: Question[];
  cards?: Flashcard[];
};
