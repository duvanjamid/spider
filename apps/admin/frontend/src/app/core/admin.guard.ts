import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { Me } from './auth.service';

/** Permite la ruta solo si el usuario actual es admin; si no, redirige a "/". */
export const adminGuard: CanActivateFn = () => {
  const http = inject(HttpClient);
  const router = inject(Router);
  return http.get<Me>(`${environment.apiBase}/auth/me`, { withCredentials: true }).pipe(
    map((u) => (u.admin ? true : router.parseUrl('/'))),
    catchError(() => of(router.parseUrl('/'))),
  );
};
