import { Component, OnInit, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AppRegistryService, SpiderApp } from '../core/app-registry.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NgFor, NgIf, ButtonModule, CardModule],
  styles: [`
    .wrap { max-width: 960px; margin: 0 auto; padding: 40px 20px; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
    h1 { font-size: 1.6rem; margin: 0; }
    .muted { color: var(--muted, #9aa3b2); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .grid a { text-decoration: none; }
  `],
  template: `
    <div class="wrap">
      <header>
        <div>
          <h1>🕷️ Spider</h1>
          <span class="muted">Plataforma de apps</span>
        </div>
        <p-button *ngIf="!auth.user()" label="Entrar con Google" icon="pi pi-google"
                  (onClick)="auth.loginWithGoogle()" />
        <span class="muted" *ngIf="auth.user() as u">{{ u.email }}</span>
      </header>

      <div class="grid">
        <a *ngFor="let app of apps()" [href]="'/' + app.slug + '/'">
          <p-card [header]="app.name" [subheader]="app.description">
            <ng-template pTemplate="footer">
              <p-button label="Abrir" icon="pi pi-arrow-right" [text]="true" />
            </ng-template>
          </p-card>
        </a>
      </div>

      <p class="muted" *ngIf="apps().length === 0">Cargando apps…</p>
    </div>
  `,
})
export class HomeComponent implements OnInit {
  private registry = inject(AppRegistryService);
  readonly auth = inject(AuthService);
  readonly apps = signal<SpiderApp[]>([]);

  ngOnInit(): void {
    this.auth.refresh();
    this.registry.list().subscribe({
      next: (apps) => this.apps.set(apps),
      error: () => this.apps.set([]),
    });
  }
}
