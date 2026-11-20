/**
 * Origem liberada no CORS. O front chama a API pela mesma origem (`/api-localle`, proxy do nginx em produção e do
 * Vite em dev), então nenhuma chamada do produto depende de CORS; liberar só a `APP_URL` fecha a API para páginas de
 * outras origens. Sem `APP_URL`, nenhuma origem cruzada é aceita.
 */
export function corsOrigin(appUrl: string | undefined): string | false {
  const origem = (appUrl || '').trim().replace(/\/+$/, '');
  if (!origem) return false;
  try {
    return new URL(origem).origin;
  } catch {
    return false;
  }
}
