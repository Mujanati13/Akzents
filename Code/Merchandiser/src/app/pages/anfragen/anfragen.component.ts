import { Component, OnInit, ViewEncapsulation, ViewChild } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ImportsModule } from '@app/shared/imports';
import { AppIconComponent } from '../../shared/app-icon.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { TableModule } from 'primeng/table';
import { FavoriteToggleComponent } from '@app/shared/components/favorite-toggle/favorite-toggle.component';
import { MultiSelectModule } from 'primeng/multiselect';
import { PopoverModule } from 'primeng/popover';
import { DialogModule } from 'primeng/dialog';
import { DateRangePickerComponent } from '../../shared/components/date-range-picker/date-range-picker.component';
import { TableRowCollapseEvent, TableRowExpandEvent } from 'primeng/table';
import { AssignedReportsService, AssignedProject, AssignedReport } from '@app/@core/services/assigned-reports.service';
import { ProjectService } from '@app/@core/services/project.service';
import { ReportService } from '@app/@core/services/report.service';
import { catchError, of } from 'rxjs';
import { Store } from '@ngrx/store';
import * as AppDataSelectors from '@app/@core/store/app-data/app-data.selectors';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';

interface Project {
  id?: string;
  clientId?: string;
  name?: string;
  zeitraum?: string;
  calendarWeek?: string;
  isFavorite?: boolean;
  orders?: Order[];
  slug?: string;
}

interface Order {
  id?: string;
  status?: string;
  geplant?: string;
  merchandiser?: string;
  filiale?: string;
  adresse?: string;
  notiz?: string;
  reportBis?: string;
  nachVorgabe?: boolean;
  feedback?: boolean;
  isFavorite?: boolean;
  startTime?: string; // Add this new field
}

interface Column {
  field: string;
  header: string;
}

@Component({
  selector: 'app-anfragen',
  standalone: true,
  imports: [
    TranslateModule,
    ImportsModule,
    AppIconComponent,
    FormsModule,
    CommonModule,
    RouterModule,
    TableModule,
    FavoriteToggleComponent,
    MultiSelectModule,
    PopoverModule,
    DialogModule,
    DateRangePickerComponent,
  ],
  templateUrl: './anfragen.component.html',
  styleUrl: './anfragen.component.scss',
  encapsulation: ViewEncapsulation.None,
})
@UntilDestroy({ checkProperties: true })
export class AnfragenComponent implements OnInit {
  projects!: Project[];
  allProjects!: Project[]; // Store original unfiltered data
  selectedProject!: Project | null;
  cols!: Column[];
  selectedColumns!: Column[];
  dateRange2 = { start: null, end: null };

  // Add filter properties
  projectSearchTerm: string = '';
  filialeSearchTerm: string = '';

  // Add these new properties for nested table columns
  orderCols!: Column[];
  selectedOrderColumns!: Column[];

  // Add these properties for sorting
  projectSortField: string = '';
  projectSortOrder: number = 1;
  orderSortField: string = '';
  orderSortOrder: number = 1;

  // Add ordered columns properties
  projectsOrderedColumns: Column[] = [];
  ordersOrderedColumns: Column[] = [];

  // Add these properties to track visible columns
  projectsVisibleColumns: { [key: string]: boolean } = {};
  ordersVisibleColumns: { [key: string]: boolean } = {};

  // Project column filter properties
  projectColumnFilters: { [key: string]: string[] } = {
    name: [],
    formattedZeitraum: [],
  };

  // Track current project filter field for popovers
  currentProjectFilterField: string = '';

  @ViewChild('projectColumnFilterPopover') projectColumnFilterPopover: any;

  // Add loading and error states
  loading: boolean = true;
  error: boolean = false;
  currentUserName: string = 'Current User';

  // Success modal for accepted Anfrage
  successModalVisible: boolean = false;
  acceptedReportId: number | null = null;
  acceptedProjectId: number | null = null;
  acceptedClientId: number | null = null;

  // Modals for rejection
  confirmRejectModalVisible: boolean = false;
  rejectSuccessModalVisible: boolean = false;
  orderToReject: Order | null = null;
  projectToReject: Project | null = null;

  constructor(
    private router: Router,
    private assignedReportsService: AssignedReportsService,
    private projectService: ProjectService,
    private reportService: ReportService,
    private store: Store,
  ) {}

  ngOnInit(): void {
    this.loadCurrentUserName();
    this.loadAssignedReports();
    this.initializeColumns();
  }

  /**
   * Load current user name from store
   */
  private loadCurrentUserName(): void {
    this.store
      .select(AppDataSelectors.selectUserDisplayName)
      .pipe(untilDestroyed(this))
      .subscribe((name) => {
        this.currentUserName = name;
        console.log('👤 Current user name loaded:', this.currentUserName);
      });
  }

  /**
   * Load assigned reports from API
   */
  private loadAssignedReports(): void {
    this.loading = true;
    this.error = false;

    this.assignedReportsService
      .getAssignedReports()
      .pipe(
        catchError((error) => {
          console.error('Error loading assigned reports:', error);
          this.error = true;
          return of([]);
        }),
      )
      .subscribe({
        next: (data) => {
          console.log('🔄 Raw assigned reports data:', data);
          this.projects = this.transformAssignedProjectsToProjects(data);
          this.allProjects = [...this.projects]; // Store original unfiltered data
          console.log('✅ Transformed projects:', this.projects);
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  /**
   * Transform API assigned projects to Project interface
   */
  private transformAssignedProjectsToProjects(assignedProjects: AssignedProject[]): Project[] {
    return assignedProjects.map((assignedProject) => {
      const startDate = new Date(assignedProject.project.startDate);
      const endDate = new Date(assignedProject.project.endDate);

      // Generate date range string
      const dateRange = `${startDate.getDate().toString().padStart(2, '0')}.${(startDate.getMonth() + 1).toString().padStart(2, '0')}.${startDate.getFullYear()} - ${endDate.getDate().toString().padStart(2, '0')}.${(endDate.getMonth() + 1).toString().padStart(2, '0')}.${endDate.getFullYear()}`;

      // Generate week number
      const weekNumber = `KW ${this.getWeekNumber(startDate)}`;

      // Generate slug from name
      const slug = assignedProject.project.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      // Transform reports to orders
      const orders = assignedProject.reports.map((report) => this.transformReportToOrder(report));

      return {
        id: assignedProject.project.id.toString(),
        clientId: assignedProject.project.clientCompany?.id?.toString() ?? '0',
        name: assignedProject.project.name,
        zeitraum: dateRange,
        calendarWeek: weekNumber,
        isFavorite: (assignedProject as any).project?.isFavorite ?? false,
        slug,
        orders,
      };
    });
  }

  /**
   * Transform API report to Order interface
   */
  private transformReportToOrder(report: AssignedReport): Order {
    return {
      id: report.id.toString(),
      status: report.status.name.toUpperCase(),
      geplant: new Date(report.plannedOn).toLocaleDateString('de-DE'),
      merchandiser: this.currentUserName, // Use current user name from store
      filiale: report.branch.name,
      adresse: `${report.street}, ${report.zipCode}`,
      notiz: report.note,
      reportBis: new Date(report.reportTo).toLocaleDateString('de-DE'),
      nachVorgabe: report.isSpecCompliant,
      feedback: report.feedback === 'true',
      isFavorite: false, // Default to false
      startTime: report.note, // Using note as start time
    };
  }

  /**
   * Get week number for a date
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  private initializeColumns(): void {
    // Initialize project columns - only zeitraum
    this.cols = [{ field: 'formattedZeitraum', header: 'Zeitraum' }];
    this.selectedColumns = [...this.cols];

    // Initialize order columns (same as client-detail)
    this.orderCols = [
      { field: 'geplant', header: 'Geplant' },
      { field: 'merchandiser', header: 'Merchandiser' },
      { field: 'filiale', header: 'Filiale' },
      { field: 'adresse', header: 'Adresse' },
      { field: 'notiz', header: 'Notiz' },
      { field: 'reportBis', header: 'Report bis' },
      { field: 'nachVorgabe', header: 'Alles nach Vorgabe?' },
      { field: 'feedback', header: 'Feedback' },
    ];
    this.selectedOrderColumns = [...this.orderCols];

    // Initialize ordered columns
    this.projectsOrderedColumns = [...this.cols];
    this.ordersOrderedColumns = [...this.orderCols];

    // Set all columns to visible by default
    this.initializeVisibleColumns();
  }

  initializeVisibleColumns() {
    // Set all project columns to visible by default
    this.cols.forEach((col) => {
      this.projectsVisibleColumns[col.field] = true;
    });

    // Set all order columns to visible by default
    this.orderCols.forEach((col) => {
      this.ordersVisibleColumns[col.field] = true;
    });
  }

  // Add filter methods
  onProjectSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.projectSearchTerm = target.value.toLowerCase().trim();
    this.applyFilters();
  }

  onFilialeSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filialeSearchTerm = target.value.toLowerCase().trim();
    this.applyFilters();
  }

  onRangeSelected(range: { start: Date | null; end: Date | null }) {
    console.log('Selected range:', range);
    this.dateRange2 = range;
    this.applyFilters();
  }

  applyFilters(): void {
    let filteredProjects = [...this.allProjects];

    // Apply project name filter
    if (this.projectSearchTerm) {
      filteredProjects = filteredProjects.filter(
        (project) =>
          project.name?.toLowerCase().includes(this.projectSearchTerm) ||
          project.zeitraum?.toLowerCase().includes(this.projectSearchTerm) ||
          project.calendarWeek?.toLowerCase().includes(this.projectSearchTerm),
      );
    }

    // Apply filiale filter - filter projects that have orders matching the filiale search
    if (this.filialeSearchTerm) {
      filteredProjects = filteredProjects.filter((project) =>
        project.orders?.some(
          (order) =>
            order.filiale?.toLowerCase().includes(this.filialeSearchTerm) ||
            order.merchandiser?.toLowerCase().includes(this.filialeSearchTerm) ||
            order.adresse?.toLowerCase().includes(this.filialeSearchTerm),
        ),
      );

      // Also filter the orders within each project
      filteredProjects = filteredProjects.map((project) => ({
        ...project,
        orders: project.orders?.filter(
          (order) =>
            order.filiale?.toLowerCase().includes(this.filialeSearchTerm) ||
            order.merchandiser?.toLowerCase().includes(this.filialeSearchTerm) ||
            order.adresse?.toLowerCase().includes(this.filialeSearchTerm),
        ),
      }));
    }

    // Apply date range filter
    if (this.dateRange2.start && this.dateRange2.end) {
      filteredProjects = filteredProjects.filter((project) => {
        if (!project.orders || project.orders.length === 0) return false;

        return project.orders.some((order) => {
          if (!order.geplant) return false;

          const orderDate = this.parseGermanDate(order.geplant);
          if (!orderDate) return false;

          return orderDate >= this.dateRange2.start! && orderDate <= this.dateRange2.end!;
        });
      });

      // Also filter orders within projects by date range
      filteredProjects = filteredProjects.map((project) => ({
        ...project,
        orders: project.orders?.filter((order) => {
          if (!order.geplant) return false;

          const orderDate = this.parseGermanDate(order.geplant);
          if (!orderDate) return false;

          return orderDate >= this.dateRange2.start! && orderDate <= this.dateRange2.end!;
        }),
      }));
    }

    // Apply column filters
    filteredProjects = filteredProjects.filter((project) => {
      // Column filter: name (Projekt)
      if (this.projectColumnFilters['name'].length > 0 && !this.projectColumnFilters['name'].includes(project.name || '')) {
        return false;
      }

      // Column filter: formattedZeitraum (Zeitraum)
      const zeitraumValue = project.zeitraum || '';
      if (this.projectColumnFilters['formattedZeitraum'].length > 0 && !this.projectColumnFilters['formattedZeitraum'].includes(zeitraumValue)) {
        return false;
      }

      return true;
    });

    this.projects = filteredProjects;
  }

  private parseGermanDate(dateString: string): Date | null {
    try {
      // Handle German date format DD.MM.YYYY
      const parts = dateString.split('.');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Month is 0-based in JavaScript
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
      return null;
    } catch (error) {
      console.error('Error parsing date:', dateString, error);
      return null;
    }
  }

  // Clear all filters
  clearFilters(): void {
    this.projectSearchTerm = '';
    this.filialeSearchTerm = '';
    this.dateRange2 = { start: null, end: null };
    // Clear project column filters
    this.projectColumnFilters = {
      name: [],
      formattedZeitraum: [],
    };
    this.projects = [...this.allProjects];
  }

  // Check if there are any active filters
  hasActiveFilters(): boolean {
    return !!(
      this.projectSearchTerm ||
      this.filialeSearchTerm ||
      this.dateRange2.start ||
      this.dateRange2.end ||
      this.hasProjectColumnFilters()
    );
  }

  // Project column filter methods
  getProjectFilterOptions(field: string): string[] {
    const values = new Set<string>();
    this.allProjects.forEach((project) => {
      let value: string = '';
      switch (field) {
        case 'name':
          value = project.name || '';
          break;
        case 'formattedZeitraum':
          value = project.zeitraum || '';
          break;
      }
      if (value && value !== '-') {
        values.add(value);
      }
    });
    return Array.from(values).sort();
  }

  getProjectColumnFilterValue(field: string): string[] {
    return this.projectColumnFilters[field] || [];
  }

  openProjectColumnFilter(field: string, event: Event): void {
    this.currentProjectFilterField = field;
    event.stopPropagation();
    if (this.projectColumnFilterPopover) {
      this.projectColumnFilterPopover.toggle(event);
    }
  }

  hasProjectColumnFilters(): boolean {
    return Object.values(this.projectColumnFilters).some(filters => filters.length > 0);
  }

  // Get column header for a project field
  getProjectColumnHeader(field: string): string {
    if (field === 'name') {
      return 'Projekt';
    }
    const col = this.cols.find(c => c.field === field);
    return col ? col.header : field;
  }

  // Get placeholder text for project filter
  getProjectFilterPlaceholder(field: string): string {
    const header = this.getProjectColumnHeader(field);
    return `Alle ${header}`;
  }

  // Get visible columns for projects table
  getProjectsVisibleColumns(): Column[] {
    return this.projectsOrderedColumns.filter((col) => this.projectsVisibleColumns[col.field]);
  }

  // Get visible columns for orders table
  getOrdersVisibleColumns(): Column[] {
    return this.ordersOrderedColumns.filter((col) => this.ordersVisibleColumns[col.field]);
  }

  // Handle column reordering for projects table
  onProjectsColReorder(event: any) {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      const movedColumn = this.projectsOrderedColumns[event.dragIndex];
      const newOrderedColumns = [...this.projectsOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);
      this.projectsOrderedColumns = newOrderedColumns;
    }
  }

  // Handle column reordering for orders table
  onOrdersColReorder(event: any) {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      const movedColumn = this.ordersOrderedColumns[event.dragIndex];
      const newOrderedColumns = [...this.ordersOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);
      this.ordersOrderedColumns = newOrderedColumns;
    }
  }

  // Update visible columns for projects
  onProjectsColumnsChange(selectedColumns: Column[]) {
    Object.keys(this.projectsVisibleColumns).forEach((key) => {
      this.projectsVisibleColumns[key] = false;
    });
    selectedColumns.forEach((col) => {
      this.projectsVisibleColumns[col.field] = true;
    });
    this.selectedColumns = selectedColumns;
  }

  // Update visible columns for orders
  onOrdersColumnsChange(selectedColumns: Column[]) {
    Object.keys(this.ordersVisibleColumns).forEach((key) => {
      this.ordersVisibleColumns[key] = false;
    });
    selectedColumns.forEach((col) => {
      this.ordersVisibleColumns[col.field] = true;
    });
    this.selectedOrderColumns = selectedColumns;
  }

  onFavoriteChanged(newStatus: boolean, project: Project): void {
    const previous = project.isFavorite ?? false;
    project.isFavorite = newStatus; // optimistic UI
    if (!project.id) return;
    this.projectService.toggleFavoriteStatus(project.id).subscribe({
      next: (res) => {
        project.isFavorite = res?.isFavorite ?? project.isFavorite;
      },
      error: () => {
        project.isFavorite = previous; // rollback on error
      },
    });
  }

  onOrderFavoriteChanged(newStatus: boolean, order: Order): void {
    order.isFavorite = newStatus;
    console.log(`Order for ${order.filiale} favorite status: ${newStatus}`);
  }

  getStatusStyle(status: string): { bg: string; text: string } {
    switch (status) {
      case 'NEU':
        return { bg: 'bg-[#00709B]', text: 'NEU' };
      case 'FÄLLIG':
        return { bg: 'bg-[#D10003]', text: 'FÄLLIG' };
      case 'PLAN':
        return { bg: 'bg-[#CCAF08]', text: 'PLAN' };
      case 'OK':
        return { bg: 'bg-[#6FCC08]', text: 'OK' };
      case 'ANFRAGE':
        return { bg: 'bg-[#00A8E9]', text: 'ANFRAGE' };
      case 'OFFEN':
        return { bg: 'bg-[#CCAF08]', text: 'OFFEN' };
      default:
        return { bg: 'bg-gray-400', text: status };
    }
  }

  // Add these new methods for handling sort
  onProjectSort(field: string): void {
    event?.stopPropagation();
    if (this.projectSortField === field) {
      this.projectSortOrder = this.projectSortOrder * -1;
    } else {
      this.projectSortField = field;
      this.projectSortOrder = 1;
    }
    this.sortProjects(field, this.projectSortOrder);
  }

  onOrderSort(field: string, project: Project): void {
    event?.stopPropagation();
    if (this.orderSortField === field) {
      this.orderSortOrder = this.orderSortOrder * -1;
    } else {
      this.orderSortField = field;
      this.orderSortOrder = 1;
    }
    if (project && project.orders) {
      this.sortOrders(project.orders, field, this.orderSortOrder);
    }
  }

  private sortProjects(field: string, order: number): void {
    this.projects.sort((a, b) => {
      const valueA = this.getProjectField(a, field);
      const valueB = this.getProjectField(b, field);

      if (valueA === valueB) return 0;
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return order * valueA.localeCompare(valueB);
      }
      if (valueA < valueB) return order * -1;
      return order;
    });
  }

  private sortOrders(orders: Order[], field: string, order: number): void {
    orders.sort((a, b) => {
      const valueA = this.getOrderField(a, field);
      const valueB = this.getOrderField(b, field);

      if (valueA === valueB) return 0;
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return order * valueA.localeCompare(valueB);
      }
      if (valueA < valueB) return order * -1;
      return order;
    });
  }

  private getProjectField(project: Project, field: string): any {
    if (field === 'name') return project.name || '';
    if (field === 'formattedZeitraum') return project.zeitraum || '';
    return project[field as keyof Project] || '';
  }

  private getOrderField(order: Order, field: string): any {
    if (field === 'status') return order.status || '';
    if (field === 'nachVorgabe' || field === 'feedback') {
      return order[field] ? 'Ja' : '';
    }
    return order[field as keyof Order] || '';
  }

  // Download Excel for project (previously downloadProjectCsv)
  downloadProjectCsv(project: Project): void {
    if (!project) return;

    console.log('📊 Exporting project reports as Excel:', project);

    this.assignedReportsService.exportProjectReportsAsExcel(project.id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${project.name?.replace(/\s+/g, '_')}_reports_export.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        console.log(`Excel exported for project: ${project.name}`);
      },
      error: (error) => {
        console.error('❌ Error exporting Excel:', error);

        // Check if it's a "no data" error
        if (error.status === 404 && error.error?.error === 'NO_DATA_FOUND') {
          console.warn('Keine Daten in diesem Projekt vorhanden.');
        } else {
          console.error('Excel-Export fehlgeschlagen!');
        }
      },
    });
  }

  // Helper method to escape CSV fields that contain commas, quotes, or newlines
  private escapeCsvField(field: string): string {
    if (!field) return '';

    // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
      return '"' + field.replace(/"/g, '""') + '"';
    }

    return field;
  }

  // Helper method to format current date for filename
  private formatDateForFilename(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}_${hours}-${minutes}`;
  }

  // Optional: Add method to download all projects as CSV
  downloadAllProjectsCsv(): void {
    if (!this.projects || this.projects.length === 0) {
      console.warn('No projects available for CSV export');
      return;
    }

    // Define CSV headers
    const headers = [
      'Projekt',
      'Zeitraum',
      'Kalenderwoche',
      'Status',
      'Geplant',
      'Merchandiser',
      'Filiale',
      'Adresse',
      'Notiz',
      'Report bis',
      'Alles nach Vorgabe?',
      'Feedback',
      'Projekt Favorit',
      'Order Favorit',
    ];

    const csvRows: string[] = [];
    csvRows.push(headers.join(','));

    // Add data rows for all projects and their orders
    this.projects.forEach((project) => {
      if (project.orders && project.orders.length > 0) {
        project.orders.forEach((order) => {
          const row = [
            this.escapeCsvField(project.name || ''),
            this.escapeCsvField(project.zeitraum || ''),
            this.escapeCsvField(project.calendarWeek || ''),
            this.escapeCsvField(order.status || ''),
            this.escapeCsvField(order.geplant || ''),
            this.escapeCsvField(order.merchandiser || ''),
            this.escapeCsvField(order.filiale || ''),
            this.escapeCsvField(order.adresse || ''),
            this.escapeCsvField(order.notiz || ''),
            this.escapeCsvField(order.reportBis || ''),
            order.nachVorgabe ? 'Ja' : 'Nein',
            order.feedback ? 'Ja' : 'Nein',
            project.isFavorite ? 'Ja' : 'Nein',
            order.isFavorite ? 'Ja' : 'Nein',
          ];
          csvRows.push(row.join(','));
        });
      } else {
        // Project with no orders
        const row = [
          this.escapeCsvField(project.name || ''),
          this.escapeCsvField(project.zeitraum || ''),
          this.escapeCsvField(project.calendarWeek || ''),
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          project.isFavorite ? 'Ja' : 'Nein',
          '',
        ];
        csvRows.push(row.join(','));
      }
    });

    // Create CSV content
    const csvContent = csvRows.join('\n');

    // Create and download the file
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `alle_projekte_${this.formatDateForFilename()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('All projects CSV exported');
    }
  }

  // Add these methods at the end of the class
  acceptOrder(order: Order, project: Project): void {
    const reportId = Number(order.id);
    if (isNaN(reportId)) {
      console.error('Invalid report ID');
      alert('Ungültige Auftrags-ID');
      return;
    }

    // Validate clientId
    if (!project.clientId || project.clientId === '0') {
      console.error('Invalid or missing client ID for project:', project);
      alert('Fehler: Kunde-ID nicht verfügbar');
      return;
    }

    // Call backend API to accept the report
    this.reportService.acceptOrRejectReport(reportId, true).pipe(
      catchError(error => {
        console.error('Error accepting report:', error);
        alert('Fehler beim Annehmen des Auftrags');
        return of(null);
      })
    ).subscribe(result => {
      if (result) {
        console.log('✅ Report accepted successfully');
        // Store the IDs for navigation
        this.acceptedReportId = reportId;
        this.acceptedProjectId = Number(project.id);
        this.acceptedClientId = Number(project.clientId);
        // Show success modal
        this.successModalVisible = true;
        // Remove the order from the list
        const projectIndex = this.projects.findIndex(p => p.id === project.id);
        if (projectIndex !== -1) {
          this.projects[projectIndex].orders = this.projects[projectIndex].orders.filter(o => o.id !== order.id);
          // If no more orders in this project, you might want to remove the project or update UI
        }
      }
    });
  }

  rejectOrder(order: Order, project: Project): void {
    const reportId = Number(order.id);
    if (isNaN(reportId)) {
      console.error('Invalid report ID');
      return;
    }

    // Store order and project for confirmation
    this.orderToReject = order;
    this.projectToReject = project;
    
    // Show confirmation modal
    this.confirmRejectModalVisible = true;
  }

  confirmReject(): void {
    if (!this.orderToReject || !this.projectToReject) {
      return;
    }

    const reportId = Number(this.orderToReject.id);
    
    // Close confirmation modal
    this.confirmRejectModalVisible = false;

    // Call backend API to reject the report
    this.reportService.acceptOrRejectReport(reportId, false).pipe(
      catchError(error => {
        console.error('Error rejecting report:', error);
        return of(null);
      })
    ).subscribe(result => {
      if (result) {
        console.log('✅ Report rejected successfully');
        // Remove the order from the list
        const projectIndex = this.projects.findIndex(p => p.id === this.projectToReject!.id);
        if (projectIndex !== -1) {
          this.projects[projectIndex].orders = this.projects[projectIndex].orders!.filter(o => o.id !== this.orderToReject!.id);
        }
        // Show success modal
        this.rejectSuccessModalVisible = true;
      }
      
      // Clear stored data
      this.orderToReject = null;
      this.projectToReject = null;
    });
  }

  cancelReject(): void {
    this.confirmRejectModalVisible = false;
    this.orderToReject = null;
    this.projectToReject = null;
  }

  closeRejectSuccessModal(): void {
    this.rejectSuccessModalVisible = false;
  }

  closeModal(): void {
    this.successModalVisible = false;
  }

  goToReport(): void {
    if (this.acceptedReportId && this.acceptedProjectId && this.acceptedClientId) {
      this.successModalVisible = false;
      // Navigate to edit-report page: /clients/{clientId}/projects/{projectId}/edit-report/{reportId}
      this.router.navigate(['/clients', this.acceptedClientId, 'projects', this.acceptedProjectId, 'edit-report', this.acceptedReportId]);
    }
  }
}
