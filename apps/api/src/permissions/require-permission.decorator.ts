import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission_key';

/** Usar sempre junto de `@UseGuards(AuthGuard, PermissionsGuard)`, nessa ordem. */
export const RequirePermission = (key: string) => SetMetadata(PERMISSION_KEY, key);
