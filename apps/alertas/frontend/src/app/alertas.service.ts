import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface Category {
  slug: string; label: string; icon: string; color: string;
  radiusKm: number; severity: number; ttlHours: number;
}

export interface Alert {
  id: number; by: string; category: string; label: string; icon: string; color: string;
  severity: number; lat: number; lon: number; radiusKm: number;
  status: string; official: boolean; confirms: number; denies: number;
  createdAt: string; expiresAt: string; hasPhoto: boolean; distanceKm?: number;
  // solo en detalle:
  description?: string | null; photo?: string | null;
  myVote?: string | null; iAmSafe?: boolean; safeCount?: number;
}

export interface Me {
  pseudonym: string; score: number; level: string;
  reports: number; confirmed: number; denied: number;
}

@Injectable({ providedIn: 'root' })
export class AlertasService {
  private http = inject(HttpClient);
  private base = environment.apiBase;
  private opts = { withCredentials: true };

  categories(): Observable<Category[]> { return this.http.get<Category[]>(`${this.base}/categories`, this.opts); }
  me(): Observable<Me> { return this.http.get<Me>(`${this.base}/me`, this.opts); }
  myAlerts(): Observable<Alert[]> { return this.http.get<Alert[]>(`${this.base}/me/alerts`, this.opts); }

  nearby(lat: number, lon: number, km = 60): Observable<Alert[]> {
    return this.http.get<Alert[]>(`${this.base}/alerts?lat=${lat}&lon=${lon}&km=${km}`, this.opts);
  }
  alert(id: number): Observable<Alert> { return this.http.get<Alert>(`${this.base}/alerts/${id}`, this.opts); }

  create(body: { category: string; description?: string; photo?: string; lat: number; lon: number; }): Observable<Alert> {
    return this.http.post<Alert>(`${this.base}/alerts`, body, this.opts);
  }
  vote(id: number, vote: 'confirm' | 'deny', lat: number, lon: number): Observable<Alert> {
    return this.http.post<Alert>(`${this.base}/alerts/${id}/vote`, { vote, lat, lon }, this.opts);
  }
  safe(id: number, lat: number, lon: number): Observable<Alert> {
    return this.http.post<Alert>(`${this.base}/alerts/${id}/safe`, { lat, lon }, this.opts);
  }
  resolve(id: number): Observable<Alert> {
    return this.http.post<Alert>(`${this.base}/alerts/${id}/resolve`, {}, this.opts);
  }
  health(): Observable<{ env: string }> { return this.http.get<{ env: string }>(`${this.base}/health`, this.opts); }
}
