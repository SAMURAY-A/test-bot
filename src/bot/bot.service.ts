import { Injectable, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { QuizService } from '../quiz/quiz.service';
import { sessions } from '../quiz/session';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BotService implements OnModuleInit {
  private bot: TelegramBot;
  private pollToChat = new Map<string, number>();

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
    this.bot.on('poll_answer', (answer) => this.handlePollAnswer(answer));
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
      console.log('📋 Available subjects:', subjects);

      const keyboard = subjects.map((subject) => [subject.replace(/_/g, ' ')]);
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

    // NEW: Check if user selected a subject (moved up to prioritize over state handling)
    const subjects = this.quizService.getSubjects();
    const selectedSubject = subjects.find(s => s === text || s.replace(/_/g, ' ') === text);

    if (selectedSubject) {
      console.log(`🎯 Subject selected: "${selectedSubject}"`);
      const questions = this.quizService.getQuestions(selectedSubject);
      sessions.set(chatId, { subject: selectedSubject, index: 0, score: 0, state: 'ENTERING_LIMIT' });
      await this.bot.sendMessage(
        chatId,
        `✅ ${selectedSubject.replace(/_/g, ' ')} fani tanlandi!\n` +
        `📝 Jami savollar: ${questions.length}\n\n` +
        `🔢 Nechta savol yechmoqchisiz? (1 dan ${questions.length} gacha son kiriting)`
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

    // (Subject selection logic was moved up)
  }

  private async handlePollAnswer(answer: TelegramBot.PollAnswer) {
    const pollId = answer.poll_id;
    const chatId = this.pollToChat.get(pollId);
    if (!chatId) return;

    const session = sessions.get(chatId);
    if (!session || session.lastPollId !== pollId) return;

    const questions = session.customQuestions || this.quizService.getQuestions(session.subject!);
    const currentQuestion = questions[session.index];
    if (!currentQuestion) return;

    // Check answer
    const userOptions = answer.option_ids;
    const correctOptions = currentQuestion.correctOptions || [];

    // For quiz mode, single answer. For regular mode, multiple.
    const isCorrect = userOptions.length === correctOptions.length &&
      userOptions.every(val => correctOptions.includes(val));

    if (isCorrect) {
      session.score++;
    }

    // Clean up mapping
    this.pollToChat.delete(pollId);

    session.index++;

    if (session.index >= questions.length) {
      const percentage = Math.round((session.score / questions.length) * 100);
      await this.bot.sendMessage(
        chatId,
        `🏁 Test tugadi!\n\n📊 Natija: ${session.score}/${questions.length} (${percentage}%)\n\nQayta boshlash uchun /start`
      );
      sessions.delete(chatId);
    } else {
      // Delay slightly for user to see the result of the poll if it was a quiz
      setTimeout(() => this.sendQuestion(chatId), 1500);
    }
  }

  private async sendQuestion(chatId: number) {
    const session = sessions.get(chatId);
    if (!session) return;

    if (!session.customQuestions && !session.subject) return;

    const questions = session.customQuestions || this.quizService.getQuestions(session.subject!);
    const question = questions[session.index];

    if (!question) return;

    const isMultiple = (question.correctOptions?.length || 0) > 1;

    try {
      const poll = await this.bot.sendPoll(
        chatId,
        `Savol ${session.index + 1}/${questions.length}:\n${question.question}`,
        question.options,
        {
          type: isMultiple ? 'regular' : 'quiz',
          allows_multiple_answers: isMultiple,
          correct_option_id: isMultiple ? undefined : question.correctOptions?.[0],
          is_anonymous: false,
        }
      );

      session.lastPollId = poll.poll.id;
      this.pollToChat.set(poll.poll.id, chatId);
    } catch (error) {
      console.error('❌ Error sending poll:', error);
      await this.bot.sendMessage(chatId, '❌ Savolni yuborishda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    }
  }
}