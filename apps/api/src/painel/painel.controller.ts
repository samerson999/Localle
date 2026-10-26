import { Controller, Get, UseGuards } from '@nestjs/common';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { PainelService } from './painel.service';

@Controller('superadmin')
@UseGuards(SuperadminGuard)
export class PainelController {
  constructor(private readonly painel: PainelService) {}

  @Get('visao-geral')
  visaoGeral() {
    return this.painel.visaoGeral();
  }

  @Get('saude')
  saude() {
    return this.painel.saude();
  }
}
