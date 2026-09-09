import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Guardia de sesión en el cliente: si CUALQUIER llamada a la API responde 401
 * (sesión ausente o expirada), la plataforma exige volver a iniciar sesión.
 * Redirige al login del admin. Sin sesión válida no se permite ninguna
 * funcionalidad (coincide con el AuthGuard del backend).
 *
 * Se ignora el propio logout (ya redirige por su cuenta) para no competir.
 */
let redirecting = false;

export const authInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !redirecting
          && !req.url.includes('/auth/logout')) {
        redirecting = true;
        // Sesión inválida: fuera de la app hasta reautenticarse.
        window.location.href = '/admin/';
      }
      return throwError(() => err);
    }),
  );
