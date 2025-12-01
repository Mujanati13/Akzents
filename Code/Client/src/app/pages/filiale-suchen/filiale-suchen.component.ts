import { Component, OnInit, ViewChild } from '@angular/core';
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
import { BranchesService, Branch } from '@app/@core/services/branches.service';
import { InitializerService } from '@app/core/services/initializer.service';

interface Filiale {
  id: string;
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  phone?: string;
  projekte?: Projekt[];
}

interface Projekt {
  id: string;
  name: string;
  zeitraum: string;
  calendarWeek: string;
  status: {
    name: string;
  };
  geplant: string;
  filiale: string;
  adresse: string;
  filter_frage: boolean;
  isFavorite: boolean;
}

// Add Column interface
interface Column {
  field: string;
  header: string;
}

@Component({
  selector: 'app-filiale-suchen',
  standalone: true,
  imports: [TranslateModule, ImportsModule, AppIconComponent, FormsModule, CommonModule, RouterModule, TableModule, FavoriteToggleComponent, MultiSelectModule, PopoverModule],
  templateUrl: './filiale-suchen.component.html',
  styleUrl: './filiale-suchen.component.scss',
})
export class FilialeSuchenComponent implements OnInit {
  // Search functionality
  searchQuery: string = '';
  showAllFiliales: boolean = false;

  // Table state
  expandedRows: { [key: string]: boolean } = {};
  filialen: Filiale[] = [];

  // Add column management properties
  filialenCols: Column[] = [];
  selectedFilialenColumns: Column[] = [];
  filialenOrderedColumns: Column[] = [];
  filialenVisibleColumns: { [key: string]: boolean } = {};

  projekteCols: Column[] = [];
  selectedProjekteColumns: Column[] = [];
  projekteOrderedColumns: Column[] = [];
  projekteVisibleColumns: { [key: string]: boolean } = {};

  // Add this property to store all original filialen
  originalFilialen: Filiale[] = [];

  // Sorting state
  sortField: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  projektSortField: string = '';
  projektSortDirection: 'asc' | 'desc' = 'asc';

  // Loading state for reports
  loadingReports: { [filialeId: string]: boolean } = {};

  // Column filter properties
  filialenColumnFilterValues: { [field: string]: string[] } = {};
  currentFilialenFilterField: string = '';
  projekteColumnFilterValues: { [field: string]: string[] } = {};
  currentProjekteFilterField: string = '';
  selectedFilialeForFilter: Filiale | null = null;

  @ViewChild('filialenColumnFilterPopover') filialenColumnFilterPopover: any;
  @ViewChild('projekteColumnFilterPopover') projekteColumnFilterPopover: any;

  constructor(
    private router: Router,
    private branchesService: BranchesService,
    private initializerService: InitializerService,
  ) {}

  ngOnInit(): void {
    this.loadFilialen();
    this.initializeColumns();
  }

  // Initialize column definitions
  initializeColumns(): void {
    // Define columns for the main Filialen table
    this.filialenCols = [
      { field: 'strasse', header: 'Straße' },
      { field: 'plz', header: 'PLZ' },
      { field: 'ort', header: 'Ort' },
      { field: 'phone', header: 'Telefon' },
    ];

    // Set initial selected and ordered columns
    this.selectedFilialenColumns = [...this.filialenCols];
    this.filialenOrderedColumns = [...this.filialenCols];

    // Define columns for the nested Projekte table
    this.projekteCols = [
      { field: 'zeitraum', header: 'Zeitraum' },
      { field: 'status', header: 'Status' },
      { field: 'geplant', header: 'Geplant' },
      { field: 'filiale', header: 'Filiale' },
      { field: 'adresse', header: 'Adresse' },
      { field: 'filter_frage', header: 'Filter Frage' },
    ];

    // Set initial selected and ordered columns
    this.selectedProjekteColumns = [...this.projekteCols];
    this.projekteOrderedColumns = [...this.projekteCols];

    // Initialize visible columns
    this.initializeVisibleColumns();
  }

  // Initialize visible columns
  initializeVisibleColumns(): void {
    // Set all filialen columns to visible by default
    this.filialenCols.forEach((col) => {
      this.filialenVisibleColumns[col.field] = true;
    });

    // Set all projekte columns to visible by default
    this.projekteCols.forEach((col) => {
      this.projekteVisibleColumns[col.field] = true;
    });
  }

  // Get visible columns for filialen table
  getFilialenVisibleColumns(): Column[] {
    return this.filialenOrderedColumns.filter((col) => this.filialenVisibleColumns[col.field]);
  }

  // Get visible columns for projekte table
  getProjekteVisibleColumns(): Column[] {
    return this.projekteOrderedColumns.filter((col) => this.projekteVisibleColumns[col.field]);
  }

  // Handle column reordering for filialen table
  onFilialenColReorder(event: any): void {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      const movedColumn = this.filialenOrderedColumns[event.dragIndex];

      const newOrderedColumns = [...this.filialenOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);

      this.filialenOrderedColumns = newOrderedColumns;
    }
  }

  // Handle column reordering for projekte table
  onProjekteColReorder(event: any): void {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      const movedColumn = this.projekteOrderedColumns[event.dragIndex];

      const newOrderedColumns = [...this.projekteOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);

      this.projekteOrderedColumns = newOrderedColumns;
    }
  }

  // Update visible columns for filialen
  onFilialenColumnsChange(selectedColumns: Column[]): void {
    // Reset all to false
    Object.keys(this.filialenVisibleColumns).forEach((key) => {
      this.filialenVisibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.filialenVisibleColumns[col.field] = true;
    });

    // Update the selectedFilialenColumns for backward compatibility
    this.selectedFilialenColumns = selectedColumns;
  }

  // Update visible columns for projekte
  onProjekteColumnsChange(selectedColumns: Column[]): void {
    // Reset all to false
    Object.keys(this.projekteVisibleColumns).forEach((key) => {
      this.projekteVisibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.projekteVisibleColumns[col.field] = true;
    });

    // Update the selectedProjekteColumns for backward compatibility
    this.selectedProjekteColumns = selectedColumns;
  }

  // Load branches from API
  loadFilialen(): void {
    const currentClientCompany = this.initializerService.getCurrentClientCompany();

    if (!currentClientCompany) {
      console.warn('No client company selected, using mock data');
      this.loadMockData();
      return;
    }

    console.log('Loading branches for client company:', currentClientCompany.id);

    this.branchesService.getBranchesByClientCompany(currentClientCompany.id).subscribe({
      next: (branches: Branch[]) => {
        console.log('Branches loaded:', branches);
        this.originalFilialen = this.mapBranchesToFilialen(branches);
        this.applyFilters();
      },
      error: (error) => {
        console.error('Error loading branches:', error);
        // Fallback to mock data on error
        this.loadMockData();
      },
    });
  }

  // Map API branches to Filiale interface
  private mapBranchesToFilialen(branches: Branch[]): Filiale[] {
    return branches.map((branch) => ({
      id: branch.id.toString(),
      name: branch.name,
      strasse: branch.street || '',
      plz: branch.zipCode || '',
      ort: branch.city?.name || '',
      phone: branch.phone || '',
      projekte: [], // Will be populated when row is expanded
    }));
  }

  // Load reports for a specific branch
  loadReportsForBranch(branchId: number, filialeId: string): void {
    this.branchesService.getReportsByBranch(branchId).subscribe({
      next: (reports: any[]) => {
        console.log('Reports loaded for branch:', branchId, reports);
        // Map reports to projekte format
        const projekte = reports.map((report) => ({
          id: report.id.toString(),
          name: report.project?.name || 'Unnamed Project',
          zeitraum: this.formatDateRange(report.plannedOn, report.reportTo),
          calendarWeek: this.getCalendarWeek(report.plannedOn),
          status: { name: report.status?.name || 'unknown', color: report.status?.color || '#6B7280' },
          geplant: this.formatDate(report.plannedOn),
          filiale: report.branch?.name || 'Unknown Branch',
          adresse: `${report.street || ''} ${report.zipCode || ''}`.trim(),
          filter_frage: false, // Default value
          isFavorite: report.isFavorite || false,
        }));

        // Find the branch in the filialen array and update its projekte
        const branchIndex = this.filialen.findIndex((filiale) => filiale.id === branchId.toString());
        if (branchIndex !== -1) {
          this.filialen[branchIndex].projekte = projekte;
        }
        
        // Clear loading state
        this.loadingReports[filialeId] = false;
      },
      error: (error) => {
        console.error('Error loading reports for branch:', branchId, error);
        // Clear loading state on error
        this.loadingReports[filialeId] = false;
      },
    });
  }

  // Helper method to format date range
  private formatDateRange(startDate: string, endDate: string): string {
    if (!startDate && !endDate) return '';
    const start = startDate ? this.formatDate(startDate) : '';
    const end = endDate ? this.formatDate(endDate) : '';
    return start && end ? `${start} - ${end}` : start || end;
  }

  // Helper method to format date
  private formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE');
  }

  // Helper method to get calendar week
  private getCalendarWeek(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + start.getDay() + 1) / 7);
    return `KW ${weekNumber}`;
  }

  // Fallback mock data
  private loadMockData(): void {
    this.originalFilialen = [
      {
        id: '1',
        name: 'AlfaNova',
        strasse: 'Centplatz 2',
        plz: '81371',
        ort: 'München',
        projekte: [
          {
            id: 'p1',
            name: 'Sommer',
            zeitraum: '01.05. bis 31.05.2024',
            calendarWeek: 'KW 30',
            status: { name: 'new' },
            geplant: '30.05.24',
            filiale: 'AlfaNova',
            adresse: 'Musterstraße 1 23456 Augsburg',
            filter_frage: false,
            isFavorite: false,
          },
          {
            id: 'p2',
            name: 'Sommer',
            zeitraum: '01.05. bis 31.05.2024',
            calendarWeek: 'KW 30',
            status: { name: 'in_progress' },
            geplant: '30.05.24',
            filiale: 'AlfaNova',
            adresse: 'Musterstraße 1 23456 Hannover',
            filter_frage: false,
            isFavorite: false,
          },
          {
            id: 'p3',
            name: 'Sommer',
            zeitraum: '01.05. bis 31.05.2024',
            calendarWeek: 'KW 30',
            status: { name: 'accepted' },
            geplant: '10.05.24',
            filiale: 'AlfaNova',
            adresse: 'Centplatz 2 12345 Köln',
            filter_frage: false,
            isFavorite: false,
          },
          {
            id: 'p4',
            name: 'Sommer',
            zeitraum: '01.05. bis 31.05.2024',
            calendarWeek: 'KW 30',
            status: { name: 'new' },
            geplant: '30.05.24',
            filiale: 'AlfaNova',
            adresse: 'Musterstraße 1 82342 Berlin',
            filter_frage: false,
            isFavorite: false,
          },
        ],
      },
      {
        id: '2',
        name: 'Beta-Stilhaus',
        strasse: 'Kurfürstendamm 123',
        plz: '60386',
        ort: 'Frankfurt am Main',
        projekte: [],
      },
      {
        id: '3',
        name: 'Belegante',
        strasse: 'Musterstraße 33',
        plz: '60323',
        ort: 'Frankfurt am Main',
        projekte: [],
      },
      {
        id: '4',
        name: 'Urbanique',
        strasse: 'Maximilianstraße 10',
        plz: '60314',
        ort: 'Frankfurt am Main',
        projekte: [],
      },
      {
        id: '5',
        name: 'Veloura',
        strasse: 'Mönckebergstraße 1',
        plz: '60313',
        ort: 'Frankfurt am Main',
        projekte: [],
      },
      {
        id: '6',
        name: 'X-House',
        strasse: 'Cassellastraße 30 - 32',
        plz: '60386',
        ort: 'Frankfurt am Main',
        projekte: [],
      },
    ];

    // Apply filters to set initial filialen
    this.applyFilters();
  }

  // Add this getter for filtered filialen
  get filteredFilialen(): Filiale[] {
    // Return the filtered filialen array (filtering is handled by applyFilters)
    return this.filialen;
  }

  // Method to filter filialen based on search query
  filterFilialen(): void {
    this.applyFilters();
  }

  // Apply all filters (search + column filters)
  applyFilters(): void {
    let filtered = [...this.originalFilialen];

    // Apply search query filter
    if (this.searchQuery && this.searchQuery.trim() !== '') {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (filiale) =>
          filiale.name.toLowerCase().includes(query) || 
          filiale.ort.toLowerCase().includes(query) || 
          filiale.plz.toLowerCase().includes(query) || 
          filiale.strasse.toLowerCase().includes(query),
      );
    }

    // Apply column filters
    this.filialenCols.forEach((col) => {
      const filterValues = this.filialenColumnFilterValues[col.field];
      if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter((filiale) => {
          const value = filiale[col.field as keyof Filiale]?.toString() || '';
          return filterValues.includes(value);
        });
      }
    });

    this.filialen = filtered;
  }

  // Clear all filters
  clearFilters(): void {
    this.searchQuery = '';
    this.filialenColumnFilterValues = {};
    this.projekteColumnFilterValues = {};
    this.applyFilters();
  }

  // Check if any filters are active
  hasFilters(): boolean {
    return (
      (this.searchQuery && this.searchQuery.trim() !== '') ||
      this.hasFilialenColumnFilters() ||
      this.hasProjekteColumnFilters()
    );
  }

  hasFilialenColumnFilters(): boolean {
    return Object.keys(this.filialenColumnFilterValues).some((field) => {
      const values = this.filialenColumnFilterValues[field];
      return values && Array.isArray(values) && values.length > 0;
    });
  }

  hasProjekteColumnFilters(): boolean {
    return Object.keys(this.projekteColumnFilterValues).some((field) => {
      const values = this.projekteColumnFilterValues[field];
      return values && Array.isArray(values) && values.length > 0;
    });
  }

  // Column filter methods for filialen
  openFilialenColumnFilter(field: string, event: Event): void {
    this.currentFilialenFilterField = field;
    if (!this.filialenColumnFilterValues[field]) {
      this.filialenColumnFilterValues[field] = [];
    }
    event.stopPropagation();
    // Show the popover
    if (this.filialenColumnFilterPopover) {
      setTimeout(() => {
        this.filialenColumnFilterPopover.toggle(event);
      }, 0);
    }
  }

  getFilialenColumnFilterValue(field: string): string[] {
    return this.filialenColumnFilterValues[field] || [];
  }

  getUniqueValuesForFilialenColumn(field: string): string[] {
    const values = new Set<string>();
    this.originalFilialen.forEach((filiale) => {
      const value = filiale[field as keyof Filiale]?.toString() || '';
      if (value) {
        values.add(value);
      }
    });
    return Array.from(values).sort();
  }

  getFilialenColumnHeader(field: string): string {
    const col = this.filialenCols.find((c) => c.field === field);
    return col ? col.header : field;
  }

  onFilialenColumnFilterChange(): void {
    this.applyFilters();
  }

  // Column filter methods for projekte
  openProjekteColumnFilter(field: string, filiale: Filiale, event: Event): void {
    this.currentProjekteFilterField = field;
    this.selectedFilialeForFilter = filiale;
    if (!this.projekteColumnFilterValues[field]) {
      this.projekteColumnFilterValues[field] = [];
    }
    event.stopPropagation();
    // Show the popover
    if (this.projekteColumnFilterPopover) {
      setTimeout(() => {
        this.projekteColumnFilterPopover.toggle(event);
      }, 0);
    }
  }

  getProjekteColumnFilterValue(field: string): string[] {
    return this.projekteColumnFilterValues[field] || [];
  }

  getUniqueValuesForProjekteColumn(field: string): string[] {
    const values = new Set<string>();
    const filiale = this.selectedFilialeForFilter;
    if (filiale && filiale.projekte) {
      filiale.projekte.forEach((projekt) => {
        let value = '';
        if (field === 'status') {
          value = (projekt.status as any)?.name || '';
        } else if (field === 'filter_frage') {
          value = projekt.filter_frage ? 'Ja' : 'Nein';
        } else {
          value = projekt[field as keyof Projekt]?.toString() || '';
        }
        if (value) {
          values.add(value);
        }
      });
    }
    return Array.from(values).sort();
  }

  getProjekteColumnHeader(field: string): string {
    const col = this.projekteCols.find((c) => c.field === field);
    return col ? col.header : field;
  }

  onProjekteColumnFilterChange(): void {
    // The filtering is handled by getFilteredProjekte method
    // This method is called when filter values change
  }

  // Get filtered projects for a filiale
  getFilteredProjekte(filiale: Filiale): Projekt[] {
    if (!filiale.projekte) {
      return [];
    }
    
    let filtered = [...filiale.projekte];
    
    this.projekteCols.forEach((col) => {
      const filterValues = this.projekteColumnFilterValues[col.field];
      if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter((projekt) => {
          let value = '';
          if (col.field === 'status') {
            value = (projekt.status as any)?.name || '';
          } else if (col.field === 'filter_frage') {
            value = projekt.filter_frage ? 'Ja' : 'Nein';
          } else {
            value = projekt[col.field as keyof Projekt]?.toString() || '';
          }
          return filterValues.includes(value);
        });
      }
    });
    
    return filtered;
  }

  onRowExpand(event: any): void {
    console.log('Row expanded', event.data);
    const branchId = parseInt(event.data.id);
    const filialeId = event.data.id;
    
    // Set loading state
    this.loadingReports[filialeId] = true;
    
    if (branchId && (!event.data.projekte || event.data.projekte.length === 0)) {
      this.loadReportsForBranch(branchId, filialeId);
    } else {
      // If projects already loaded, just clear loading state
      this.loadingReports[filialeId] = false;
    }
  }

  onRowCollapse(event: any): void {
    console.log('Row collapsed', event.data);
  }

  startSearch(): void {
    // In a real app, you would make an API call here
    console.log('Searching with query:', this.searchQuery);
  }

  // Update showAllStores method to reset search and refresh data
  showAllStores(): void {
    this.searchQuery = '';
    this.showAllFiliales = true;
    this.filialen = [...this.originalFilialen];

    // You would typically make an API call here to load all stores
    console.log('Show all stores requested');
  }

  onFavoriteChanged(newStatus: boolean, projekt: Projekt): void {
    projekt.isFavorite = newStatus;
    console.log(`Project ${projekt.name} favorite status: ${newStatus}`);
  }

  toggleFilter(event: Event): void {
    event.preventDefault();
    console.log('Toggle filter');
  }

  onSort(field: string): void {
    // Handle main table sorting
    console.log(`Sorting by ${field}`, this.sortField, this.sortDirection);

    // Toggle sort direction for the field
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }

    console.log(`New sort: ${this.sortField} ${this.sortDirection}`);

    // Sort the filialen array
    this.filialen.sort((a, b) => {
      let aValue = a[field as keyof Filiale];
      let bValue = b[field as keyof Filiale];

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

    // Also sort the originalFilialen to maintain consistency
    this.originalFilialen.sort((a, b) => {
      let aValue = a[field as keyof Filiale];
      let bValue = b[field as keyof Filiale];

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

  onProjektSort(field: string, filiale: Filiale): void {
    // Handle nested table sorting
    console.log(`Sorting projects in ${filiale.name} by ${field}`, this.projektSortField, this.projektSortDirection);

    if (!filiale.projekte || filiale.projekte.length === 0) {
      console.log('No projects to sort');
      return;
    }

    // Toggle sort direction for the field
    const sortKey = `${filiale.id}_${field}`;
    if (this.projektSortField === sortKey) {
      this.projektSortDirection = this.projektSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.projektSortField = sortKey;
      this.projektSortDirection = 'asc';
    }

    console.log(`New projekt sort: ${this.projektSortField} ${this.projektSortDirection}`);

    // Sort the projekte array for this specific filiale
    filiale.projekte.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      // Handle special cases based on how they're displayed in the template
      if (field === 'status') {
        // Sort by the status name directly
        aValue = (a.status as any)?.name || '';
        bValue = (b.status as any)?.name || '';
        console.log(`Status sorting: ${aValue} vs ${bValue}`);
      } else if (field === 'filter_frage') {
        // Sort by the displayed text (Ja, Nein)
        aValue = a.filter_frage ? 'Ja' : 'Nein';
        bValue = b.filter_frage ? 'Ja' : 'Nein';
        console.log(`Filter_frage sorting: ${aValue} vs ${bValue}`);
      } else if (field === 'zeitraum') {
        // Sort by the combined display value (calendarWeek + zeitraum)
        aValue = `${a.calendarWeek} ${a.zeitraum}`;
        bValue = `${b.calendarWeek} ${b.zeitraum}`;
        console.log(`Zeitraum sorting: ${aValue} vs ${bValue}`);
      } else {
        // Default: use the raw field value
        aValue = a[field as keyof Projekt];
        bValue = b[field as keyof Projekt];
        console.log(`${field} sorting: ${aValue} vs ${bValue}`);
      }

      // Handle string comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        return this.projektSortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return this.projektSortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  /**
   * Navigate to report detail view
   * @param projekt The project/report to view
   */
  viewReportDetails(projekt: Projekt): void {
    // Use the project ID as project slug
    const projectSlug = projekt.id;

    // For this implementation, we'll use the project ID as the report ID
    // In a real app, you would likely have specific report IDs
    const reportID = projekt.id;

    // Navigate to the report detail page
    this.router.navigate(['projects', projectSlug, 'reports', reportID]);
  }
}
