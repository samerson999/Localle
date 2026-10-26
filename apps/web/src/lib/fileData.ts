// Lê um arquivo do navegador como data URL (anexos, fotos). Fica no front: depende de File/FileReader, que
// não existem no Node — não pode morar em packages/shared, que a API também carrega.
export const fileToDataURL = (file: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
