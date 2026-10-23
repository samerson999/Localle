export class CreateTeamUserDto {
  email!: string;
  password!: string;
  /** Nunca "admin" — o Admin inicial só nasce pelo superadmin (ver src/superadmin/). */
  role!: 'gestor' | 'operador';
}
