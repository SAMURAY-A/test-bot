import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { QuizService } from '../quiz/quiz.service';

@Module({
  providers: [BotService, QuizService],
})
export class BotModule {}
