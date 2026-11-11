// Lê um arquivo do navegador como data URL (anexos, fotos). Fica no front: depende de File/FileReader, que
// não existem no Node — não pode morar em packages/shared, que a API também carrega.
export const fileToDataURL = (file: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });

/**
 * Foto do avatar: recorta o centro em quadrado e reduz para 256 px em JPEG — ~20 KB, bem abaixo do teto da API
 * (avatar.ts, 90.000 caracteres). Fundo branco sob PNG transparente (JPEG não tem transparência).
 */
export async function fotoAvatar(file: File, lado = 256): Promise<string> {
  const img = new Image();
  const src = URL.createObjectURL(file);
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Não foi possível abrir esta imagem.')); img.src = src; });
    const m = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, lado, lado);
    ctx.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, lado, lado);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(src); }
}
