import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vapidConfig } from './vapid';

/**
 * Regressão (09/11/2026): VAPID_SUBJECT sem "mailto:"/"https://" derrubava a API inteira na subida
 * (web-push lança dentro do worker, não aqui) — vapidConfig() agora recusa antes, caindo para "inativo".
 */
describe('vapidConfig', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = 'chave-publica-teste';
    process.env.VAPID_PRIVATE_KEY = 'chave-privada-teste';
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('sem as chaves: inativo (null)', () => {
    delete process.env.VAPID_PUBLIC_KEY;
    expect(vapidConfig()).toBeNull();
  });

  it('subject ausente: usa o padrão (mailto:)', () => {
    delete process.env.VAPID_SUBJECT;
    expect(vapidConfig()).toMatchObject({ subject: 'mailto:suporte@localle.com.br' });
  });

  it('subject só com o e-mail, sem "mailto:": inativo, não lança', () => {
    process.env.VAPID_SUBJECT = 'samersonrps@gmail.com';
    expect(vapidConfig()).toBeNull();
  });

  it('subject com "mailto:" ou "https://": válido', () => {
    process.env.VAPID_SUBJECT = 'mailto:samersonrps@gmail.com';
    expect(vapidConfig()).toMatchObject({ subject: 'mailto:samersonrps@gmail.com' });
    process.env.VAPID_SUBJECT = 'https://localle.com.br';
    expect(vapidConfig()).toMatchObject({ subject: 'https://localle.com.br' });
  });
});
