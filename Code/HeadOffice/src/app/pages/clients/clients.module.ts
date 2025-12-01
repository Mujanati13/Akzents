import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientsRoutingModule } from './clients-routing.module';
import { ClientsComponent } from './list/clients.component';
import { ClientDetailComponent } from './client-detail/client-detail.component';
import { ClientAddComponent } from './client-add/client-add.component'; // Import new component
import { TranslateModule } from '@ngx-translate/core';
import { ImportsModule } from '@app/shared/imports';
import { AppIconComponent } from '@app/shared/app-icon.component';
import { FavoriteToggleComponent } from '../../shared/components/favorite-toggle/favorite-toggle.component';
import { DateRangePickerComponent } from '@app/shared/components/date-range-picker/date-range-picker.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms'; // Add this import
import { ImageUploadComponent } from '@app/shared/components/image-upload/image-upload.component';
import { MultiImageUploadComponent } from '../../shared/components/multi-image-upload/multi-image-upload.component'; // Add this import
// Import PrimeNG components
import { InputTextModule } from 'primeng/inputtext';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { ReportDetailComponent } from './report-detail/report-detail.component';
import { ReportEditComponent } from './report-edit/report-edit.component';
import { DatePickerComponent } from '../../shared/components/date-picker/date-picker.component';
import { ClientEditComponent } from './client-edit/client-edit.component';
import { DragDropModule } from '@angular/cdk/drag-drop';

@NgModule({
  declarations: [
    ClientsComponent,
    ClientEditComponent,
    ClientDetailComponent,
    ClientAddComponent, // Add the new component
    ReportDetailComponent,
    ReportEditComponent,
  ],
  imports: [
    CommonModule,
    ClientsRoutingModule,
    TranslateModule,
    ImportsModule,
    AppIconComponent,
    FavoriteToggleComponent,
    DateRangePickerComponent,
    FormsModule,
    ReactiveFormsModule, // Add this for form support
    ImageUploadComponent, // Add this line
    MultiImageUploadComponent,
    // Add PrimeNG modules
    InputTextModule,
    InputGroupModule,
    InputGroupAddonModule,
    DatePickerComponent,
    DragDropModule,
  ],
})
export class ClientsModule {}
