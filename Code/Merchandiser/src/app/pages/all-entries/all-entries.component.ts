import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
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
import { DateRangePickerComponent } from '../../shared/components/date-range-picker/date-range-picker.component';
import { ReportService, Report } from '@app/@core/services/report.service';
import { finalize } from 'rxjs/operators';

// Column interface for table configuration
interface Column {
  field: string;
  header: string;
}

@Component({
  selector: 'app-all-entries',
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
    DateRangePickerComponent,
  ],
  templateUrl: './all-entries.component.html',
  styleUrl: './all-entries.component.scss',
})
export class AllEntriesComponent implements OnInit, AfterViewInit {
  // Search functionality
  searchQuery: string = '';
  showAllFiliales: boolean = false;

  // Table state
  expandedRows: { [key: string]: boolean } = {};

  // Change from mock data to real report data
  allReports: Report[] = []; // All reports from API
  reports: Report[] = []; // Filtered reports

  // Update column structure to match report data
  cols: Column[] = [];
  selectedColumns: Column[] = [];
  orderedColumns: Column[] = [];
  visibleColumns: { [key: string]: boolean } = {};

  // Add filter properties
  projectSearchTerm: string = '';
  filialeSearchTerm: string = '';
  dateRange2 = { start: null, end: null };

  // Report filters
  reportStatusFilter: string[] = [];
  reportMerchandiserFilter: string[] = [];
  reportFilialenFilter: string[] = [];
  
  // Generic filter properties
  genericFilterValues: { [field: string]: string[] } = {};
  currentFilterField: string = '';

  // Loading state
  isLoading: boolean = false;
  error: string | null = null;

  @ViewChild('genericFilterPopover') genericFilterPopover: any;
  @ViewChild('statusFilterPopover') statusFilterPopover: any;
  @ViewChild('merchandiserFilterPopover') merchandiserFilterPopover: any;
  @ViewChild('filialenFilterPopover') filialenFilterPopover: any;
  @ViewChild('columnsPopover') columnsPopover: any;
  
  private activeFilterPopover: any = null;
  private activeSettingsPopover: any = null;

  constructor(
    private router: Router,
    private reportService: ReportService,
  ) {}

  ngOnInit(): void {
    // Initialize filters
    this.reportStatusFilter = [];
    this.reportMerchandiserFilter = [];
    this.reportFilialenFilter = [];
    
    this.loadReports();
    this.initializeColumns();
  }

  ngAfterViewInit(): void {
    // Debug: Check if popover references are available
    console.log('Popover references initialized:', {
      genericFilterPopover: !!this.genericFilterPopover,
      statusFilterPopover: !!this.statusFilterPopover,
      filialenFilterPopover: !!this.filialenFilterPopover,
      merchandiserFilterPopover: !!this.merchandiserFilterPopover,
      columnsPopover: !!this.columnsPopover
    });
  }

  // Load reports from API instead of mock data
  loadReports(): void {
    this.isLoading = true;
    this.error = null;

    this.reportService
      .getMerchandiserReports()
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (reports) => {
          this.allReports = reports;
          this.reports = [...reports];
          console.log('Loaded reports:', reports);
        },
        error: (error) => {
          this.error = 'Failed to load reports. Please try again.';
          console.error('Error loading reports:', error);
          // Fallback to empty array
          this.allReports = [];
          this.reports = [];
        },
      });
  }

  // Update column structure to match report data
  initializeColumns(): void {
    this.cols = [
      { field: 'plannedOn', header: 'Geplant' },
      { field: 'merchandiser.user.firstName', header: 'Merchandiser' },
      { field: 'branch.name', header: 'Filiale' },
      { field: 'street', header: 'Adresse' },
      { field: 'note', header: 'Notiz' },
      { field: 'reportTo', header: 'Report bis' },
      { field: 'isSpecCompliant', header: 'Alles nach Vorgabe?' },
      { field: 'feedback', header: 'Feedback' },
    ];

    // Initialize selectedColumns with visible columns (keep the same old columns visible)
    this.selectedColumns = [...this.cols]; // Show all columns by default
    this.orderedColumns = [...this.cols];
    this.initializeVisibleColumns();
  }

  // Initialize visible columns
  initializeVisibleColumns(): void {
    this.cols.forEach((col) => {
      // Show all columns by default (keep the same old columns visible)
      this.visibleColumns[col.field] = true;
    });
  }

  // Get visible columns for the table
  getVisibleColumns(): Column[] {
    return this.orderedColumns.filter((col) => this.visibleColumns[col.field]);
  }

  // Handle column reordering for the table
  onColReorder(event: any): void {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      const movedColumn = this.orderedColumns[event.dragIndex];
      const newOrderedColumns = [...this.orderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);
      this.orderedColumns = newOrderedColumns;
    }
  }

  // Update visible columns
  onColumnsChange(selectedColumns: Column[]): void {
    // Reset all to false
    Object.keys(this.visibleColumns).forEach((key) => {
      this.visibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.visibleColumns[col.field] = true;
    });

    // Update the selectedColumns for backward compatibility
    this.selectedColumns = selectedColumns;
  }

  // Update filter methods to work with report data
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

  clearProjectSearch(): void {
    this.projectSearchTerm = '';
    this.applyFilters();
  }

  clearFilialeSearch(): void {
    this.filialeSearchTerm = '';
    this.applyFilters();
  }

  onRangeSelected(range: { start: Date | null; end: Date | null }) {
    console.log('Selected range:', range);
    this.dateRange2 = range;
    this.applyFilters();
  }

  // Update the applyFilters method for report data
  applyFilters(): void {
    let filteredReports = [...this.allReports];

    // Apply column status filter (multiple selection)
    if (this.reportStatusFilter && Array.isArray(this.reportStatusFilter) && this.reportStatusFilter.length > 0) {
      filteredReports = filteredReports.filter((report) => {
        return report.status?.name && this.reportStatusFilter.includes(report.status.name);
      });
    }

    // Apply column merchandiser filter (multiple selection)
    if (this.reportMerchandiserFilter && Array.isArray(this.reportMerchandiserFilter) && this.reportMerchandiserFilter.length > 0) {
      filteredReports = filteredReports.filter((report) => {
        const merchandiserName = `${report.merchandiser?.user?.firstName || ''} ${report.merchandiser?.user?.lastName || ''}`.trim();
        return merchandiserName && this.reportMerchandiserFilter.includes(merchandiserName);
      });
    }

    // Apply column filialen filter (multiple selection)
    if (this.reportFilialenFilter && Array.isArray(this.reportFilialenFilter) && this.reportFilialenFilter.length > 0) {
      filteredReports = filteredReports.filter((report) => {
        return report.branch?.name && this.reportFilialenFilter.includes(report.branch.name);
      });
    }

    // Apply generic column filters
    Object.keys(this.genericFilterValues).forEach((field) => {
      const filterValues = this.genericFilterValues[field];
      if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filteredReports = filteredReports.filter((report) => {
          const value = this.getReportFieldValue(report, field);
          return value && filterValues.includes(value);
        });
      }
    });

    // Apply project-related filters (search in multiple fields)
    if (this.projectSearchTerm) {
      filteredReports = filteredReports.filter(
        (report) =>
          report.title?.toLowerCase().includes(this.projectSearchTerm) ||
          report.description?.toLowerCase().includes(this.projectSearchTerm) ||
          (typeof report.status === 'string' ? report.status : report.status?.name)?.toLowerCase().includes(this.projectSearchTerm) ||
          report.project?.name?.toLowerCase().includes(this.projectSearchTerm) ||
          report.id?.toString().includes(this.projectSearchTerm),
      );
    }

    // Apply filiale filter (search in branch name and address)
    if (this.filialeSearchTerm) {
      filteredReports = filteredReports.filter(
        (report) =>
          report.branch?.name?.toLowerCase().includes(this.filialeSearchTerm) ||
          report.street?.toLowerCase().includes(this.filialeSearchTerm) ||
          report.zipCode?.toLowerCase().includes(this.filialeSearchTerm),
      );
    }

    // Apply date range filter (filter by plannedOn)
    if (this.dateRange2.start && this.dateRange2.end) {
      filteredReports = filteredReports.filter((report) => {
        if (!report.plannedOn) return false;

        const reportDate = new Date(report.plannedOn);
        const startDate = new Date(this.dateRange2.start!);
        const endDate = new Date(this.dateRange2.end!);

        // Reset time to compare only dates
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        reportDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues

        return reportDate >= startDate && reportDate <= endDate;
      });
    }

    this.reports = filteredReports;
    console.log('Filtered reports:', this.reports.length, 'out of', this.allReports.length);
  }

  // Improve the German date parsing
  private parseGermanDate(dateString: string): Date | null {
    try {
      if (!dateString || dateString.trim() === '') return null;

      // Handle German date format DD.MM.YYYY
      const parts = dateString.trim().split('.');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Month is 0-based in JavaScript
        const year = parseInt(parts[2], 10);

        // Validate the date parts
        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
        if (day < 1 || day > 31 || month < 0 || month > 11 || year < 1900 || year > 2100) return null;

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
    this.reports = [...this.allReports];
  }

  // Sorting state
  sortField: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Add methods that match client-details functionality
  onSort(field: string): void {
    console.log(`Sorting by ${field}`, this.sortField, this.sortDirection);

    // Toggle sort direction for the field
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }

    console.log(`New sort: ${this.sortField} ${this.sortDirection}`);

    // Sort the reports array
    this.reports.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      // Handle special cases based on how they're displayed in the template
      if (field === 'status') {
        // Sort by the status name directly
        aValue = (typeof a.status === 'string' ? a.status : a.status?.name) || '';
        bValue = (typeof b.status === 'string' ? b.status : b.status?.name) || '';
        console.log(`Status sorting: ${aValue} vs ${bValue}`);
      } else if (field === 'isSpecCompliant') {
        // Sort by the displayed text (Ja, Nein)
        aValue = a.isSpecCompliant ? 'Ja' : 'Nein';
        bValue = b.isSpecCompliant ? 'Ja' : 'Nein';
        console.log(`isSpecCompliant sorting: ${aValue} vs ${bValue}`);
      } else if (field === 'feedback') {
        // Sort by the displayed text (Ja, Nein)
        aValue = a.feedback === 'true' ? 'Ja' : 'Nein';
        bValue = b.feedback === 'true' ? 'Ja' : 'Nein';
        console.log(`Feedback sorting: ${aValue} vs ${bValue}`);
      } else if (field === 'plannedOn') {
        // Sort by date
        aValue = a.plannedOn ? new Date(a.plannedOn).getTime() : 0;
        bValue = b.plannedOn ? new Date(b.plannedOn).getTime() : 0;
        console.log(`PlannedOn sorting: ${aValue} vs ${bValue}`);
      } else if (field === 'merchandiser.user.firstName') {
        // Sort by merchandiser name (first + last)
        aValue = `${a.merchandiser?.user?.firstName || ''} ${a.merchandiser?.user?.lastName || ''}`.trim();
        bValue = `${b.merchandiser?.user?.firstName || ''} ${b.merchandiser?.user?.lastName || ''}`.trim();
      } else if (field === 'branch.name') {
        // Sort by branch name
        aValue = a.branch?.name || '';
        bValue = b.branch?.name || '';
        console.log(`Branch sorting: ${aValue} vs ${bValue}`);
      } else {
        // Default: use the raw field value
        aValue = a[field as keyof Report];
        bValue = b[field as keyof Report];
        console.log(`${field} sorting: ${aValue} vs ${bValue}`);
      }

      // Handle string comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        return this.sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return this.sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    // Also sort the allReports to maintain consistency
    this.allReports.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      // Handle special cases based on how they're displayed in the template
      if (field === 'status') {
        // Sort by the status name directly
        aValue = (typeof a.status === 'string' ? a.status : a.status?.name) || '';
        bValue = (typeof b.status === 'string' ? b.status : b.status?.name) || '';
      } else if (field === 'isSpecCompliant') {
        // Sort by the displayed text (Ja, Nein)
        aValue = a.isSpecCompliant ? 'Ja' : 'Nein';
        bValue = b.isSpecCompliant ? 'Ja' : 'Nein';
      } else if (field === 'feedback') {
        // Sort by the displayed text (Ja, Nein)
        aValue = a.feedback === 'true' ? 'Ja' : 'Nein';
        bValue = b.feedback === 'true' ? 'Ja' : 'Nein';
      } else if (field === 'plannedOn') {
        // Sort by date
        aValue = a.plannedOn ? new Date(a.plannedOn).getTime() : 0;
        bValue = b.plannedOn ? new Date(b.plannedOn).getTime() : 0;
      } else if (field === 'merchandiser.user.firstName') {
        // Sort by merchandiser name (first + last)
        aValue = `${a.merchandiser?.user?.firstName || ''} ${a.merchandiser?.user?.lastName || ''}`.trim();
        bValue = `${b.merchandiser?.user?.firstName || ''} ${b.merchandiser?.user?.lastName || ''}`.trim();
      } else if (field === 'branch.name') {
        // Sort by branch name
        aValue = a.branch?.name || '';
        bValue = b.branch?.name || '';
      } else {
        // Default: use the raw field value
        aValue = a[field as keyof Report];
        bValue = b[field as keyof Report];
      }

      // Handle string comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        return this.sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return this.sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  onFavoriteChanged(isFavorite: boolean, report: Report): void {
    report.isFavorite = isFavorite;
    console.log(`Report ${report.title} favorite status: ${isFavorite}`);

    // Call API to update favorite status
    this.reportService.toggleFavoriteStatus(report.id).subscribe({
      next: (response) => {
        console.log('Favorite status updated:', response);
      },
      error: (error) => {
        console.error('Error updating favorite status:', error);
        // Revert the change on error
        report.isFavorite = !isFavorite;
      },
    });
  }

  getStatusStyle(status: any): { bg: string; text: string } {
    // Handle both old string format and new object format
    const statusName = typeof status === 'string' ? status : status?.name;
    const statusColor = typeof status === 'object' && status?.color ? status.color : null;

    // If we have a color from the API, use it
    if (statusColor) {
      return { bg: statusColor, text: statusName };
    }

    // Fallback to predefined colors based on status name
    switch (statusName) {
      case 'NEW':
        return { bg: 'bg-[#00709B]', text: 'NEW' };
      case 'DUE':
        return { bg: 'bg-[#D10003]', text: 'DUE' };
      case 'DRAFT':
        return { bg: 'bg-[#CCAF08]', text: 'DRAFT' };
      case 'VALID':
        return { bg: 'bg-[#6FCC08]', text: 'VALID' };
      case 'IN_PROGRESS':
        return { bg: 'bg-[#00A8E9]', text: 'IN_PROGRESS' };
      case 'FINISHED':
        return { bg: 'bg-[#CCAF08]', text: 'FINISHED' };
      default:
        return { bg: 'bg-gray-400', text: statusName };
    }
  }

  // Also make sure you have filteredReports property
  get filteredReports() {
    return this.reports;
  }

  // Methods to get unique values for filters
  getUniqueReportStatuses(): any[] {
    if (!this.allReports) return [];
    
    const statusMap = new Map<string, any>();
    this.allReports.forEach((report) => {
      if (report.status && report.status.name) {
        if (!statusMap.has(report.status.name)) {
          statusMap.set(report.status.name, {
            name: report.status.name,
            color: report.status.color
          });
        }
      }
    });

    return Array.from(statusMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  getUniqueMerchandisers(): string[] {
    if (!this.allReports) return [];
    
    const merchandiserSet = new Set<string>();
    
    this.allReports.forEach((report) => {
      const merchandiserName = `${report.merchandiser?.user?.firstName || ''} ${report.merchandiser?.user?.lastName || ''}`.trim();
      if (merchandiserName && merchandiserName !== '') {
        merchandiserSet.add(merchandiserName);
      }
    });

    return Array.from(merchandiserSet).sort();
  }

  getUniqueFilialen(): string[] {
    if (!this.allReports) return [];
    
    const branchSet = new Set<string>();
    
    this.allReports.forEach((report) => {
      if (report.branch?.name) {
        branchSet.add(report.branch.name);
      }
    });

    return Array.from(branchSet).sort();
  }

  /**
   * Get unique values for a specific field across all reports
   */
  getUniqueValuesForField(field: string): string[] {
    if (!this.allReports) return [];

    const valueSet = new Set<string>();

    this.allReports.forEach((report) => {
      const value = this.getReportFieldValue(report, field);
      if (value && value !== '-' && value !== '' && value !== null && value !== undefined) {
        valueSet.add(value);
      }
    });

    return Array.from(valueSet).sort();
  }

  /**
   * Get the value of a report field for filtering
   */
  private getReportFieldValue(report: Report, field: string): string {
    if (field === 'isSpecCompliant') {
      return report.isSpecCompliant ? 'Ja' : 'Nein';
    }
    if (field === 'feedback') {
      return report.feedback === 'true' ? 'Ja' : 'Nein';
    }
    if (field === 'plannedOn') {
      return report.plannedOn || '';
    }
    if (field === 'reportTo') {
      return report.reportTo || '';
    }
    if (field === 'street') {
      return report.street || '';
    }
    if (field === 'note') {
      return report.note || '';
    }
    // Default: try to get the value directly
    const value = (report as any)[field];
    return value ? String(value) : '';
  }

  /**
   * Open generic filter popover for a field
   */
  openGenericFilter(field: string, event: Event): void {
    event.stopPropagation();
    
    // Store the actual DOM element for positioning (exactly like dashboard)
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
    const isSameField = this.currentFilterField === field;
    const isPopoverOpen = this.activeFilterPopover === this.genericFilterPopover;
    
    // If clicking on the same field that's already open, just close it
    if (isSameField && isPopoverOpen) {
      this.genericFilterPopover.hide();
      this.activeFilterPopover = null;
      this.currentFilterField = '';
      return;
    }
    
    // Check if ANY popover was open (before closing)
    const hadOpenPopover = !!this.activeFilterPopover;
    
    // Close any other open filter popover
    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }
    
    // Update the current filter field
    this.currentFilterField = field;
    
    // Initialize filter values if not exists
    if (!this.genericFilterValues[field]) {
      this.genericFilterValues[field] = [];
    }
    
    // Open the popover with the new field using show() method for better control
    if (this.genericFilterPopover) {
      // Create positioning event for PrimeNG popover
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      
      // Use longer delay if we had to close another popover first
      // This ensures the closing animation completes before opening the new one
      const delay = hadOpenPopover ? 250 : 0;
      setTimeout(() => {
        if (this.genericFilterPopover) {
          this.genericFilterPopover.show(positioningEvent);
          this.activeFilterPopover = this.genericFilterPopover;
        }
      }, delay);
    }
  }

  /**
   * Get generic filter value for a field
   */
  getGenericFilterValue(field: string): string[] {
    return this.genericFilterValues[field] || [];
  }

  /**
   * Get column header for a field
   */
  getColumnHeader(field: string): string {
    const col = this.cols.find((c) => c.field === field);
    return col ? col.header : field;
  }

  /**
   * Open status filter popover
   */
  openStatusFilter(event: Event): void {
    event.stopPropagation();
    
    // Store the actual DOM element for positioning (exactly like dashboard)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    if (!targetElement) {
      return;
    }
    
    // Close settings popover if open
    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }
    
    // Check if the same popover is already open
    const isPopoverOpen = this.activeFilterPopover === this.statusFilterPopover;
    
    // If clicking on the same filter that's already open, just close it
    if (isPopoverOpen) {
      this.statusFilterPopover.hide();
      this.activeFilterPopover = null;
      return;
    }
    
    // Check if ANY popover was open (before closing)
    const hadOpenPopover = !!this.activeFilterPopover;
    
    // Close any other open filter popover
    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }
    
    // Open the popover using show() method
    if (this.statusFilterPopover) {
      // Create positioning event for PrimeNG popover
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      
      // Use longer delay if we had to close another popover first
      const delay = hadOpenPopover ? 250 : 0;
      setTimeout(() => {
        if (this.statusFilterPopover) {
          this.statusFilterPopover.show(positioningEvent);
          this.activeFilterPopover = this.statusFilterPopover;
        }
      }, delay);
    }
  }

  /**
   * Open merchandiser filter popover
   */
  openMerchandiserFilter(event: Event): void {
    event.stopPropagation();
    
    // Store the actual DOM element for positioning (exactly like dashboard)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    if (!targetElement) {
      return;
    }
    
    // Close settings popover if open
    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }
    
    // Check if the same popover is already open
    const isPopoverOpen = this.activeFilterPopover === this.merchandiserFilterPopover;
    
    // If clicking on the same filter that's already open, just close it
    if (isPopoverOpen) {
      this.merchandiserFilterPopover.hide();
      this.activeFilterPopover = null;
      return;
    }
    
    // Check if ANY popover was open (before closing)
    const hadOpenPopover = !!this.activeFilterPopover;
    
    // Close any other open filter popover
    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }
    
    // Open the popover using show() method
    if (this.merchandiserFilterPopover) {
      // Create positioning event for PrimeNG popover
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      
      // Use longer delay if we had to close another popover first
      const delay = hadOpenPopover ? 250 : 0;
      setTimeout(() => {
        if (this.merchandiserFilterPopover) {
          this.merchandiserFilterPopover.show(positioningEvent);
          this.activeFilterPopover = this.merchandiserFilterPopover;
        }
      }, delay);
    }
  }

  /**
   * Open filialen filter popover
   */
  openFilialenFilter(event: Event): void {
    event.stopPropagation();
    
    // Store the actual DOM element for positioning (exactly like dashboard)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    if (!targetElement) {
      return;
    }
    
    // Close settings popover if open
    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }
    
    // Check if the same popover is already open
    const isPopoverOpen = this.activeFilterPopover === this.filialenFilterPopover;
    
    // If clicking on the same filter that's already open, just close it
    if (isPopoverOpen) {
      this.filialenFilterPopover.hide();
      this.activeFilterPopover = null;
      return;
    }
    
    // Check if ANY popover was open (before closing)
    const hadOpenPopover = !!this.activeFilterPopover;
    
    // Close any other open filter popover
    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }
    
    // Open the popover using show() method
    if (this.filialenFilterPopover) {
      // Create positioning event for PrimeNG popover
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      
      // Use longer delay if we had to close another popover first
      const delay = hadOpenPopover ? 250 : 0;
      setTimeout(() => {
        if (this.filialenFilterPopover) {
          this.filialenFilterPopover.show(positioningEvent);
          this.activeFilterPopover = this.filialenFilterPopover;
        }
      }, delay);
    }
  }

  /**
   * Toggle settings popover
   */
  toggleSettingsPopover(event: Event): void {
    event.stopPropagation();
    
    // Get the div element (currentTarget) not the inner element (target)
    const targetElement = event.currentTarget as HTMLElement;
    
    if (!targetElement || !this.columnsPopover) {
      console.warn('Settings popover: Missing target element or popover reference');
      return;
    }
    
    // Close any open filter popover when opening settings
    this.closeAllFilterPopovers();
    
    // Check if the same popover is already open
    const isPopoverOpen = this.activeSettingsPopover === this.columnsPopover;
    
    // If clicking on the same settings that's already open, just close it
    if (isPopoverOpen) {
      this.columnsPopover.hide();
      this.activeSettingsPopover = null;
      return;
    }
    
    // Create positioning event for PrimeNG popover (like dashboard does)
    const positioningEvent = {
      currentTarget: targetElement,
      target: targetElement,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as any;
    
    // Open the popover with show() method (like dashboard)
    const delay = isPopoverOpen ? 150 : 50;
    setTimeout(() => {
      if (this.columnsPopover) {
        this.columnsPopover.show(positioningEvent);
        this.activeSettingsPopover = this.columnsPopover;
      }
    }, delay);
  }

  /**
   * Close all filter popovers
   */
  private closeAllFilterPopovers(): void {
    // Close all filter popovers
    if (this.statusFilterPopover) {
      this.statusFilterPopover.hide();
    }
    if (this.merchandiserFilterPopover) {
      this.merchandiserFilterPopover.hide();
    }
    if (this.filialenFilterPopover) {
      this.filialenFilterPopover.hide();
    }
    if (this.genericFilterPopover) {
      this.genericFilterPopover.hide();
    }
    this.activeFilterPopover = null;
  }

  /**
   * Close settings popover
   */
  private closeSettingsPopover(): void {
    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }
  }

  /**
   * Handle popover close events to reset active popover state
   */
  onStatusFilterPopoverClose(): void {
    if (this.activeFilterPopover === this.statusFilterPopover) {
      this.activeFilterPopover = null;
    }
  }

  onMerchandiserFilterPopoverClose(): void {
    if (this.activeFilterPopover === this.merchandiserFilterPopover) {
      this.activeFilterPopover = null;
    }
  }

  onFilialenFilterPopoverClose(): void {
    if (this.activeFilterPopover === this.filialenFilterPopover) {
      this.activeFilterPopover = null;
    }
  }

  onGenericFilterPopoverClose(): void {
    if (this.activeFilterPopover === this.genericFilterPopover) {
      this.activeFilterPopover = null;
      this.currentFilterField = '';
    }
  }

  onSettingsPopoverClose(): void {
    if (this.activeSettingsPopover === this.columnsPopover) {
      this.activeSettingsPopover = null;
    }
  }

  /**
   * Open plannedOn date filter by clicking the date range picker
   */
  openPlannedOnDateFilter(event: Event): void {
    event.stopPropagation();
    // Close any open filter popovers when opening date picker
    this.closeAllFilterPopovers();
    this.closeSettingsPopover();
    
    console.log('Opening date range picker for plannedOn');

    // Find and click the date range picker element
    setTimeout(() => {
      const datePickerElement = document.querySelector('app-date-range-picker') as HTMLElement;
      if (datePickerElement) {
        const clickableDiv = datePickerElement.querySelector('div.cursor-pointer') as HTMLElement;
        if (clickableDiv) {
          clickableDiv.click();
          console.log('✅ Date picker opened via DOM click');
        } else {
          console.warn('Date picker clickable div not found');
        }
      } else {
        console.warn('Date picker element not found');
      }
    }, 0);
  }
}
