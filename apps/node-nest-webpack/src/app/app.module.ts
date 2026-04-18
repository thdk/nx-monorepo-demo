import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ThdkNestLibAModule } from '@thdk/nest-lib-a';
@Module({
  imports: [ThdkNestLibAModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
