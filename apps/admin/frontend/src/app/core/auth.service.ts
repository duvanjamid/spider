import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Me {
  email: string;
  admin: boolean;
  name?: string;
  picture?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  /** Usuario actual (null = no autenticado). */
  readonly user = signal<Me | null>(null);
  /** true cuando ya se resolvió el primer /auth/me. */
  readonly ready = signal(false);

  /** Carga el usuario actual desde la cookie de sesión. */
  refresh(): void {
    this.http.get<Me>(`${this.base}/auth/me`, { withCredentials: true }).subscribe({
      next: (u) => { this.user.set(u); this.ready.set(true); },
      error: () => { this.user.set(null); this.ready.set(true); },
    });
  }

  /** Inicia el login con Google. */
  loginWithGoogle(): void {
    window.location.href = `${this.base}/auth/google/login`;
  }

  logout(): void {
    this.http.post(`${this.base}/auth/logout`, {}, { withCredentials: true }).subscribe(() =>
      this.user.set(null),
    );
  }
}
