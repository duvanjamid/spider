import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface Station {
  id: number; name: string; operator: string; city: string; address: string;
  lat: number; lon: number; connectors: string; speed: string;
  communityStatus: string | null; comments: number; chargers: number;
}
export interface Charger {
  id: number; label: string; connectorType: string; powerKw: number | null;
  status: string | null; statusAt: string | null;
}
export interface StationFull {
  id: number; name: string; operator: string; city: string; address: string;
  lat: number; lon: number; connectors: string; speed: string; hours: string;
  website: string | null; source: string; updatedAt: string;
  communityStatus: string | null; communityStatusAt?: string; chargers: Charger[];
}
export interface Comment { by: string; body: string; at: string; }
export interface Report { status: string; by: string; charger: string; at: string; }

@Injectable({ providedIn: 'root' })
export class ElectrolinerasService {
  private http = inject(HttpClient);
  private base = environment.apiBase;
  private opts = { withCredentials: true };

  stations(): Observable<Station[]> { return this.http.get<Station[]>(`${this.base}/stations`, this.opts); }
  station(id: number): Observable<StationFull> { return this.http.get<StationFull>(`${this.base}/stations/${id}`, this.opts); }
  comments(id: number): Observable<Comment[]> { return this.http.get<Comment[]>(`${this.base}/stations/${id}/comments`, this.opts); }
  addComment(id: number, body: string): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/stations/${id}/comments`, { body }, this.opts);
  }
  report(id: number, chargerId: number | null, status: string): Observable<unknown> {
    return this.http.post(`${this.base}/stations/${id}/report`, { chargerId, status }, this.opts);
  }
  reports(id: number): Observable<Report[]> { return this.http.get<Report[]>(`${this.base}/stations/${id}/reports`, this.opts); }
  health(): Observable<{ env: string }> { return this.http.get<{ env: string }>(`${this.base}/health`, this.opts); }
}
