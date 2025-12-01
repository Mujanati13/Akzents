import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { LoginComponent } from '@app/auth/login/login.component';
import { AlreadyLoggedCheckGuard, AuthenticationGuard } from '@app/auth/guard/authentication.guard';
import { LogoutComponent } from '@app/auth/logout/logout.component';
import { RegisterComponent } from './register/register.component';
import { PermissionGuard } from './guard/permission.guard';
import { ProfileComponent } from './profile/profile.component';

const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [AlreadyLoggedCheckGuard],
    component: LoginComponent,
    data: { title: marker('Login') },
  },
  {
    path: 'register',
    canActivate: [AlreadyLoggedCheckGuard],
    component: RegisterComponent,
    data: { title: marker('register') },
  },
  {
    path: 'profile',
    canActivate: [AuthenticationGuard, PermissionGuard],
    component: ProfileComponent,
    data: { title: marker('Profile') },
  },
  {
    path: 'logout',
    component: LogoutComponent,
    data: { title: marker('Logout') },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
  providers: [],
})
export class AuthRouting {}
