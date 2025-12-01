import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';

import { UsersRoutingModule } from './users-routing.module';
import { ListComponent } from './list/list.component';
import { UserAddComponent } from './user-add/user-add.component';
import { UserEditComponent } from './user-edit/user-edit.component';
import { ImportsModule } from '@app/shared/imports';
import { DateRangePickerComponent } from '../../shared/components/date-range-picker/date-range-picker.component';
import { AppIconComponent } from '../../shared/app-icon.component';
import { FavoriteToggleComponent } from '../../shared/components/favorite-toggle/favorite-toggle.component';
import { ContactPersonAddComponent } from './contact-person-add/contact-person-add.component';

@NgModule({
  declarations: [ListComponent, UserAddComponent, UserEditComponent, ContactPersonAddComponent],
  imports: [CommonModule, UsersRoutingModule, ImportsModule, DateRangePickerComponent, AppIconComponent, FavoriteToggleComponent, ReactiveFormsModule],
})
export class UsersModule {}
