import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

import { QuizQuestion } from './session';

@Injectable()
export class QuizService {
  private quizData: Record<string, QuizQuestion[]> = {};

  constructor() {
    this.loadQuizData();
  }

  private loadQuizData() {
    try {
      const quizPath = path.join(process.cwd(), 'quiz.json');
      console.log('📂 Loading quiz data from:', quizPath);

      const rawData = JSON.parse(fs.readFileSync(quizPath, 'utf-8'));

      // Transform the data structure
      for (const [subject, questions] of Object.entries(rawData)) {
        console.log(`📚 Processing subject: ${subject}`);

        const validQuestions: QuizQuestion[] = [];

        (questions as any[]).forEach((q, index) => {
          try {
            // Skip metadata/header rows (first few entries that don't have proper questions)
            if (!q.question || !q.options || typeof q.options !== 'object') {
              console.log(`⚠️ Skipping invalid question at index ${index}`);
              return;
            }

            // Extract options from the object format {A: "...", B: "...", C: "...", D: "..."}
            const optionsObj = q.options || {};
            const optionsArray: string[] = [];

            // Get options in order A, B, C, D
            ['A', 'B', 'C', 'D'].forEach(letter => {
              const option = optionsObj[letter];
              if (option && typeof option === 'string' && option.trim()) {
                optionsArray.push(option.trim());
              }
            });

            // Skip if we don't have at least 2 valid options
            if (optionsArray.length < 2) {
              console.log(`⚠️ Skipping question ${index} - insufficient options`);
              return;
            }

            // Skip metadata entries (those with generic text like "TEST MATERIALLARI", "№", etc.)
            const questionText = q.question.trim();
            if (questionText.length < 10 ||
              questionText.includes('TEST MATERIALLARI') ||
              questionText === '№' ||
              questionText === 'Savol' ||
              questionText === 'To`g`ri javob') {
              console.log(`⚠️ Skipping metadata entry at index ${index}`);
              return;
            }

            const transformedQuestion: QuizQuestion = {
              id: validQuestions.length + 1, // Re-index based on valid questions
              question: questionText,
              options: optionsArray,
              correct: (q.correct || 'A').trim().toUpperCase(),
            };

            validQuestions.push(transformedQuestion);
          } catch (err) {
            console.error(`❌ Error processing question ${index}:`, err);
          }
        });

        this.quizData[subject] = validQuestions;
        console.log(`✅ Loaded ${validQuestions.length} valid questions for ${subject}`);
      }

      console.log('✅ Quiz data loaded successfully');
      console.log('📊 Subjects:', Object.keys(this.quizData));
      console.log('📊 Total questions:', Object.values(this.quizData).reduce((sum, q) => sum + q.length, 0));
    } catch (error) {
      console.error('❌ Error loading quiz data:', error);
      this.quizData = {};
    }
  }

  getSubjects(): string[] {
    return Object.keys(this.quizData);
  }

  getQuestions(subject: string): QuizQuestion[] {
    return this.quizData[subject] || [];
  }

  getTotalQuestions(subject: string): number {
    return this.getQuestions(subject).length;
  }

  parseCustomQuestions(text: string): QuizQuestion[] {
    try {
      // Try parsing as JSON first
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data.map((q, i) => ({
          id: i + 1,
          question: q.question || q.Savol || 'No question',
          options: Array.isArray(q.options) ? q.options :
            (typeof q.options === 'object' ? Object.values(q.options) : []),
          correct: (q.correct || q.To_gri_javob || 'A').toString().toUpperCase()
        }));
      }
    } catch (e) {
      // If not JSON, try simple line-based parsing or wait for user to provide JSON
      console.log('Not valid JSON, attempting simple parse');
    }
    return [];
  }
}