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
export interface CatTotal { slug: string; name: string; color: string; total: number; budget: number; }
export interface Budget { categoryId: number; slug: string; name: string; color: string; amount: number; }
export interface Recurring {
  id: number; amount: number; currency: string; merchant: string; description: string;
  dayOfMonth: number; active: boolean; categoryId: number | null; categoryName: string; categoryColor: string;
}
export interface Summary {
  month: string; total: number; byCategory: CatTotal[];
  count: number; daysInMonth: number; daysElapsed: number;
  dailyAverage: number; projectedEndOfMonth: number; previousMonthTotal: number;
}
export interface TrendPoint { month: string; total: number; }
export interface Trend { series: TrendPoint[]; forecastNext: number; average: number; }

export interface Monto { etiqueta: string; valor: number; }
export interface Region { campo: string; etiqueta: string; box: number[]; }
export interface Scan {
  identificado: boolean;
  nit: string | null;
  establecimiento: string | null;
  montos: Monto[];
  descripcion: string | null;
  fecha: string | null;
  categoriaId: number | null;
  categoriaNombre: string | null;
  categoriaSugerida: string | null;
  regiones: Region[];
}
export interface Me { email: string; guest: boolean; onboarded: boolean; }
export interface CategoryTemplate { slug: string; name: string; color: string; icon: string; }
export interface NewExpense {
  amount: number; currency?: string; categoryId?: number | null;
  merchant?: string; description?: string; spentOn?: string; nit?: string; source?: string;
}

@Injectable({ providedIn: 'root' })
export class GastosService {
  private http = inject(HttpClient);
  private base = environment.apiBase;
  private opts = { withCredentials: true };

  me(): Observable<Me> { return this.http.get<Me>(`${this.base}/me`, this.opts); }
  categoryTemplates(): Observable<CategoryTemplate[]> {
    return this.http.get<CategoryTemplate[]>(`${this.base}/category-templates`, this.opts);
  }
  onboarding(slugs: string[]): Observable<{ count: number }> {
    return this.http.post<{ count: number }>(`${this.base}/onboarding`, { slugs }, this.opts);
  }
  categories(): Observable<Category[]> { return this.http.get<Category[]>(`${this.base}/categories`, this.opts); }
  createCategory(name: string, color: string, icon: string): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/categories`, { name, color, icon }, this.opts);
  }
  updateCategory(id: number, body: { name?: string; color?: string; icon?: string }): Observable<unknown> {
    return this.http.put(`${this.base}/categories/${id}`, body, this.opts);
  }
  deleteCategory(id: number): Observable<unknown> { return this.http.delete(`${this.base}/categories/${id}`, this.opts); }

  budgets(): Observable<Budget[]> { return this.http.get<Budget[]>(`${this.base}/budgets`, this.opts); }
  setBudget(categoryId: number, amount: number): Observable<unknown> {
    return this.http.put(`${this.base}/budgets`, { categoryId, amount }, this.opts);
  }
  recurring(): Observable<Recurring[]> { return this.http.get<Recurring[]>(`${this.base}/recurring`, this.opts); }
  createRecurring(body: Partial<Recurring>): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/recurring`, body, this.opts);
  }
  deleteRecurring(id: number): Observable<unknown> { return this.http.delete(`${this.base}/recurring/${id}`, this.opts); }
  applyRecurring(month: string): Observable<{ created: number }> {
    return this.http.post<{ created: number }>(`${this.base}/recurring/apply?month=${month}`, {}, this.opts);
  }
  expenses(month: string): Observable<Expense[]> { return this.http.get<Expense[]>(`${this.base}/expenses?month=${month}`, this.opts); }
  create(e: NewExpense): Observable<{ id: number }> { return this.http.post<{ id: number }>(`${this.base}/expenses`, e, this.opts); }
  remove(id: number): Observable<unknown> { return this.http.delete(`${this.base}/expenses/${id}`, this.opts); }
  summary(month: string): Observable<Summary> { return this.http.get<Summary>(`${this.base}/summary?month=${month}`, this.opts); }
  trend(months = 6): Observable<Trend> { return this.http.get<Trend>(`${this.base}/trend?months=${months}`, this.opts); }
  aiStatus(): Observable<{ enabled: boolean }> { return this.http.get<{ enabled: boolean }>(`${this.base}/ai-status`, this.opts); }
  scan(image: string, mediaType: string): Observable<Scan> {
    return this.http.post<Scan>(`${this.base}/scan`, { image, mediaType }, this.opts);
  }
  scanText(text: string): Observable<Scan> {
    return this.http.post<Scan>(`${this.base}/scan-text`, { text }, this.opts);
  }
  health(): Observable<{ env: string }> { return this.http.get<{ env: string }>(`${this.base}/health`, this.opts); }
}
