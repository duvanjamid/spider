import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SpiderApp {
  slug: string;
  name: string;
  description: string;
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

  // ── Solo admin ──
  allApps(): Observable<SpiderApp[]> {
    return this.http.get<SpiderApp[]>(`${this.base}/admin/apps`, this.opts);
  }

  grants(): Observable<Grant[]> {
    return this.http.get<Grant[]>(`${this.base}/admin/grants`, this.opts);
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
