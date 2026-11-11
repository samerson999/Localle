export class CreateAssetDto {
  plate?: string | null;
  /** Código interno ou nº de série; obrigatório quando não há placa. */
  identificador?: string | null;
}
