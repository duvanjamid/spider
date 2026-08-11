import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SpiderApp {
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  active?: boolean;
}

export interface AdminUser {
  email: string;
  displayName: string;
  apps: string[];
  appCount: number;
  superAdmin: boolean;
  lastLoginAt: string | null;
}

export interface HealthInfo {
  status: string;
  app: string;
  schema: string;
  env: string;
}

export interface Grant {
  email: string;
  app: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private http = inject(HttpClient);
  private base = environment.apiBase;
  private opts = { withCredentials: true };

  /** Apps habilitadas para el usuario actual. */
  myApps(): Observable<SpiderApp[]> {
    return this.http.get<SpiderApp[]>(`${this.base}/me/apps`, this.opts);
  }

  /** Info del backend (entorno test/prod, etc.). */
  health(): Observable<HealthInfo> {
    return this.http.get<HealthInfo>(`${this.base}/health`, this.opts);
  }

  // ── Solo admin ──
  allApps(): Observable<SpiderApp[]> {
    return this.http.get<SpiderApp[]>(`${this.base}/admin/apps`, this.opts);
  }

  grants(): Observable<Grant[]> {
    return this.http.get<Grant[]>(`${this.base}/admin/grants`, this.opts);
  }

  /** Todas las apps (incl. inactivas) con su estado. */
  allAppsAdmin(): Observable<SpiderApp[]> {
    return this.http.get<SpiderApp[]>(`${this.base}/admin/apps-all`, this.opts);
  }
  setAppActive(slug: string, active: boolean): Observable<unknown> {
    return this.http.post(`${this.base}/admin/apps/active?slug=${encodeURIComponent(slug)}&active=${active}`, {}, this.opts);
  }
  users(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${this.base}/admin/users`, this.opts);
  }
  userApps(email: string): Observable<SpiderApp[]> {
    return this.http.get<SpiderApp[]>(`${this.base}/admin/users/apps?email=${encodeURIComponent(email)}`, this.opts);
  }
  appUsers(slug: string): Observable<{ email: string; role: string }[]> {
    return this.http.get<{ email: string; role: string }[]>(`${this.base}/admin/apps/users?slug=${encodeURIComponent(slug)}`, this.opts);
  }
  removeUser(email: string): Observable<unknown> {
    return this.http.post(`${this.base}/admin/users/revoke-all?email=${encodeURIComponent(email)}`, {}, this.opts);
  }

  grant(email: string, app: string, role: string): Observable<unknown> {
    const q = `email=${encodeURIComponent(email)}&app=${encodeURIComponent(app)}&role=${encodeURIComponent(role)}`;
    return this.http.post(`${this.base}/admin/grant?${q}`, {}, this.opts);
  }

  revoke(email: string, app: string): Observable<unknown> {
    const q = `email=${encodeURIComponent(email)}&app=${encodeURIComponent(app)}`;
    return this.http.post(`${this.base}/admin/revoke?${q}`, {}, this.opts);
  }
}
