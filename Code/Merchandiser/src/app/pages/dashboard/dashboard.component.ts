import { Component, OnInit, ViewEncapsulation, ViewChild } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ImportsModule } from '@app/shared/imports';
import { AppIconComponent } from '../../shared/app-icon.component';
import { FavoriteToggleComponent } from '@app/shared/components/favorite-toggle/favorite-toggle.component';
import { ClientsRoutingModule } from '../clients/clients-routing.module';
import { DashboardService, UpcomingProject } from '@app/@core/services/dashboard.service';
import { Report, ReportService } from '@app/@core/services/report.service';
import { AssignedReport } from '@app/@core/services/assigned-reports.service';
import { EuDatePipe } from '@app/shared/pipes/eu-date.pipe';
import { catchError, of } from 'rxjs';

interface ReportDisplay {
  id?: string;
  code?: string;
  name?: string;
  description?: string;
  price?: number;
  quantity?: number;
  inventoryStatus?: string;
  category?: string;
  image?: string;
  rating?: number;
  isFavorite?: boolean;
  client?: string;
  kunde?: string;
  store?: string;
  ort?: string;
  besuchsdatum?: string;
  branch?: any;
  project?: any;
}

interface Column {
  field: string;
  header: string;
}
@Component({
  selector: 'app-dashboard',
  imports: [
    TranslateModule,
    ClientsRoutingModule,
    ImportsModule,
    AppIconComponent,
    FavoriteToggleComponent,
    EuDatePipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardComponent implements OnInit {
  // Data properties
  upcomingProjects: UpcomingProject[] = [];
  upcomingProjectsCount: number = 0;
  newRequests: AssignedReport[] = [];
  newRequestsCount: number = 0;
  overdueReports: Report[] = [];
  
  // UI State
  loading: boolean = true;
  error: boolean = false;

  // Table columns
  cols!: Column[];
  overdueReportsColumns!: Column[];

  // Sorting
  overdueSortField: string = '';
  overdueSortOrder: number = 1;

  // Column visibility and ordering
  overdueReportsVisibleColumns: { [key: string]: boolean } = {};
  overdueReportsOrderedColumns: Column[] = [];

  // Column filter properties
  overdueReportsColumnFilters: { [key: string]: string[] } = {
    kunde: [],
    store: [],
    ort: [],
    besuchsdatum: [],
  };

  // Track current filter field for popovers
  currentOverdueReportsFilterField: string = '';

  @ViewChild('overdueReportsColumnFilterPopover') overdueReportsColumnFilterPopover: any;
  @ViewChild('overdueReportsPopover') overdueReportsPopover: any;
  private activeFilterPopover: any = null;
  private activeSettingsPopover: any = null;

  constructor(
    private dashboardService: DashboardService,
    private reportService: ReportService,
  ) {}

  ngOnInit() {
    // Initialize columns
    this.cols = [
      { field: 'kunde', header: 'Kunde' },
      { field: 'store', header: 'Store' },
      { field: 'ort', header: 'Ort' },
      { field: 'besuchsdatum', header: 'Besuchsdatum' },
    ];

    // Initialize column visibility and ordering
    this.initializeVisibleColumns();
    this.overdueReportsOrderedColumns = [...this.cols];
    this.overdueReportsColumns = [...this.cols];

    // Ensure filter arrays are initialized (safety check)
    if (!this.overdueReportsColumnFilters || !Array.isArray(this.overdueReportsColumnFilters['kunde'])) {
      this.overdueReportsColumnFilters = {
        kunde: [],
        store: [],
        ort: [],
        besuchsdatum: [],
      };
    }

    // Load dashboard data with performance timing
    const startTime = performance.now();
    this.loadDashboardData();
    
    // Log loading time when data arrives (in subscribe)
    console.log('🚀 Dashboard initialization started');
  }

  /**
   * Load all dashboard data from the API
   */
  loadDashboardData(): void {
    this.loading = true;
    this.error = false;

    this.dashboardService
      .getDashboardData()
      .pipe(
        catchError((error) => {
          console.error('Error loading dashboard data:', error);
          this.error = true;
          this.loading = false;
          return of({
            upcomingProjects: [],
            upcomingProjectsCount: 0,
            newRequestsCount: 0,
            newRequests: [],
            overdueReports: [],
          });
        }),
      )
      .subscribe((data) => {
        console.log('✅ Dashboard data loaded:', data);
        this.upcomingProjects = data.upcomingProjects;
        this.upcomingProjectsCount = data.upcomingProjectsCount;
        this.newRequests = data.newRequests;
        this.newRequestsCount = data.newRequestsCount;
        this.overdueReports = data.overdueReports || [];
        
        this.loading = false;
      });
  }

  /**
   * Transform Report objects to ReportDisplay interface for table display
   */
  transformReportsToReportDisplay(reports: Report[]): ReportDisplay[] {
    return reports.map((report) => ({
      id: report.id?.toString(),
      name: report.title || report.description,
      description: report.description,
      inventoryStatus: report.status?.merchandiserName || report.status?.name || 'FÄLLIG',
      kunde: report.branch?.client?.name || report.project?.name || '-',
      store: report.branch?.name || '-',
      ort: `${report.street || ''} ${report.zipCode || ''}`.trim() || report.branch?.name || '-',
      besuchsdatum: report.plannedOn ? this.dashboardService.formatDateShort(report.plannedOn) : '-',
      isFavorite: report.isFavorite || false,
      branch: report.branch,
      project: report.project,
    }));
  }

  /**
   * Format date to German format for display
   */
  formatDate(dateString: string): string {
    return this.dashboardService.formatDateGerman(dateString);
  }

  getReportBesuchsdatum(report: Report): string {
    return report.plannedOn ? this.dashboardService.formatDateShort(report.plannedOn) : '-';
  }

  getReportKunde(report: Report): string {
    return report.branch?.client?.name || report.project?.name || '-';
  }

  getReportStore(report: Report): string {
    return report.branch?.name || '-';
  }

  getReportOrt(report: Report): string {
    const address = `${report.street || ''} ${report.zipCode || ''}`.trim();
    return address || report.branch?.name || '-';
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

  /**
   * Handle favorite toggle for reports
   */
  onFavoriteChanged(newStatus: boolean, report: Report): void {
    report.isFavorite = newStatus;

    // Update on backend
    if (report.id) {
      this.reportService
        .toggleFavoriteStatus(report.id)
        .pipe(
          catchError((error) => {
            console.error('Error toggling favorite status:', error);
            // Revert on error
            report.isFavorite = !newStatus;
            return of(null);
          }),
        )
        .subscribe((response) => {
          if (response) {
            console.log('✅ Favorite status updated:', response.message);
          }
        });
    }
  }

  /**
   * Handle sorting for overdue reports
   */

  onOverdueSort(field: string): void {
    if (this.overdueSortField === field) {
      // If clicking on the same field, toggle the sort order
      this.overdueSortOrder = this.overdueSortOrder * -1;
    } else {
      // New sort field, default to ascending
      this.overdueSortField = field;
      this.overdueSortOrder = 1;
    }

    // Apply sorting
    this.sortReports(this.overdueReports, field, this.overdueSortOrder);
  }

  private sortReports(reports: Report[], field: string, order: number): void {
    reports.sort((a, b) => {
      const valueA = this.getReportField(a, field);
      const valueB = this.getReportField(b, field);

      if (valueA === valueB) {
        return 0;
      }

      // Handle string case-insensitive comparison
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return order * valueA.localeCompare(valueB);
      }

      // Handle numeric comparison
      if (valueA < valueB) {
        return order * -1;
      }
      return order;
    });
  }

  private getReportField(report: Report, field: string): any {
    // Handle special fields that need transformation
    if (field === 'kunde') {
      return this.getReportKunde(report);
    }
    if (field === 'store') {
      return this.getReportStore(report);
    }
    if (field === 'ort') {
      return this.getReportOrt(report);
    }
    if (field === 'besuchsdatum') {
      return this.getReportBesuchsdatum(report);
    }
    if (field === 'status') {
      return report.status?.name || '';
    }
    // Handle other properties
    const value = (report as any)[field];
    return value !== undefined && value !== null ? value : '';
  }

  /**
   * Initialize visible columns
   */
  initializeVisibleColumns() {
    // Set all columns to visible by default
    this.cols.forEach((col) => {
      this.overdueReportsVisibleColumns[col.field] = true;
    });
  }

  // Get visible columns for overdue reports
  getOverdueReportsVisibleColumns(): Column[] {
    // Return ordered columns that are visible
    return this.overdueReportsOrderedColumns.filter((col) => this.overdueReportsVisibleColumns[col.field]);
  }


  // Update visible columns when selection changes in multiselect
  onOverdueReportsColumnsChange(selectedColumns: Column[]) {
    // Reset all to false
    Object.keys(this.overdueReportsVisibleColumns).forEach((key) => {
      this.overdueReportsVisibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.overdueReportsVisibleColumns[col.field] = true;
    });
  }

  /**
   * Handle column reordering for overdue reports table
   */

  onOverdueReportsColReorder(event: any) {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      // Get the column that was moved
      const movedColumn = this.overdueReportsOrderedColumns[event.dragIndex];

      // Create a new array without the moved column
      const newOrderedColumns = [...this.overdueReportsOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);

      // Insert the moved column at the drop index
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);

      // Update the ordered columns with the new order
      this.overdueReportsOrderedColumns = newOrderedColumns;
    }
  }

  // Column filter methods
  getOverdueReportsFilterOptions(field: string): string[] {
    const values = new Set<string>();
    this.overdueReports.forEach((report) => {
      let value: string = '';
      switch (field) {
        case 'kunde':
          value = this.getReportKunde(report);
          break;
        case 'store':
          value = this.getReportStore(report);
          break;
        case 'ort':
          value = this.getReportOrt(report);
          break;
        case 'besuchsdatum':
          value = this.getReportBesuchsdatum(report);
          break;
      }
      if (value && value !== '-') {
        values.add(value);
      }
    });
    return Array.from(values).sort();
  }

  getOverdueReportsColumnFilterValue(field: string): string[] {
    const filter = this.overdueReportsColumnFilters[field];
    return (filter && Array.isArray(filter)) ? filter : [];
  }

  /**
   * Handle settings popover toggle - ensure only one popover is open at a time
   */
  toggleSettingsPopover(event: Event): void {
    // Close any open filter popover when opening settings
    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }
    
    if (this.overdueReportsPopover) {
      // If settings popover is already open, close it; otherwise open it
      if (this.activeSettingsPopover === this.overdueReportsPopover) {
        this.overdueReportsPopover.hide();
        this.activeSettingsPopover = null;
      } else {
        this.overdueReportsPopover.toggle(event);
        this.activeSettingsPopover = this.overdueReportsPopover;
      }
    }
  }

  /**
   * Handle settings popover close
   */
  onSettingsPopoverClose(): void {
    if (this.overdueReportsPopover) {
      this.overdueReportsPopover.hide();
    }
    this.activeSettingsPopover = null;
  }

  openOverdueReportsColumnFilter(field: string, event: Event): void {
    event.stopPropagation();
    
    // Store the actual DOM element for positioning
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    if (!targetElement) {
      return;
    }
    
    // Close settings popover if open
    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }
    
    // Check if the same field is already open
    const isSameField = this.currentOverdueReportsFilterField === field;
    const isPopoverOpen = this.activeFilterPopover === this.overdueReportsColumnFilterPopover;
    
    // If clicking on the same field that's already open, just close it
    if (isSameField && isPopoverOpen) {
      this.overdueReportsColumnFilterPopover.hide();
      this.activeFilterPopover = null;
      return;
    }
    
    // Close any other open filter popover
    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }
    
    // Update the current filter field
    this.currentOverdueReportsFilterField = field;
    
    // Open the popover with the new field using show() method for better control
    if (this.overdueReportsColumnFilterPopover) {
      // Create positioning event for PrimeNG popover
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      
      // Use setTimeout to ensure the popover closes before reopening (if it was open)
      const delay = isPopoverOpen ? 150 : 50;
      setTimeout(() => {
        this.overdueReportsColumnFilterPopover.show(positioningEvent);
        this.activeFilterPopover = this.overdueReportsColumnFilterPopover;
      }, delay);
    }
  }

  /**
   * Handle filter popover close
   */
  onFilterPopoverClose(): void {
    if (this.overdueReportsColumnFilterPopover) {
      this.overdueReportsColumnFilterPopover.hide();
    }
    if (this.activeFilterPopover === this.overdueReportsColumnFilterPopover) {
      this.activeFilterPopover = null;
    }
  }

  hasOverdueReportsColumnFilters(): boolean {
    return Object.values(this.overdueReportsColumnFilters).some(filters => filters && Array.isArray(filters) && filters.length > 0);
  }

  getFilteredOverdueReports(): Report[] {
    return this.overdueReports.filter((report) => {
      // Filter by kunde
      const kundeFilter = this.overdueReportsColumnFilters['kunde'];
      if (kundeFilter && Array.isArray(kundeFilter) && kundeFilter.length > 0 && !kundeFilter.includes(this.getReportKunde(report))) {
        return false;
      }
      // Filter by store
      const storeFilter = this.overdueReportsColumnFilters['store'];
      if (storeFilter && Array.isArray(storeFilter) && storeFilter.length > 0 && !storeFilter.includes(this.getReportStore(report))) {
        return false;
      }
      // Filter by ort
      const ortFilter = this.overdueReportsColumnFilters['ort'];
      if (ortFilter && Array.isArray(ortFilter) && ortFilter.length > 0 && !ortFilter.includes(this.getReportOrt(report))) {
        return false;
      }
      // Filter by besuchsdatum
      const besuchsdatumFilter = this.overdueReportsColumnFilters['besuchsdatum'];
      if (besuchsdatumFilter && Array.isArray(besuchsdatumFilter) && besuchsdatumFilter.length > 0 && !besuchsdatumFilter.includes(this.getReportBesuchsdatum(report))) {
        return false;
      }
      return true;
    });
  }

  // Get column header for a field
  getColumnHeader(field: string): string {
    const col = this.cols.find(c => c.field === field);
    return col ? col.header : field;
  }

  // Get placeholder text for filter
  getFilterPlaceholder(field: string): string {
    const header = this.getColumnHeader(field);
    return `Alle ${header}`;
  }

  // Clear all column filters
  clearFilters(): void {
    this.overdueReportsColumnFilters = {
      kunde: [],
      store: [],
      ort: [],
      besuchsdatum: [],
    };
  }
}
