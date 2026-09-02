import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home.component';
import { DashboardComponent } from './pages/dashboard.component';
import { StyleguideComponent } from './pages/styleguide.component';
import { adminGuard } from './core/admin.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'admin', component: DashboardComponent, canActivate: [adminGuard] },
  { path: 'estilos', component: StyleguideComponent },
  { path: 'accesos', redirectTo: 'admin' },
  { path: '**', redirectTo: '' },
];
