import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SpiderApp {
  slug: string;
  name: string;
  description: string;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class AppRegistryService {
  private http = inject(HttpClient);

  /** Lista las apps activas del ecosistema Spider (para el launcher). */
  list(): Observable<SpiderApp[]> {
    return this.http.get<SpiderApp[]>(`${environment.apiBase}/apps`);
  }
}
