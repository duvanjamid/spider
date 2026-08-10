import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface Category { id: number; slug: string; name: string; color: string; icon: string; }
export interface Expense {
  id: number; amount: number; currency: string; merchant: string; description: string; nit: string;
  spentOn: string; registeredAt: string; source: string;
  categorySlug: string; categoryName: string; categoryColor: string;
}
export interface CatTotal { slug: string; name: string; color: string; total: number; }
export interface Summary { month: string; total: number; byCategory: CatTotal[]; }
export interface TrendPoint { month: string; total: number; }
export interface Trend { series: TrendPoint[]; forecastNext: number; average: number; }

export interface Monto { etiqueta: string; valor: number; }
export interface Scan {
  identificado: boolean;
  nit: string | null;
  establecimiento: string | null;
  montos: Monto[];
  descripcion: string | null;
  categoriaId: number | null;
  categoriaNombre: string | null;
  categoriaSugerida: string | null;
}
export interface NewExpense {
  amount: number; currency?: string; categoryId?: number | null;
  merchant?: string; description?: string; spentOn?: string; nit?: string; source?: string;
}

@Injectable({ providedIn: 'root' })
export class GastosService {
  private http = inject(HttpClient);
  private base = environment.apiBase;
  private opts = { withCredentials: true };

  categories(): Observable<Category[]> { return this.http.get<Category[]>(`${this.base}/categories`, this.opts); }
  expenses(month: string): Observable<Expense[]> { return this.http.get<Expense[]>(`${this.base}/expenses?month=${month}`, this.opts); }
  create(e: NewExpense): Observable<{ id: number }> { return this.http.post<{ id: number }>(`${this.base}/expenses`, e, this.opts); }
  remove(id: number): Observable<unknown> { return this.http.delete(`${this.base}/expenses/${id}`, this.opts); }
  summary(month: string): Observable<Summary> { return this.http.get<Summary>(`${this.base}/summary?month=${month}`, this.opts); }
  trend(months = 6): Observable<Trend> { return this.http.get<Trend>(`${this.base}/trend?months=${months}`, this.opts); }
  aiStatus(): Observable<{ enabled: boolean }> { return this.http.get<{ enabled: boolean }>(`${this.base}/ai-status`, this.opts); }
  scan(image: string, mediaType: string): Observable<Scan> {
    return this.http.post<Scan>(`${this.base}/scan`, { image, mediaType }, this.opts);
  }
}
