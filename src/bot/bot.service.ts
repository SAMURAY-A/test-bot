import { Injectable, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { QuizService } from '../quiz/quiz.service';
import { sessions } from '../quiz/session';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BotService implements OnModuleInit {
  private bot: TelegramBot;

  constructor(
    private quizService: QuizService,
    private config: ConfigService,
  ) { }

  onModuleInit() {
    const token = this.config.get<string>('BOT_TOKEN');
    if (!token) {
      console.error('❌ BOT_TOKEN not found in config!');
      return;
    }

    console.log('✅ Initializing bot with token:', token.substring(0, 10) + '...');

    this.bot = new TelegramBot(token, { polling: true });

    this.bot.on('message', (msg) => this.handleMessage(msg));
    this.bot.on('polling_error', (error) => {
      console.error('❌ Polling error:', error);
    });

    console.log('✅ Bot polling started successfully.');
  }

  private async handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    console.log(`📩 Message from ${chatId}: "${text}"`);

    if (!text) return;

    let session = sessions.get(chatId);

    // Handle /start command
    if (text === '/start') {
      console.log('📌 /start command received');
      sessions.delete(chatId);
      const subjects = this.quizService.getSubjects();

      const keyboard = subjects.map((subject) => [subject]);
      keyboard.push(['➕ Yangi test qo\'shish']); // Button for /newtest

      await this.bot.sendMessage(
        chatId,
        '👋 Assalomu alaykum! Test botiga xush kelibsiz.\n\n' +
        '📚 Quyidagi fanlardan birini tanlang yoki o\'zingizni testingizni kiriting:',
        {
          reply_markup: {
            keyboard,
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        },
      );
      return;
    }

    // Handle new test command
    if (text === '/newtest' || text === '➕ Yangi test qo\'shish') {
      sessions.set(chatId, { state: 'ENTERING_CONTENT', index: 0, score: 0 });
      await this.bot.sendMessage(
        chatId,
        '📝 Iltimos, test savollarini JSON formatida yuboring.\n\n' +
        'Format misoli:\n' +
        '```json\n' +
        '[\n' +
        '  {\n' +
        '    "question": "O\'zbekiston poytaxti qaysi?",\n' +
        '    "options": ["Toshkent", "Samarqand", "Buxoro", "Xiva"],\n' +
        '    "correct": "A"\n' +
        '  }\n' +
        ']\n' +
        '```',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Handle state ENTERING_CONTENT
    if (session?.state === 'ENTERING_CONTENT') {
      const customQuestions = this.quizService.parseCustomQuestions(text);
      if (customQuestions.length > 0) {
        session.customQuestions = customQuestions;
        session.state = 'ENTERING_LIMIT';

        await this.bot.sendMessage(
          chatId,
          `✅ ${customQuestions.length} ta savol qabul qilindi!\n\n` +
          `🔢 Nechta savol yechmoqchisiz? (1 dan ${customQuestions.length} gacha son kiriting)`
        );
      } else {
        await this.bot.sendMessage(
          chatId,
          '❌ Xatolik! JSON formati noto\'g\'ri yoki savollar topilmadi. Iltimos qaytadan urinib ko\'ring.'
        );
      }
      return;
    }

    // Handle state ENTERING_LIMIT
    if (session?.state === 'ENTERING_LIMIT') {
      const limit = parseInt(text);
      const questions = session.customQuestions || this.quizService.getQuestions(session.subject!);
      const max = questions.length;

      if (isNaN(limit) || limit <= 0 || limit > max) {
        await this.bot.sendMessage(chatId, `❌ Iltimos, 1 va ${max} orasida son kiriting.`);
        return;
      }

      session.limit = limit;
      session.state = 'IDLE';
      session.index = 0;
      session.score = 0;

      // Shuffle and slice questions
      const shuffled = [...questions].sort(() => Math.random() - 0.5);
      const limitedQuestions = shuffled.slice(0, limit);

      if (session.customQuestions) {
        session.customQuestions = limitedQuestions;
      } else {
        // If it's a subject, we store the limited set in customQuestions for this session
        session.customQuestions = limitedQuestions;
      }

      await this.bot.sendMessage(
        chatId,
        `🚀 Tayyor! ${limit} ta tasodifiy savol tanlandi.\nBoshlaymizmi?`,
        {
          reply_markup: {
            keyboard: [['🚀 Boshlash']],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
      return;
    }

    if (text === '🚀 Boshlash' && session?.customQuestions) {
      await this.sendQuestion(chatId);
      return;
    }

    // Handle /score command
    if (text === '/score') {
      if (!session) {
        await this.bot.sendMessage(chatId, '⚠️ Hozirda faol test yo\'q.');
        return;
      }
      const total = session.limit || (session.customQuestions ? session.customQuestions.length : this.quizService.getTotalQuestions(session.subject!));
      await this.bot.sendMessage(
        chatId,
        `📊 Joriy natija:\n✅ To'g'ri: ${session.score}\n❌ Noto'g'ri: ${session.index - session.score}\n📝 Jami: ${session.index} / ${total}`
      );
      return;
    }

    // Check if user selected a subject
    const subjects = this.quizService.getSubjects();
    if (subjects.includes(text)) {
      const questions = this.quizService.getQuestions(text);
      sessions.set(chatId, { subject: text, index: 0, score: 0, state: 'ENTERING_LIMIT' });
      await this.bot.sendMessage(
        chatId,
        `✅ ${text} fani tanlandi!\n` +
        `📝 Jami savollar: ${questions.length}\n\n` +
        `🔢 Nechta savol yechmoqchisiz? (1 dan ${questions.length} gacha son kiriting)`
      );
      return;
    }

    // Handle answer
    if (!session || (session.index === 0 && !session.subject && !session.customQuestions)) {
      await this.bot.sendMessage(chatId, '⚠️ Avval testni boshlang. /start buyrug\'i yordamida.');
      return;
    }

    const questions = session.customQuestions || this.quizService.getQuestions(session.subject!);
    const currentQuestion = questions[session.index];

    if (!currentQuestion) return;

    const isCorrect = text.trim().toUpperCase() === currentQuestion.correct.trim().toUpperCase();

    if (isCorrect) {
      session.score++;
      await this.bot.sendMessage(chatId, '✅ To\'g\'ri!');
    } else {
      await this.bot.sendMessage(chatId, `❌ Noto'g'ri! To'g'ri javob: ${currentQuestion.correct}`);
    }

    session.index++;

    if (session.index >= questions.length) {
      const percentage = Math.round((session.score / questions.length) * 100);
      await this.bot.sendMessage(
        chatId,
        `🏁 Test tugadi!\n\n📊 Natija: ${session.score}/${questions.length} (${percentage}%)\n\nQayta boshlash uchun /start`
      );
      sessions.delete(chatId);
    } else {
      await this.sendQuestion(chatId);
    }
  }

  private async sendQuestion(chatId: number) {
    const session = sessions.get(chatId);
    if (!session) return;

    if (!session.customQuestions && !session.subject) return;

    const questions = session.customQuestions || this.quizService.getQuestions(session.subject!);
    const question = questions[session.index];

    if (!question) return;

    const keyboard = [['A', 'B'], ['C', 'D']];
    let questionText = `📝 Savol ${session.index + 1}/${questions.length}\n\n${question.question}\n\n`;

    const optionLetters = ['A', 'B', 'C', 'D'];
    question.options.forEach((opt, idx) => {
      if (idx < optionLetters.length) questionText += `${optionLetters[idx]}) ${opt}\n`;
    });

    await this.bot.sendMessage(chatId, questionText, {
      reply_markup: { keyboard, resize_keyboard: true }
    });
  }
}