/**
 * Lista pública de aparelhos do Traccar (https://www.traccar.org/devices/, decisão de 04/11/2026): a API do Traccar não
 * tem catálogo de modelos — só protocolos —, e essa página é onde o próprio Traccar diz qual modelo fala qual protocolo
 * em qual porta. Cada linha da tabela é `<td>nome</td><td>protocolo</td><td>porta</td>` (o nome pode trazer selo em
 * HTML, ex.: "RECOMMENDED"). Linha que não tem essa forma é ignorada, não adivinhada.
 */
export interface AparelhoTraccar {
  nome: string;
  protocolo: string;
  porta: number;
}

export const URL_LISTA_TRACCAR = 'https://www.traccar.org/devices/';

/** Abaixo disso a página mudou de formato (hoje são ~2.200 linhas): melhor manter a lista anterior. */
export const MINIMO_ESPERADO = 500;

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const texto = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTIDADES[e])
    .replace(/\s+/g, ' ')
    .trim();

export function lerListaTraccar(html: string): AparelhoTraccar[] {
  const vistos = new Set<string>();
  const out: AparelhoTraccar[] = [];
  for (const [, linha] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const celulas = [...linha.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (celulas.length !== 3) continue;
    // o selo ("RECOMMENDED") vem num elemento próprio dentro da célula do nome
    const nome = texto(celulas[0].replace(/<(span|div|small|b)[^>]*class="[^"]*(badge|label)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '')).replace(/\s*RECOMMENDED$/i, '');
    const protocolo = texto(celulas[1]);
    const porta = Number(texto(celulas[2]));
    if (!nome || nome.length > 120 || !/^[a-z0-9]{2,30}$/.test(protocolo) || !Number.isInteger(porta) || porta < 1 || porta > 65535) continue;
    const chave = `${nome.toLowerCase()}|${protocolo}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ nome, protocolo, porta });
  }
  return out;
}

/**
 * Nome do Traccar → fabricante + modelo do catálogo, cortando no primeiro espaço ("Jimi IoT JM-VL01" → "Jimi" +
 * "IoT JM-VL01"): a tela junta os dois de volta, então o nome exibido é exatamente o do Traccar. Nome de uma palavra só
 * ("ATL200") repete nos dois campos, e a tela mostra uma vez.
 */
export function separarNome(nome: string): { fabricante: string; nome: string } {
  const i = nome.indexOf(' ');
  return i < 0 ? { fabricante: nome, nome } : { fabricante: nome.slice(0, i), nome: nome.slice(i + 1) };
}
