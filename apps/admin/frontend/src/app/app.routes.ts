import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home.component';
import { AdminPanelComponent } from './pages/admin-panel.component';
import { adminGuard } from './core/admin.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'accesos', component: AdminPanelComponent, canActivate: [adminGuard] },
  { path: '**', redirectTo: '' },
];
