import { Routes } from '@angular/router';
export const routes: Routes = [
  // Auth routes (login, etc)
  {
    path: '',
    loadChildren: () => import('@app/auth/auth.module').then((m) => m.AuthModule),
  },
  // Fallback route
  { path: '**', redirectTo: '', pathMatch: 'full' },
];
