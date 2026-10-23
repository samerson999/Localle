export class InstalarRastreadorDto {
  assetId!: string;
  tecnico!: string;
  papel?: 'principal' | 'secundario' | 'can';
  instaladoEm?: string;
  kmInicial?: string;
  foto?: string;
}
