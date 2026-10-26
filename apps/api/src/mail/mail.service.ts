import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

/** Sem `SMTP_HOST`/`SMTP_FROM`, o envio fica desligado (log na tentativa, sem erro de subida). */
export function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
    from,
  };
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Envio de e-mail transacional por SMTP (convite de primeiro acesso, por ora). Nunca lança: devolve
 * `false` e loga — quem chama decide o que fazer (o convite continua válido e pode ser reenviado).
 * O conteúdo do e-mail não vai para o log (carrega o link de acesso).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private transporterKey = '';

  config(): SmtpConfig | null {
    return readSmtpConfig();
  }

  private transport(cfg: SmtpConfig): Transporter {
    const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
    if (!this.transporter || key !== this.transporterKey) {
      this.transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? '' } : undefined,
      });
      this.transporterKey = key;
    }
    return this.transporter;
  }

  async send(msg: MailMessage): Promise<boolean> {
    const cfg = this.config();
    if (!cfg) {
      this.logger.warn(`SMTP não configurado (SMTP_HOST/SMTP_FROM) — e-mail "${msg.subject}" para ${msg.to} não enviado`);
      return false;
    }
    try {
      const info = await this.transport(cfg).sendMail({ from: cfg.from, ...msg });
      this.logger.log(`e-mail "${msg.subject}" enviado para ${msg.to} (message_id=${info.messageId})`);
      return true;
    } catch (err) {
      this.logger.error(`falha ao enviar e-mail "${msg.subject}" para ${msg.to} via ${cfg.host}:${cfg.port}: ${(err as Error).message}`);
      return false;
    }
  }

  /** Para a tela de saúde: o servidor SMTP responde e aceita as credenciais? */
  async verify(): Promise<'ok' | 'fora' | 'desligado'> {
    const cfg = this.config();
    if (!cfg) return 'desligado';
    try {
      await this.transport(cfg).verify();
      return 'ok';
    } catch (err) {
      this.logger.warn(`SMTP ${cfg.host}:${cfg.port} não respondeu à verificação: ${(err as Error).message}`);
      return 'fora';
    }
  }
}
