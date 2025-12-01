import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListComponent } from '@pages/users/list/list.component';
import { UserAddComponent } from './user-add/user-add.component';
import { ContactPersonAddComponent } from './contact-person-add/contact-person-add.component';
import { UserEditComponent } from './user-edit/user-edit.component';
// import { PermissionGuard } from '@app/auth/guard/permission.guard';
// import { ROLE } from '@app/auth/enums/roles.enum';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'list',
    pathMatch: 'full',
  },
  {
    path: 'list',
    component: ListComponent,
    // canActivate: [PermissionGuard],
    // data: { roles: [ROLE.ADMIN] }
  },
  {
    path: 'add',
    component: UserAddComponent,
    // canActivate: [PermissionGuard],
    // data: { roles: [ROLE.ADMIN] }
  },
  {
    path: 'edit/:id',
    component: UserEditComponent,
    // canActivate: [PermissionGuard],
    // data: { roles: [ROLE.ADMIN] }
  },
  {
    path: 'contact/add/:client',
    component: ContactPersonAddComponent,
    // canActivate: [PermissionGuard],
    // data: { roles: [ROLE.ADMIN] }
  },
  {
    path: 'contact/add',
    component: ContactPersonAddComponent,
    // canActivate: [PermissionGuard],
    // data: { roles: [ROLE.ADMIN] }
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UsersRoutingModule {}
