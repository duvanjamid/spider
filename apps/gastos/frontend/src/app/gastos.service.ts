import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface Category { slug: string; name: string; color: string; icon: string; }
export interface Expense {
  id: number; amount: number; currency: string; merchant: string; description: string;
  spentOn: string; source: string; categorySlug: string; categoryName: string; categoryColor: string;
}
export interface CatTotal { slug: string; name: string; color: string; total: number; }
export interface Summary { month: string; total: number; byCategory: CatTotal[]; }
export interface TrendPoint { month: string; total: number; }
export interface Trend { series: TrendPoint[]; forecastNext: number; average: number; }
export interface Scan {
  amount: number | null; currency: string; merchant: string;
  spentOn: string | null; categorySlug: string; description: string;
}
export interface NewExpense {
  amount: number; currency?: string; categorySlug?: string;
  merchant?: string; description?: string; spentOn?: string; source?: string;
}

@Injectable({ providedIn: 'root' })
export class GastosService {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  categories(): Observable<Category[]> { return this.http.get<Category[]>(`${this.base}/categories`); }
  expenses(month: string): Observable<Expense[]> { return this.http.get<Expense[]>(`${this.base}/expenses?month=${month}`); }
  create(e: NewExpense): Observable<{ id: number }> { return this.http.post<{ id: number }>(`${this.base}/expenses`, e); }
  remove(id: number): Observable<unknown> { return this.http.delete(`${this.base}/expenses/${id}`); }
  summary(month: string): Observable<Summary> { return this.http.get<Summary>(`${this.base}/summary?month=${month}`); }
  trend(months = 6): Observable<Trend> { return this.http.get<Trend>(`${this.base}/trend?months=${months}`); }
  aiStatus(): Observable<{ enabled: boolean }> { return this.http.get<{ enabled: boolean }>(`${this.base}/ai-status`); }
  scan(image: string, mediaType: string): Observable<Scan> {
    return this.http.post<Scan>(`${this.base}/scan`, { image, mediaType });
  }
}
