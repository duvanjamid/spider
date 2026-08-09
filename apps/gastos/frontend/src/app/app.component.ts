import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CardModule } from 'primeng/card';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CardModule],
  template: `
    <div style="max-width:720px;margin:0 auto;padding:48px 20px">
      <p-card header="🕷️ gastos" subheader="App generada por el scaffolding de Spider">
        <p>Backend health: <code>{{ health() }}</code></p>
      </p-card>
    </div>`,
})
export class AppComponent implements OnInit {
  private http = inject(HttpClient);
  readonly health = signal('…');
  ngOnInit(): void {
    this.http.get<{ status: string }>(`${environment.apiBase}/health`).subscribe({
      next: (r) => this.health.set(r.status),
      error: () => this.health.set('sin conexión'),
    });
  }
}
