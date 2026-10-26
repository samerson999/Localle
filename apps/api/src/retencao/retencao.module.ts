import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { RetencaoRepository } from './retencao.repository';
import { RetencaoService } from './retencao.service';

@Module({
  imports: [SettingsModule],
  providers: [RetencaoRepository, RetencaoService],
})
export class RetencaoModule {}
