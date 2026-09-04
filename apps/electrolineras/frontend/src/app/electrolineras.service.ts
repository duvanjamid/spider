import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface Station {
  id: number; name: string; operator: string; city: string; address: string;
  lat: number; lon: number; connectors: string; speed: string;
  communityStatus: string | null; comments: number; chargers: number;
  sources?: string[]; verified?: boolean;
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
  sources?: string[]; verified?: boolean;
}
export interface Suggestion { stationId: number; stationName: string; stationCity: string; kind: string; value: string; votes: number; needed: number; detail: string | null; lastAt: string; }
export interface Comment { by: string; body: string; at: string; }
export interface Report { status: string; by: string; charger: string; at: string; }
export interface Place { name: string; lat: number; lon: number; }
export interface RouteResult { distanceKm: number; durationMin: number; coordinates: [number, number][]; via?: string; }

@Injectable({ providedIn: 'root' })
export class ElectrolinerasService {
  private http = inject(HttpClient);
  private base = environment.apiBase;
  private opts = { withCredentials: true };

  /** Lista estaciones; con bbox [minLat,minLon,maxLat,maxLon] solo las del área. */
  stations(bbox?: [number, number, number, number], limit?: number): Observable<Station[]> {
    const params: string[] = [];
    if (bbox) params.push('bbox=' + bbox.join(','));
    if (limit) params.push('limit=' + limit);
    const qs = params.length ? '?' + params.join('&') : '';
    return this.http.get<Station[]>(`${this.base}/stations${qs}`, this.opts);
  }
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
  me(): Observable<{ email: string; admin: boolean; suggestionsPending: number }> { return this.http.get<{ email: string; admin: boolean; suggestionsPending: number }>(`${this.base}/me`, this.opts); }
  // Calidad de datos
  setChargers(id: number, value: string): Observable<unknown> { return this.http.post(`${this.base}/stations/${id}/chargers/set`, { value }, this.opts); }
  verifyStation(id: number, verified: boolean): Observable<unknown> { return this.http.post(`${this.base}/stations/${id}/verify`, { verified }, this.opts); }
  suggest(id: number, kind: string, value: string, detail?: string): Observable<{ votes: number; needed: number; autoApproved: boolean }> {
    return this.http.post<{ votes: number; needed: number; autoApproved: boolean }>(`${this.base}/stations/${id}/suggest`, { kind, value, detail }, this.opts);
  }
  suggestionsPending(): Observable<Suggestion[]> { return this.http.get<Suggestion[]>(`${this.base}/suggestions`, this.opts); }
  resolveSuggestion(stationId: number, kind: string, value: string, approve: boolean): Observable<unknown> {
    return this.http.post(`${this.base}/suggestions/resolve`, { stationId, kind, value, approve }, this.opts);
  }
  clearCache(): Observable<{ cleared: number; resync: boolean }> { return this.http.post<{ cleared: number; resync: boolean }>(`${this.base}/cache/clear`, {}, this.opts); }
  meta(): Observable<any> { return this.http.get<any>(`${this.base}/meta`, this.opts); }
  geocode(q: string): Observable<Place[]> { return this.http.get<Place[]>(`${this.base}/geocode?q=${encodeURIComponent(q)}`, this.opts); }
  route(from: [number, number], to: [number, number]): Observable<RouteResult> {
    return this.http.get<RouteResult>(`${this.base}/route?from=${from[0]},${from[1]}&to=${to[0]},${to[1]}`, this.opts);
  }
  routes(from: [number, number], to: [number, number]): Observable<RouteResult[]> {
    return this.http.get<RouteResult[]>(`${this.base}/routes?from=${from[0]},${from[1]}&to=${to[0]},${to[1]}`, this.opts);
  }
}
