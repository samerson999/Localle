import { describe, expect, it } from 'vitest';
import { validarEndpointPush } from './endpoint-push';

describe('validarEndpointPush — allowlist de host (achado do security-review: SSRF via endpoint arbitrário)', () => {
  it('aceita os serviços reais de push de navegador', () => {
    expect(validarEndpointPush('https://fcm.googleapis.com/fcm/send/abc')).toBeNull();
    expect(validarEndpointPush('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBeNull();
    expect(validarEndpointPush('https://wns2-abc123.notify.windows.com/w/?token=abc')).toBeNull();
    expect(validarEndpointPush('https://web.push.apple.com/abc')).toBeNull();
  });

  it('recusa host arbitrário, mesmo https — é o caminho do SSRF corrigido', () => {
    expect(validarEndpointPush('https://postgres.internal:5432/')).not.toBeNull();
    expect(validarEndpointPush('https://attacker.example.com/')).not.toBeNull();
    expect(validarEndpointPush('https://evil-fcm.googleapis.com.attacker.example.com/')).not.toBeNull();
  });

  it('recusa protocolo não-https e URL malformada', () => {
    expect(validarEndpointPush('http://fcm.googleapis.com/fcm/send/abc')).not.toBeNull();
    expect(validarEndpointPush('not a url')).not.toBeNull();
  });
});
