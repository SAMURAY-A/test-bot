export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct: string;
  correctOptions?: number[];
}

export const sessions = new Map<
  number,
  {
    subject?: string;
    index: number;
    score: number;
    state?: 'IDLE' | 'ENTERING_CONTENT' | 'ENTERING_LIMIT';
    customQuestions?: QuizQuestion[];
    limit?: number;
    lastPollId?: string;
  }
>();
