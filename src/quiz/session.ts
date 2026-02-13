export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct: string;
}

export const sessions = new Map<
  number,
  { 
    subject?: string; 
    index: number; 
    score: number;
    state?: 'IDLE' | 'ENTERING_CONTENT';
    customQuestions?: QuizQuestion[];
  }
>();
