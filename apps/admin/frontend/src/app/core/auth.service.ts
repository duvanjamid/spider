import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface CurrentUser {
  id: number;
  email: string;
  displayName: string;
  pictureUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly user = signal<CurrentUser | null>(null);

  /** Redirige al flujo de login con Google (lo maneja el backend). */
  loginWithGoogle(): void {
    window.location.href = `${environment.apiBase}/auth/google/login`;
  }

  /** Carga el usuario actual (cookie de sesión). */
  refresh(): void {
    this.http
      .get<CurrentUser>(`${environment.apiBase}/auth/me`, { withCredentials: true })
      .subscribe({
        next: (u) => this.user.set(u),
        error: () => this.user.set(null),
      });
  }

  logout(): void {
    this.http
      .post(`${environment.apiBase}/auth/logout`, {}, { withCredentials: true })
      .subscribe(() => this.user.set(null));
  }
}
