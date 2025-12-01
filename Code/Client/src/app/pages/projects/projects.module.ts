import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectsRoutingModule } from './projects-routing.module';
import { ProjectsComponent } from './projects.component';
import { ImportsModule } from '@app/shared/imports';
import { AppIconComponent } from '@app/shared/app-icon.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TableModule } from 'primeng/table';
import { PopoverModule } from 'primeng/popover';
import { MultiSelectModule } from 'primeng/multiselect';
import { DialogModule } from 'primeng/dialog';
import { FavoriteToggleComponent } from '@app/shared/components/favorite-toggle/favorite-toggle.component';
import { DateRangePickerComponent } from '@app/shared/components/date-range-picker/date-range-picker.component';
import { DatePickerComponent } from '@app/shared/components/date-picker/date-picker.component';
import { ReportDetailComponent } from './report-detail/report-detail.component';
import { ImageUploadComponent } from '@app/shared/components/image-upload/image-upload.component';
import { MultiImageUploadComponent } from '@app/shared/components/multi-image-upload/multi-image-upload.component';
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  declarations: [ProjectsComponent, ReportDetailComponent],
  imports: [
    CommonModule,
    HttpClientModule,
    ProjectsRoutingModule,
    ImportsModule,
    FormsModule,
    DateRangePickerComponent,
    DatePickerComponent,
    RouterModule,
    ReactiveFormsModule,
    AppIconComponent,
    ImageUploadComponent,
    MultiImageUploadComponent,
    TableModule,
    PopoverModule,
    MultiSelectModule,
    DialogModule,
    FavoriteToggleComponent, // Import standalone component
  ],
})
export class ProjectsModule {}
