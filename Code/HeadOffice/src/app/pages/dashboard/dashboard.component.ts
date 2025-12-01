import { Component, OnInit, ViewEncapsulation, ViewChild, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ImportsModule } from '@app/shared/imports';
import { AppIconComponent } from '../../shared/app-icon.component';
import { FavoriteToggleComponent } from '@app/shared/components/favorite-toggle/favorite-toggle.component';
import { ClientsRoutingModule } from '../clients/clients-routing.module';
import { DashboardService, DashboardReport, DashboardClientCompany } from '@app/core/services/dashboard.service';
import { EuDatePipe } from '@app/shared/pipes/eu-date.pipe';

interface ReportCounts {
  newReports: number;
  ongoingReports: number;
  completedReports: number;
}

interface ClientCompanyWithCounts extends DashboardClientCompany {
  reportCounts?: ReportCounts;
}

interface ClientCompanyAssignedAkzente extends DashboardClientCompany {
  reportCounts?: ReportCounts;
}
import { ReportService } from '@app/core/services/report.service';
import { ClientCompanyService } from '@app/core/services/client-company.service';
import { HotToastService } from '@ngxpert/hot-toast';
import { catchError, of } from 'rxjs';

interface Product {
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
  isFavorite?: boolean; // Add this property
  client?: string;
}
interface Column {
  field: string;
  header: string;
}
@Component({
  selector: 'app-dashboard',
  imports: [TranslateModule, ClientsRoutingModule, ImportsModule, AppIconComponent, FavoriteToggleComponent, EuDatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardComponent implements OnInit {
  // API data
  newReports: DashboardReport[] = [];
  rejectedReports: DashboardReport[] = [];
  clientCompaniesAssignedAkzente: ClientCompanyWithCounts[] = [];
  last4ClientCompanies: ClientCompanyWithCounts[] = [];
  totalClientCompaniesCount = 0;
  loading = true;
  error = false;
  myClientIds: Set<number> = new Set(); // Store IDs of "my clients"

  // Legacy properties for backward compatibility
  products!: Product[];
  newProducts: Product[] = [];
  overdueProducts: Product[] = [];
  selectedProduct!: Product;
  cols!: Column[];
  newProductsColumns!: Column[];
  overdueProductsColumns!: Column[];
  selectedColumns!: Column[];

  // Add these properties for sorting
  sortField: string = '';
  sortOrder: number = 1; // 1 for ascending, -1 for descending
  overdueSortField: string = '';
  overdueSortOrder: number = 1;

  // Add these properties to track visible columns
  newProductsVisibleColumns: { [key: string]: boolean } = {};
  overdueProductsVisibleColumns: { [key: string]: boolean } = {};

  // Add these properties to track column order
  newProductsOrderedColumns: Column[] = [];
  overdueProductsOrderedColumns: Column[] = [];

  // Filter properties for new reports table columns (using arrays for multiselect)
  newReportsColumnFilters: { [key: string]: string[] } = {
    status: [],
    kunde: [],
    store: [],
    ort: [],
    besuchsdatum: [],
    vm: [],
  };

  // Filter properties for rejected reports table columns (using arrays for multiselect)
  rejectedReportsColumnFilters: { [key: string]: string[] } = {
    status: [],
    kunde: [],
    store: [],
    ort: [],
    besuchsdatum: [],
    vm: [],
  };

  // Track current filter field for popovers
  currentNewReportsFilterField: string = '';
  currentRejectedReportsFilterField: string = '';

  // ViewChild references for popovers
  @ViewChild('newReportsStatusFilterPopover') newReportsStatusFilterPopover: any;
  @ViewChild('newReportsColumnFilterPopover') newReportsColumnFilterPopover: any;
  @ViewChild('rejectedReportsStatusFilterPopover') rejectedReportsStatusFilterPopover: any;
  @ViewChild('rejectedReportsColumnFilterPopover') rejectedReportsColumnFilterPopover: any;
  @ViewChild('newProductsSettingsPopover') newProductsSettingsPopover: any;
  @ViewChild('overdueProductsSettingsPopover') overdueProductsSettingsPopover: any;

  private activeColumnFilterPopover: any = null;
  private activeSettingsPopover: any = null;

  constructor(
    private dashboardService: DashboardService,
    private reportService: ReportService,
    private clientCompanyService: ClientCompanyService,
    private toast: HotToastService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadDashboardData();
    this.initializeColumns();
  }

  loadDashboardData(): void {
    this.loading = true;
    this.error = false;

    this.dashboardService
      .getDashboardData()
      .pipe(
        catchError((error) => {
          console.error('Error loading dashboard data:', error);
          this.error = true;
          this.toast.error('Fehler beim Laden der Dashboard-Daten', {
            position: 'bottom-right',
            duration: 4000,
          });
          return of(null);
        }),
      )
      .subscribe({
        next: (data) => {
          if (data) {
            this.newReports = data.newReports || [];
            this.rejectedReports = data.rejectedReports || [];
            this.clientCompaniesAssignedAkzente = data.clientCompaniesAssignedAkzente || [];
            // Load last 4 client companies
            this.loadLast4ClientCompanies();
          }
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  loadLast4ClientCompanies(): void {
    // First load my client IDs
    this.clientCompanyService.getMyClientCompanies(1, 0).subscribe({
      next: (response) => {
        this.myClientIds = new Set(response.data.map(company => company.id));
        // Then load all clients and sort
        this.loadAndSortClients();
      },
      error: (error) => {
        console.error('Error loading my client IDs:', error);
        // Continue even if my client IDs fail to load
        this.loadAndSortClients();
      },
    });
  }
  
  loadAndSortClients(): void {
    this.clientCompanyService.getClientCompanies(1, 0).subscribe({
      next: (response) => {
        const allClients = response.data || [];
        this.totalClientCompaniesCount = allClients.length;
        
        // Sort: "mein kunden" first, then by createdAt descending
        const sortedClients = [...allClients].sort((a, b) => {
          const aIsMyClient = this.myClientIds.has(a.id);
          const bIsMyClient = this.myClientIds.has(b.id);
          
          // "Mein kunden" come first
          if (aIsMyClient && !bIsMyClient) return -1;
          if (!aIsMyClient && bIsMyClient) return 1;
          
          // If both are "mein kunden" or both are not, sort by createdAt
          const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
          const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
          return dateB - dateA; // Descending order (newest first)
        });
        
        // Take the first 4
        const last4 = sortedClients.slice(0, 4);
        
        // Calculate report counts for each client
        this.last4ClientCompanies = last4.map(client => {
          const clientId = client.id;
          const newReports = this.newReports.filter(report => 
            report.clientCompany?.id === clientId && 
            report.status?.name?.toLowerCase() === 'new'
          );
          const ongoingReports = this.newReports.filter(report => 
            report.clientCompany?.id === clientId && 
            report.status?.name?.toLowerCase() === 'ongoing'
          );
          const completedReports = this.newReports.filter(report => 
            report.clientCompany?.id === clientId && 
            report.status?.name?.toLowerCase() === 'completed'
          );
          
          // Map ClientCompany to ClientCompanyWithCounts format
          return {
            id: client.id,
            name: client.name,
            logo: client.logo ? {
              id: client.logo.id || '',
              path: client.logo.path,
            } : undefined,
            isFavorite: client.isFavorite || false,
            createdAt: client.createdAt instanceof Date ? client.createdAt.toISOString() : client.createdAt,
            updatedAt: client.updatedAt instanceof Date ? client.updatedAt.toISOString() : client.updatedAt,
            reportCounts: {
              newReports: newReports.length,
              ongoingReports: ongoingReports.length,
              completedReports: completedReports.length,
            },
          } as ClientCompanyWithCounts;
        });
      },
      error: (error) => {
        console.error('Error loading client companies:', error);
      },
    });
  }
  
  isMyClient(clientId: number): boolean {
    return this.myClientIds.has(clientId);
  }

  initializeColumns(): void {
    this.cols = [
      { field: 'kunde', header: 'Kunde' },
      { field: 'store', header: 'Store' },
      { field: 'ort', header: 'Ort' },
      { field: 'besuchsdatum', header: 'Besuchsdatum' },
      { field: 'vm', header: 'VM' },
    ];

    // Initialize all columns as visible
    this.initializeVisibleColumns();

    // Initialize ordered columns
    this.newProductsOrderedColumns = [...this.cols];
    this.overdueProductsOrderedColumns = [...this.cols];

    // Keep these for backward compatibility
    this.newProductsColumns = [...this.cols];
    this.overdueProductsColumns = [...this.cols];
    this.selectedColumns = this.cols;
  }

  addSampleDataForColumns() {
    // Add missing fields to match column definitions
    this.products.forEach((product, index) => {
      product['kunde'] = 'Kunde ' + product.id.substring(2);
      product['store'] = 'Store ' + product.id.substring(3);
      product['ort'] = ['Berlin', 'München', 'Hamburg', 'Köln', 'Frankfurt'][Math.floor(Math.random() * 5)];
      product['besuchsdatum'] = `${Math.floor(Math.random() * 28) + 1}.${Math.floor(Math.random() * 12) + 1}.2025`;
      product['vm'] = ['Schmidt', 'Müller', 'Fischer', 'Weber', 'Meyer'][Math.floor(Math.random() * 5)];
      product.isFavorite = index % 3 === 0; // Add random favorite status for demo
    });
  }

  // Helper methods for dashboard data
  getReportKunde(report: DashboardReport): string {
    return report.clientCompany?.name || '-';
  }

  getReportStore(report: DashboardReport): string {
    return report.branch?.name || '-';
  }

  getReportOrt(report: DashboardReport): string {
    const street = report.street || '';
    const zip = report.zipCode || '';
    return [street, zip].filter(Boolean).join(', ') || '-';
  }

  getReportBesuchsdatum(report: DashboardReport): string {
    return report.visitDate || '-';
  }

  getReportVM(report: DashboardReport): string {
    if (report.merchandiser?.user) {
      const user = report.merchandiser.user;
      return [user.firstName, user.lastName].filter(Boolean).join(' ') || '-';
    }
    return '-';
  }

  getReportVMEmail(report: DashboardReport): string {
    return report.merchandiser?.user?.email || '-';
  }

  getReportStatus(report: DashboardReport): string {
    return report.status?.name || '-';
  }
  // Handle favorite toggle for reports
  onFavoriteChanged(newStatus: boolean, report: DashboardReport): void {
    console.log('🔄 Toggling report favorite status:', { id: report.id, newStatus });

    // Optimistically update the UI
    const previousStatus = report.isFavorite;
    report.isFavorite = newStatus;

    // Call backend to toggle favorite status
    this.reportService
      .toggleFavoriteStatus(report.id)
      .pipe(
        catchError((error) => {
          console.error('❌ Error toggling report favorite status:', error);

          // Revert the optimistic update on error
          report.isFavorite = previousStatus;

          this.toast.error('Fehler beim Aktualisieren der Favoriten', {
            position: 'bottom-right',
            duration: 4000,
          });

          return of(null);
        }),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            console.log('✅ Report favorite status updated:', result);

            // Update the status based on server response
            report.isFavorite = result.isFavorite;

            this.toast.success(result.message, {
              position: 'bottom-right',
              duration: 2000,
            });
          }
        },
      });
  }

  // Handle favorite toggle for client companies
  onCardFavoriteChanged(newStatus: boolean, client: ClientCompanyWithCounts): void {
    console.log('🔄 Toggling client favorite status:', { id: client.id, newStatus });

    // Optimistically update the UI
    const previousStatus = client.isFavorite;
    client.isFavorite = newStatus;

    // Call backend to toggle favorite status
    this.clientCompanyService
      .toggleFavoriteStatus(client.id)
      .pipe(
        catchError((error) => {
          console.error('❌ Error toggling client favorite status:', error);

          // Revert the optimistic update on error
          client.isFavorite = previousStatus;

          this.toast.error('Fehler beim Aktualisieren der Favoriten', {
            position: 'bottom-right',
            duration: 4000,
          });

          return of(null);
        }),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            console.log('✅ Client favorite status updated:', result);

            // Update the status based on server response
            client.isFavorite = result.isFavorite;

            this.toast.success(result.message, {
              position: 'bottom-right',
              duration: 2000,
            });
          }
        },
      });
  }

  // Add these methods for handling sort
  onSort(field: string): void {
    if (this.sortField === field) {
      this.sortOrder = this.sortOrder * -1;
    } else {
      this.sortField = field;
      this.sortOrder = 1;
    }
  }

  onOverdueSort(field: string): void {
    if (this.overdueSortField === field) {
      this.overdueSortOrder = this.overdueSortOrder * -1;
    } else {
      this.overdueSortField = field;
      this.overdueSortOrder = 1;
    }
  }

  // Initialize visible columns
  initializeVisibleColumns() {
    // Set all columns to visible by default
    this.cols.forEach((col) => {
      this.newProductsVisibleColumns[col.field] = true;
      this.overdueProductsVisibleColumns[col.field] = true;
    });
  }

  // Get visible columns for new products
  getNewProductsVisibleColumns(): Column[] {
    // Return ordered columns that are visible
    return this.newProductsOrderedColumns.filter((col) => this.newProductsVisibleColumns[col.field]);
  }

  // Get visible columns for overdue products
  getOverdueProductsVisibleColumns(): Column[] {
    // Return ordered columns that are visible
    return this.overdueProductsOrderedColumns.filter((col) => this.overdueProductsVisibleColumns[col.field]);
  }

  // Update visible columns when selection changes in multiselect
  onNewProductsColumnsChange(selectedColumns: Column[]) {
    // Reset all to false
    Object.keys(this.newProductsVisibleColumns).forEach((key) => {
      this.newProductsVisibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.newProductsVisibleColumns[col.field] = true;
    });
  }

  // Update visible columns when selection changes in multiselect
  onOverdueProductsColumnsChange(selectedColumns: Column[]) {
    // Reset all to false
    Object.keys(this.overdueProductsVisibleColumns).forEach((key) => {
      this.overdueProductsVisibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.overdueProductsVisibleColumns[col.field] = true;
    });
  }

  // Add event handlers for column reordering
  onNewProductsColReorder(event: any) {
    // The event structure from PrimeNG contains dragIndex and dropIndex
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      // Get the column that was moved
      const movedColumn = this.newProductsOrderedColumns[event.dragIndex];

      // Create a new array without the moved column
      const newOrderedColumns = [...this.newProductsOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);

      // Insert the moved column at the drop index
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);

      // Update the ordered columns with the new order
      this.newProductsOrderedColumns = newOrderedColumns;
    }
  }

  onOverdueProductsColReorder(event: any) {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      // Get the column that was moved
      const movedColumn = this.overdueProductsOrderedColumns[event.dragIndex];

      // Create a new array without the moved column
      const newOrderedColumns = [...this.overdueProductsOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);

      // Insert the moved column at the drop index
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);

      // Update the ordered columns with the new order
      this.overdueProductsOrderedColumns = newOrderedColumns;
    }
  }

  openReportInNewTab(report: DashboardReport): void {
    const urlTree = this.router.createUrlTree(['/clients', report.clientCompany?.id, 'projects', report.project?.id, 'reports', report.id], {
      queryParams: { referrer: 'dashboard', reportStatus: report.status?.name || '' },
    });
    const url = window.location.origin + urlTree.toString();
    window.open(url, '_blank');
  }

  openReportEditInNewTab(report: DashboardReport): void {
    const urlTree = this.router.createUrlTree(['/clients', report.clientCompany?.id, 'projects', report.project?.id, 'edit-report', report.id], { queryParams: { referrer: 'dashboard' } });
    const url = window.location.origin + urlTree.toString();
    window.open(url, '_blank');
  }

  openClientInNewTab(clientId: number, queryParams?: Record<string, any>): void {
    const urlTree = this.router.createUrlTree(['/clients', clientId], { queryParams: queryParams || {} });
    const url = window.location.origin + urlTree.toString();
    window.open(url, '_blank');
  }

  onReportContextMenu(event: MouseEvent, report: DashboardReport): boolean {
    event.preventDefault();
    event.stopPropagation();
    this.openReportInNewTab(report);
    return false;
  }

  onReportEditContextMenu(event: MouseEvent, report: DashboardReport): boolean {
    event.preventDefault();
    event.stopPropagation();
    this.openReportEditInNewTab(report);
    return false;
  }

  onClientContextMenu(event: MouseEvent, clientId: number, queryParams?: Record<string, any>): boolean {
    event.preventDefault();
    event.stopPropagation();
    this.openClientInNewTab(clientId, queryParams);
    return false;
  }

  onClientListContextMenu(event: MouseEvent): boolean {
    event.preventDefault();
    const urlTree = this.router.createUrlTree(['/clients', 'list']);
    const url = window.location.origin + urlTree.toString();
    window.open(url, '_blank');
    return false;
  }

  // Get filtered new reports based on column filters
  getFilteredNewReports(): DashboardReport[] {
    if (!this.newReports) {
      return [];
    }
    const filtered = this.newReports.filter((report) => {
      const statusFilter = this.newReportsColumnFilters['status'];
      if (statusFilter && statusFilter.length > 0 && !statusFilter.includes(report.status?.name || '')) {
        return false;
      }
      const kundeFilter = this.newReportsColumnFilters['kunde'];
      if (kundeFilter && kundeFilter.length > 0 && !kundeFilter.includes(this.getReportKunde(report))) {
        return false;
      }
      const storeFilter = this.newReportsColumnFilters['store'];
      if (storeFilter && storeFilter.length > 0 && !storeFilter.includes(this.getReportStore(report))) {
        return false;
      }
      const ortFilter = this.newReportsColumnFilters['ort'];
      if (ortFilter && ortFilter.length > 0 && !ortFilter.includes(this.getReportOrt(report))) {
        return false;
      }
      const vmFilter = this.newReportsColumnFilters['vm'];
      if (vmFilter && vmFilter.length > 0 && !vmFilter.includes(this.getReportVM(report))) {
        return false;
      }
      return true;
    });

    return this.applyReportSorting(filtered, this.sortField, this.sortOrder);
  }

  // Get filtered rejected reports based on column filters
  getFilteredRejectedReports(): DashboardReport[] {
    if (!this.rejectedReports) {
      return [];
    }
    const filtered = this.rejectedReports.filter((report) => {
      const statusFilter = this.rejectedReportsColumnFilters['status'];
      if (statusFilter && statusFilter.length > 0 && !statusFilter.includes(report.status?.name || '')) {
        return false;
      }
      const kundeFilter = this.rejectedReportsColumnFilters['kunde'];
      if (kundeFilter && kundeFilter.length > 0 && !kundeFilter.includes(this.getReportKunde(report))) {
        return false;
      }
      const storeFilter = this.rejectedReportsColumnFilters['store'];
      if (storeFilter && storeFilter.length > 0 && !storeFilter.includes(this.getReportStore(report))) {
        return false;
      }
      const ortFilter = this.rejectedReportsColumnFilters['ort'];
      if (ortFilter && ortFilter.length > 0 && !ortFilter.includes(this.getReportOrt(report))) {
        return false;
      }
      const vmFilter = this.rejectedReportsColumnFilters['vm'];
      if (vmFilter && vmFilter.length > 0 && !vmFilter.includes(this.getReportVM(report))) {
        return false;
      }
      return true;
    });

    return this.applyReportSorting(filtered, this.overdueSortField, this.overdueSortOrder);
  }

  // Get unique values for filter dropdowns - New Reports
  getNewReportsFilterOptions(field: string): string[] {
    const values = new Set<string>();
    this.newReports.forEach((report) => {
      let value: string = '';
      switch (field) {
        case 'status':
          value = report.status?.name || '';
          break;
        case 'kunde':
          value = this.getReportKunde(report);
          break;
        case 'store':
          value = this.getReportStore(report);
          break;
        case 'ort':
          value = this.getReportOrt(report);
          break;
        case 'vm':
          value = this.getReportVM(report);
          break;
      }
      if (value && value !== '-') {
        values.add(value);
      }
    });
    return Array.from(values).sort();
  }

  // Get unique values for filter dropdowns - Rejected Reports
  getRejectedReportsFilterOptions(field: string): string[] {
    const values = new Set<string>();
    this.rejectedReports.forEach((report) => {
      let value: string = '';
      switch (field) {
        case 'status':
          value = report.status?.name || '';
          break;
        case 'kunde':
          value = this.getReportKunde(report);
          break;
        case 'store':
          value = this.getReportStore(report);
          break;
        case 'ort':
          value = this.getReportOrt(report);
          break;
        case 'vm':
          value = this.getReportVM(report);
          break;
      }
      if (value && value !== '-') {
        values.add(value);
      }
    });
    return Array.from(values).sort();
  }

  // Reset column filters for new reports
  resetNewReportsColumnFilters(): void {
    this.newReportsColumnFilters = {
      status: [],
      kunde: [],
      store: [],
      ort: [],
      besuchsdatum: [],
      vm: [],
    };
  }

  clearNewReportsFilters(event?: Event): void {
    event?.stopPropagation();
    this.resetNewReportsColumnFilters();
    this.closeAllFilterPopovers();
  }

  hasActiveNewReportsFilters(): boolean {
    return Object.values(this.newReportsColumnFilters).some((values) => Array.isArray(values) && values.length > 0);
  }

  // Reset column filters for rejected reports
  resetRejectedReportsColumnFilters(): void {
    this.rejectedReportsColumnFilters = {
      status: [],
      kunde: [],
      store: [],
      ort: [],
      besuchsdatum: [],
      vm: [],
    };
  }

  clearRejectedReportsFilters(event?: Event): void {
    event?.stopPropagation();
    this.resetRejectedReportsColumnFilters();
    this.closeAllFilterPopovers();
  }

  hasActiveRejectedReportsFilters(): boolean {
    return Object.values(this.rejectedReportsColumnFilters).some((values) => Array.isArray(values) && values.length > 0);
  }

  hasActiveDashboardFilters(): boolean {
    return (
      this.hasActiveNewReportsFilters() ||
      this.hasActiveRejectedReportsFilters() ||
      !!this.sortField ||
      !!this.overdueSortField
    );
  }

  clearDashboardFilters(): void {
    this.resetNewReportsColumnFilters();
    this.resetRejectedReportsColumnFilters();
    this.sortField = '';
    this.sortOrder = 1;
    this.overdueSortField = '';
    this.overdueSortOrder = 1;
    this.closeAllFilterPopovers();
  }

  // Get filter value for a column (for checking if filter is active)
  getNewReportsColumnFilterValue(field: string): string[] {
    return this.newReportsColumnFilters[field] || [];
  }

  getRejectedReportsColumnFilterValue(field: string): string[] {
    return this.rejectedReportsColumnFilters[field] || [];
  }

  /**
   * Close all filter popovers
   */
  closeAllFilterPopovers(): void {
    this.hideStatusFilterPopovers();

    if (this.newReportsColumnFilterPopover) {
      this.newReportsColumnFilterPopover.hide();
    }
    if (this.rejectedReportsColumnFilterPopover) {
      this.rejectedReportsColumnFilterPopover.hide();
    }

    if (this.activeColumnFilterPopover) {
      this.activeColumnFilterPopover.hide();
      this.activeColumnFilterPopover = null;
    }

    this.hideSettingsPopovers();
  }

  private hideStatusFilterPopovers(): void {
    if (this.newReportsStatusFilterPopover) {
      this.newReportsStatusFilterPopover.hide();
    }
    if (this.rejectedReportsStatusFilterPopover) {
      this.rejectedReportsStatusFilterPopover.hide();
    }
  }

  private hideOtherColumnFilterPopover(popoverToShow: any): void {
    if (this.activeColumnFilterPopover && this.activeColumnFilterPopover !== popoverToShow) {
      this.activeColumnFilterPopover.hide();
      this.activeColumnFilterPopover = null;
    }
  }

  private hideSettingsPopovers(except?: any): void {
    if (this.newProductsSettingsPopover && this.newProductsSettingsPopover !== except) {
      this.newProductsSettingsPopover.hide();
    }
    if (this.overdueProductsSettingsPopover && this.overdueProductsSettingsPopover !== except) {
      this.overdueProductsSettingsPopover.hide();
    }
    if (!except || (this.activeSettingsPopover && this.activeSettingsPopover !== except)) {
      this.activeSettingsPopover = null;
    }
  }

  private showColumnFilterPopover(popoverRef: any, targetElement: HTMLElement): void {
    if (!popoverRef || !targetElement) {
      return;
    }

    const positioningEvent = {
      currentTarget: targetElement,
      target: targetElement,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as any;

    // Check if the popover is already open
    const wasOpen = this.activeColumnFilterPopover === popoverRef;
    
    // If it was open, close it first
    if (wasOpen) {
      popoverRef.hide();
      this.activeColumnFilterPopover = null;
    }

    // PrimeNG needs a short delay to finish closing animations before reopening the same popover
    // Use a longer delay if the popover was already open to ensure it closes properly
    setTimeout(() => {
      popoverRef.show(positioningEvent);
      this.activeColumnFilterPopover = popoverRef;
    }, wasOpen ? 150 : 50);
  }

  toggleSettingsPopover(popoverRef: any, event: Event): void {
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!popoverRef || !targetElement) {
      return;
    }

    event.stopPropagation();

    if (this.activeSettingsPopover === popoverRef) {
      popoverRef.hide();
      this.activeSettingsPopover = null;
      return;
    }

    this.hideStatusFilterPopovers();
    this.newReportsColumnFilterPopover?.hide();
    this.rejectedReportsColumnFilterPopover?.hide();
    this.hideOtherColumnFilterPopover(null);
    this.hideSettingsPopovers(popoverRef);

    const positioningEvent = {
      currentTarget: targetElement,
      target: targetElement,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as any;

    popoverRef.hide();

    setTimeout(() => {
      popoverRef.show(positioningEvent);
      this.activeSettingsPopover = popoverRef;
    }, 120);
  }

  onSettingsPopoverClose(popoverRef: any, event?: Event): void {
    event?.stopPropagation();
    if (popoverRef) {
      popoverRef.hide();
      if (this.activeSettingsPopover === popoverRef) {
        this.activeSettingsPopover = null;
      }
    }
  }

  /**
   * Handle click outside to close popovers
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    // Check if click is inside a popover panel
    const isClickInsidePopover = target.closest('.p-popover') !== null || 
                                 target.closest('[data-pc-section="content"]') !== null;
    
    // Check if click is on a filter icon (SVG with filter icon)
    const isClickOnFilterIcon = target.closest('svg[stroke="currentColor"]') !== null &&
                                 target.closest('svg[stroke="currentColor"]')?.closest('.cursor-pointer') !== null;
    
    // Check if click is on PrimeNG multiselect or dropdown
    const isClickOnPrimeComponent = target.closest('p-multiselect') !== null ||
                    target.closest('p-dropdown') !== null ||
                    target.closest('.p-multiselect') !== null ||
                    target.closest('.p-dropdown') !== null ||
                    target.closest('.p-multiselect-panel') !== null ||
                    target.closest('.p-dropdown-panel') !== null ||
                    target.closest('p-popover') !== null;
    
    // If click is not inside popover, not on filter icon, and not on PrimeNG component, close all popovers
    if (!isClickInsidePopover && !isClickOnFilterIcon && !isClickOnPrimeComponent) {
      this.closeAllFilterPopovers();
    }
  }

  // Open filter popover for a specific column
  openNewReportsColumnFilter(field: string, event: Event): void {
    event.stopPropagation();
    
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;

    if (!targetElement) {
      return;
    }

    // Close settings popover if open
    this.hideSettingsPopovers();
    this.hideStatusFilterPopovers();
    
    // Check if the same field is already open
    const isSameField = this.currentNewReportsFilterField === field;
    const isPopoverOpen = this.activeColumnFilterPopover === this.newReportsColumnFilterPopover;
    
    // If clicking on the same field that's already open, just close it
    if (isSameField && isPopoverOpen) {
      this.newReportsColumnFilterPopover.hide();
      this.activeColumnFilterPopover = null;
      return;
    }
    
    // Close any other open filter popover (from either table)
    if (this.activeColumnFilterPopover) {
      this.activeColumnFilterPopover.hide();
      this.activeColumnFilterPopover = null;
    }
    
    // Update the current filter field
    this.currentNewReportsFilterField = field;
    
    // Open the popover with the new field
    this.showColumnFilterPopover(this.newReportsColumnFilterPopover, targetElement);
  }

  openRejectedReportsColumnFilter(field: string, event: Event): void {
    event.stopPropagation();
    
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;

    if (!targetElement) {
      return;
    }

    // Close settings popover if open
    this.hideSettingsPopovers();
    this.hideStatusFilterPopovers();
    
    // Check if the same field is already open
    const isSameField = this.currentRejectedReportsFilterField === field;
    const isPopoverOpen = this.activeColumnFilterPopover === this.rejectedReportsColumnFilterPopover;
    
    // If clicking on the same field that's already open, just close it
    if (isSameField && isPopoverOpen) {
      this.rejectedReportsColumnFilterPopover.hide();
      this.activeColumnFilterPopover = null;
      return;
    }
    
    // Close any other open filter popover (from either table)
    if (this.activeColumnFilterPopover) {
      this.activeColumnFilterPopover.hide();
      this.activeColumnFilterPopover = null;
    }
    
    // Update the current filter field
    this.currentRejectedReportsFilterField = field;
    
    // Open the popover with the new field
    this.showColumnFilterPopover(this.rejectedReportsColumnFilterPopover, targetElement);
  }

  /**
   * Handle new reports filter popover close
   */
  onNewReportsFilterPopoverClose(): void {
    if (this.newReportsColumnFilterPopover) {
      this.newReportsColumnFilterPopover.hide();
    }
    if (this.activeColumnFilterPopover === this.newReportsColumnFilterPopover) {
      this.activeColumnFilterPopover = null;
    }
  }

  /**
   * Handle rejected reports filter popover close
   */
  onRejectedReportsFilterPopoverClose(): void {
    if (this.rejectedReportsColumnFilterPopover) {
      this.rejectedReportsColumnFilterPopover.hide();
    }
    if (this.activeColumnFilterPopover === this.rejectedReportsColumnFilterPopover) {
      this.activeColumnFilterPopover = null;
    }
  }

  // Check if any column filters are active
  hasNewReportsColumnFilters(): boolean {
    return Object.values(this.newReportsColumnFilters).some(filters => filters.length > 0);
  }

  hasRejectedReportsColumnFilters(): boolean {
    return Object.values(this.rejectedReportsColumnFilters).some(filters => filters.length > 0);
  }

  // Get column header for a field
  getColumnHeader(field: string): string {
    const col = this.cols.find(c => c.field === field);
    return col ? col.header : field;
  }

  getClientReportCount(client: ClientCompanyWithCounts, key: keyof ReportCounts): number {
    return client.reportCounts?.[key] ?? 0;
  }

  hasClientReports(client: ClientCompanyWithCounts, key: keyof ReportCounts): boolean {
    return this.getClientReportCount(client, key) > 0;
  }

  onClientReportLinkClick(event: Event, client: ClientCompanyWithCounts, key: keyof ReportCounts): void {
    if (!this.hasClientReports(client, key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private applyReportSorting(reports: DashboardReport[], field: string, order: number): DashboardReport[] {
    if (!field) {
      return reports;
    }

    const sorted = [...reports];
    sorted.sort((a, b) => {
      const valueA = this.getReportSortValue(a, field);
      const valueB = this.getReportSortValue(b, field);

      if (valueA === valueB) {
        return 0;
      }

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return valueA < valueB ? order * -1 : order;
      }

      const normalizedA = (valueA ?? '').toString().toLowerCase();
      const normalizedB = (valueB ?? '').toString().toLowerCase();
      return order * normalizedA.localeCompare(normalizedB, 'de', { sensitivity: 'base' });
    });

    return sorted;
  }

  private getReportSortValue(report: DashboardReport, field: string): string | number {
    switch (field) {
      case 'inventoryStatus':
      case 'status':
        return this.getReportStatus(report);
      case 'kunde':
        return this.getReportKunde(report);
      case 'store':
        return this.getReportStore(report);
      case 'ort':
        return this.getReportOrt(report);
      case 'vm':
        return this.getReportVM(report);
      case 'besuchsdatum':
        return report.visitDate ? new Date(report.visitDate).getTime() : 0;
      default:
        return (report as any)[field] ?? '';
    }
  }
}
