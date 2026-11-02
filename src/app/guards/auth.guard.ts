import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  while (!auth.authReady()) {
    await new Promise(r => setTimeout(r, 50));
  }

  return auth.isAuthenticated() ? true : router.createUrlTree(['/login']);
};
