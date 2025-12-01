import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Shell } from '@app/shell/services/shell.service';
import { DashboardComponent } from '@pages/dashboard/dashboard.component';
import { FavoritesComponent } from '@pages/favorites/favorites.component';
import { NotificationsComponent } from '@pages/notifications/notifications.component';
// import { PermissionGuard } from '@app/auth/guard/permission.guard';
// import { ROLE } from '@app/auth/enums/roles.enum';
import { UnauthorizedComponent } from './unauthorized/unauthorized.component';

const routes: Routes = [
  Shell.childRoutes([
    {
      path: 'dashboard',
      component: DashboardComponent,
    },
    {
      path: 'clients',
      loadChildren: () => import('./clients/clients.module').then((m) => m.ClientsModule),
      // canActivate: [PermissionGuard],
      // data: { roles: [ROLE.ADMIN, ROLE.USER] } // Example: Only admins and users can access
    },
    {
      path: 'users',
      loadChildren: () => import('./users/users.module').then((m) => m.UsersModule),
      // canActivate: [PermissionGuard],
      // data: { roles: [ROLE.ADMIN] }
    },
    {
      path: 'staff',
      loadChildren: () => import('./staff/staff.module').then((m) => m.StaffModule),
      // canActivate: [PermissionGuard],
      // data: { roles: [ROLE.ADMIN, ROLE.USER] } // Example: Only admins and users can access
    },
    {
      path: 'projects',
      loadChildren: () => import('./projects/projects.module').then((m) => m.ProjectsModule),
      // canActivate: [PermissionGuard],
      // data: { roles: [ROLE.ADMIN, ROLE.USER, ROLE.MEMBER] } // Example: These roles can access
    },
    {
      path: 'favorites',
      component: FavoritesComponent,
    },
    {
      path: 'notifications',
      component: NotificationsComponent,
    },
    {
      path: 'unauthorized',
      component: UnauthorizedComponent,
    },

    // Fallback when no prior route is matched
    { path: '**', redirectTo: '', pathMatch: 'full' },
  ]),
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PagesRoutingModule {}
