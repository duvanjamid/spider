import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TabViewModule } from 'primeng/tabview';
import { TagModule } from 'primeng/tag';
import { AdminUser, Grant, PlatformService, SpiderApp } from '../core/platform.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, RouterLink, ButtonModule, DialogModule, InputTextModule, TableModule, TabViewModule, TagModule],
  styles: [`
    .shell { max-width: 1120px; margin: 0 auto; padding: 0 16px 64px; }
    .bar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px; padding: 14px 4px;
           background: color-mix(in srgb, var(--bg) 86%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.12rem; }
    .spacer { flex: 1; } .muted { color: var(--muted); }
    h2 { margin: 22px 4px 4px; font-size: 1.5rem; letter-spacing: -.5px; }
    .sub { margin: 0 4px 16px; color: var(--muted); }

    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 8px; }
    @media (max-width: 760px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
    .kpi { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 16px; box-shadow: var(--shadow); }
    .kpi .lbl { font-size: .78rem; color: var(--muted); display: flex; align-items: center; gap: 6px; }
    .kpi .val { font-size: 1.7rem; font-weight: 800; margin-top: 6px; }

    .app-row { display: flex; align-items: center; gap: 14px; padding: 12px 4px; border-bottom: 1px solid var(--border); }
    .app-row .ic { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; font-size: 1.2rem; flex: none; }
    .app-row .grow { flex: 1; min-width: 0; } .app-row .grow .nm { font-weight: 700; }
    .app-row .grow .ds { color: var(--muted); font-size: .84rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .app-row.off { opacity: .55; }

    .form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 6px 0 16px; }
    .inp, .sel { padding: 9px 11px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel-2); color: var(--fg); }
    .link { color: var(--accent); cursor: pointer; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
            background: var(--panel-2); border: 1px solid var(--border); font-size: .84rem; }
    .msg { margin: 8px 0; }
  `],
  template: `
    <div class="shell">
      <div class="bar">
        <a routerLink="/"><p-button icon="fa-solid fa-arrow-left" [text]="true" aria-label="Volver" /></a>
        <div class="brand"><i class="fa-solid fa-gauge-high" style="color:var(--accent)"></i> Administración</div>
        <span class="spacer"></span>
        <a routerLink="/"><p-button label="Ir a mis apps" icon="fa-solid fa-table-cells-large" [text]="true" size="small" /></a>
      </div>

      <h2>Panel de administración</h2>
      <p class="sub">Gestiona aplicaciones, usuarios y accesos de la plataforma.</p>

      <div class="kpis">
        <div class="kpi"><div class="lbl"><i class="fa-solid fa-cubes"></i> Aplicaciones</div><div class="val">{{ apps().length }}</div></div>
        <div class="kpi"><div class="lbl"><i class="fa-solid fa-toggle-on"></i> Activas</div><div class="val">{{ activeCount() }}</div></div>
        <div class="kpi"><div class="lbl"><i class="fa-solid fa-users"></i> Usuarios</div><div class="val">{{ users().length }}</div></div>
        <div class="kpi"><div class="lbl"><i class="fa-solid fa-key"></i> Accesos</div><div class="val">{{ grants().length }}</div></div>
      </div>

      <p-tabView>
        <!-- APLICACIONES -->
        <p-tabPanel header="Aplicaciones" leftIcon="fa-solid fa-cubes">
          <ng-template pTemplate="content">
            <div class="app-row" *ngFor="let a of apps()" [class.off]="!a.active">
              <span class="ic" [style.background]="tint(a.color)" [style.color]="a.color"><i [class]="a.icon"></i></span>
              <div class="grow">
                <div class="nm">{{ a.name }} <span class="muted" style="font-weight:400">/{{ a.slug }}</span></div>
                <div class="ds">{{ a.description || '—' }}</div>
              </div>
              <p-tag [value]="a.active ? 'activa' : 'inactiva'" [severity]="a.active ? 'success' : 'secondary'" />
              <p-button [label]="usersOfApp(a.slug)" icon="fa-solid fa-users" [text]="true" size="small" (onClick)="showAppUsers(a)" />
              <p-button [label]="a.active ? 'Desactivar' : 'Activar'" [icon]="a.active ? 'fa-solid fa-ban' : 'fa-solid fa-check'"
                        [severity]="a.active ? 'danger' : 'success'" [outlined]="true" size="small" (onClick)="toggleApp(a)" />
            </div>
            <p class="muted" *ngIf="!apps().length">No hay aplicaciones registradas.</p>
          </ng-template>
        </p-tabPanel>

        <!-- USUARIOS -->
        <p-tabPanel header="Usuarios" leftIcon="fa-solid fa-users">
          <ng-template pTemplate="content">
            <p-table [value]="users()" [rows]="15" [paginator]="users().length > 15" styleClass="p-datatable-sm">
              <ng-template pTemplate="header">
                <tr><th>Correo</th><th>Nombre</th><th>Apps</th><th>Rol</th><th>Último acceso</th><th></th></tr>
              </ng-template>
              <ng-template pTemplate="body" let-u>
                <tr>
                  <td>{{ u.email }}</td>
                  <td class="muted">{{ u.displayName || '—' }}</td>
                  <td><span class="link" (click)="showUserApps(u)">{{ u.appCount }} app(s)</span></td>
                  <td><p-tag *ngIf="u.superAdmin" value="super-admin" severity="warn" /><span *ngIf="!u.superAdmin" class="muted">usuario</span></td>
                  <td class="muted">{{ u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'nunca' }}</td>
                  <td style="text-align:right"><p-button icon="fa-solid fa-user-xmark" severity="danger" [text]="true" size="small" (onClick)="removeUser(u)" /></td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="muted">Sin usuarios todavía.</td></tr></ng-template>
            </p-table>
          </ng-template>
        </p-tabPanel>

        <!-- ACCESOS -->
        <p-tabPanel header="Accesos" leftIcon="fa-solid fa-key">
          <ng-template pTemplate="content">
            <div class="form">
              <input class="inp" type="email" placeholder="correo@gmail.com" [(ngModel)]="grantEmail" style="flex:1;min-width:180px" />
              <select class="sel" [(ngModel)]="grantApp">
                <option value="" disabled>App…</option>
                <option *ngFor="let a of activeApps()" [value]="a.slug">{{ a.name }}</option>
              </select>
              <select class="sel" [(ngModel)]="grantRole"><option value="USER">USER</option><option value="ADMIN">ADMIN</option></select>
              <p-button label="Conceder acceso" icon="fa-solid fa-plus" (onClick)="doGrant()" [disabled]="!grantEmail || !grantApp" />
            </div>
            <div class="msg muted" *ngIf="msg()">{{ msg() }}</div>
            <p-table [value]="grants()" [rows]="15" [paginator]="grants().length > 15" styleClass="p-datatable-sm">
              <ng-template pTemplate="header"><tr><th>Correo</th><th>App</th><th>Rol</th><th></th></tr></ng-template>
              <ng-template pTemplate="body" let-g>
                <tr>
                  <td>{{ g.email }}</td><td>{{ g.app }}</td>
                  <td><p-tag [value]="g.role" [severity]="g.role === 'ADMIN' ? 'warn' : 'info'" /></td>
                  <td style="text-align:right"><p-button icon="fa-solid fa-trash" severity="danger" [text]="true" size="small" (onClick)="doRevoke(g)" /></td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage"><tr><td colspan="4" class="muted">Sin accesos concedidos.</td></tr></ng-template>
            </p-table>
          </ng-template>
        </p-tabPanel>
      </p-tabView>
    </div>

    <!-- Usuarios de una app -->
    <p-dialog [(visible)]="appUsersDialog" [modal]="true" [header]="'Usuarios con acceso a ' + (selApp()?.name || '')" [style]="{ width: '92%', maxWidth: '440px' }">
      <div class="chips" *ngIf="appUsers().length; else noAU">
        <span class="chip" *ngFor="let u of appUsers()"><i class="fa-solid fa-user muted"></i> {{ u.email }} <p-tag [value]="u.role" [severity]="u.role === 'ADMIN' ? 'warn' : 'info'" /></span>
      </div>
      <ng-template #noAU><p class="muted">Nadie tiene acceso a esta app todavía.</p></ng-template>
    </p-dialog>

    <!-- Apps de un usuario -->
    <p-dialog [(visible)]="userAppsDialog" [modal]="true" [header]="'Apps de ' + (selUser()?.email || '')" [style]="{ width: '92%', maxWidth: '440px' }">
      <p class="muted" *ngIf="selUser()?.superAdmin" style="margin-top:0"><i class="fa-solid fa-crown"></i> Súper-admin: ve todas las aplicaciones.</p>
      <div class="chips" *ngIf="userApps().length; else noUA">
        <span class="chip" *ngFor="let a of userApps()"><i [class]="a.icon" [style.color]="a.color"></i> {{ a.name }}</span>
      </div>
      <ng-template #noUA><p class="muted">Sin apps concedidas.</p></ng-template>
      <ng-template pTemplate="footer">
        <p-button label="Quitar todos los accesos" icon="fa-solid fa-user-xmark" severity="danger" [text]="true"
                  (onClick)="removeUser(selUser()!); userAppsDialog = false" *ngIf="selUser() && !selUser()!.superAdmin" />
        <p-button label="Cerrar" (onClick)="userAppsDialog = false" />
      </ng-template>
    </p-dialog>
  `,
})
export class DashboardComponent implements OnInit {
  private platform = inject(PlatformService);

  readonly apps = signal<SpiderApp[]>([]);
  readonly users = signal<AdminUser[]>([]);
  readonly grants = signal<Grant[]>([]);
  readonly msg = signal('');

  grantEmail = ''; grantApp = ''; grantRole = 'USER';

  appUsersDialog = false;
  userAppsDialog = false;
  readonly selApp = signal<SpiderApp | null>(null);
  readonly selUser = signal<AdminUser | null>(null);
  readonly appUsers = signal<{ email: string; role: string }[]>([]);
  readonly userApps = signal<SpiderApp[]>([]);

  readonly activeApps = computed(() => this.apps().filter((a) => a.active));
  readonly activeCount = computed(() => this.activeApps().length);

  ngOnInit(): void { this.reloadApps(); this.reloadUsers(); this.reloadGrants(); }

  private reloadApps(): void { this.platform.allAppsAdmin().subscribe({ next: (a) => this.apps.set(a), error: () => {} }); }
  private reloadUsers(): void { this.platform.users().subscribe({ next: (u) => this.users.set(u), error: () => {} }); }
  private reloadGrants(): void { this.platform.grants().subscribe({ next: (g) => this.grants.set(g), error: () => {} }); }

  tint(color: string): string { return `linear-gradient(135deg, ${color}26, ${color}0d)`; }
  usersOfApp(slug: string): string {
    const n = this.grants().filter((g) => g.app === slug).length;
    return `${n} usuario(s)`;
  }
  fmtDate(s: string): string {
    const d = new Date(s.replace(' ', 'T'));
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('es-CO', { dateStyle: 'medium' });
  }

  toggleApp(a: SpiderApp): void {
    this.platform.setAppActive(a.slug, !a.active).subscribe({
      next: () => this.reloadApps(),
      error: () => this.msg.set('No se pudo cambiar el estado.'),
    });
  }

  showAppUsers(a: SpiderApp): void {
    this.selApp.set(a); this.appUsers.set([]); this.appUsersDialog = true;
    this.platform.appUsers(a.slug).subscribe({ next: (u) => this.appUsers.set(u), error: () => {} });
  }
  showUserApps(u: AdminUser): void {
    this.selUser.set(u); this.userApps.set([]); this.userAppsDialog = true;
    this.platform.userApps(u.email).subscribe({ next: (a) => this.userApps.set(a), error: () => {} });
  }

  removeUser(u: AdminUser): void {
    if (!confirm(`¿Quitar todos los accesos de ${u.email}?`)) return;
    this.platform.removeUser(u.email).subscribe({ next: () => { this.reloadUsers(); this.reloadGrants(); }, error: () => {} });
  }

  doGrant(): void {
    this.platform.grant(this.grantEmail, this.grantApp, this.grantRole).subscribe({
      next: () => { this.msg.set(`Acceso concedido a ${this.grantEmail} → ${this.grantApp}`); this.grantEmail = ''; this.reloadGrants(); this.reloadUsers(); },
      error: () => this.msg.set('No se pudo conceder (¿eres admin?).'),
    });
  }
  doRevoke(g: Grant): void {
    this.platform.revoke(g.email, g.app).subscribe({ next: () => { this.reloadGrants(); this.reloadUsers(); }, error: () => this.msg.set('No se pudo revocar.') });
  }
}
