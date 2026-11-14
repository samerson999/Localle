export class InstalarRastreadorDto {
  assetId!: string;
  tecnico!: string;
  papel?: 'principal' | 'backup' | 'can';
  instaladoEm?: string;
  kmInicial?: string;
  foto?: string;
}
