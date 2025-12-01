import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientService } from '@app/@core/services/client.service';
import { ClientCompanyService, ClientCompany } from '@app/@core/services/client-company.service';
import { TableRowCollapseEvent, TableRowExpandEvent } from 'primeng/table';
import { ProjectService } from '@app/@core/services/project.service';
import { ReportService } from '@app/@core/services/report.service';
import { catchError, of } from 'rxjs';
import { ReportStatusEnum } from '@app/@core/enums/status.enum';
import { HotToastService } from '@ngneat/hot-toast';

interface Report {
  id?: number;
  project?: {
    id?: number;
    name?: string;
    startDate?: string;
    endDate?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  status?: {
    id?: number;
    name?: string;
    color?: string;
  };
  clientCompany?: {
    id?: number;
    logo?: {
      id?: string;
      path?: string;
    };
    name?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  branch?: {
    id?: number;
    name?: string;
    client?: {
      id?: number;
      logo?: {
        id?: string;
        path?: string;
      };
      name?: string;
      createdAt?: string;
      updatedAt?: string;
    };
    createdAt?: string;
    updatedAt?: string;
  };
  street?: string;
  zipCode?: string;
  address?: string;
  plannedOn?: string;
  note?: string;
  reportTo?: string;
  feedback?: string | boolean;
  isSpecCompliant?: boolean;
  isFavorite?: boolean;
  createdAt?: string;
  updatedAt?: string;
  merchandiser?: any;
}

interface Project {
  id?: string;
  name?: string;
  zeitraum?: string;
  calendarWeek?: string;
  filialen?: number;
  status?: string;
  isFavorite?: boolean;
  reports?: Report[];
  slug?: string;
  branchesCount?: number;
  reportedPercentage?: number; // Calculated in backend
}

interface Column {
  field: string;
  header: string;
}

@Component({
  selector: 'app-client-detail',
  templateUrl: './client-detail.component.html',
  standalone: false,
})
export class ClientDetailComponent implements OnInit {
  client: ClientCompany | undefined;
  projects!: Project[];
  selectedProject!: Project | null;
  expandedRows: { [key: string]: boolean } = {};
  cols!: Column[];
  selectedColumns!: Column[];
  dateRange: Date[] = [];

  // Add filter properties
  projectSearchTerm: string = '';
  filialeSearchTerm: string = '';
  filteredProjects: Project[] = [];

  dateRange2 = { start: null, end: null };
  statusFilter: any;

  onRangeSelected(range: { start: Date | null; end: Date | null }) {
    console.log('Selected range:', range);
    this.dateRange2 = range;
  }

  @ViewChild('datePickerButton') datePickerButton: ElementRef;
  @ViewChild('datePickerContent') datePickerContent: ElementRef;
  @ViewChild('genericFilterPopover') genericFilterPopover: any;
  isDatePickerOpen = false;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Check if click is outside of date picker elements
    if (this.isDatePickerOpen) {
      const buttonEl = this.datePickerButton?.nativeElement;
      const contentEl = this.datePickerContent?.nativeElement;

      if (buttonEl && contentEl) {
        // Only close if both dates are selected or if click is outside both elements
        if (!buttonEl.contains(event.target) && !contentEl.contains(event.target) && this.dateRange.length === 2) {
          this.closeDatePicker();
        }
      }
    }
  }

  myDate: Date | null = null;

  // Add these new properties for nested table columns
  reportCols!: Column[];
  selectedReportColumns!: Column[];

  // Add these properties for sorting
  projectSortField: string = '';
  projectSortOrder: number = 1; // 1 for ascending, -1 for descending
  reportSortField: string = '';
  reportSortOrder: number = 1;

  // Add ordered columns properties
  projectsOrderedColumns: Column[] = [];
  reportsOrderedColumns: Column[] = [];

  // Add these properties to track visible columns
  projectsVisibleColumns: { [key: string]: boolean } = {};
  reportsVisibleColumns: { [key: string]: boolean } = {};

  // Report filters
  reportStatusFilter: string[] = [];
  reportMerchandiserFilter: string[] = [];
  reportFilialenFilter: string[] = [];
  reportPlannedOnFilter: string[] = [];
  
  // Generic filter properties
  genericFilterValues: { [field: string]: string[] } = {};
  currentFilterField: string = '';

  // Project column filter properties
  projectColumnFilters: { [key: string]: string[] } = {
    name: [],
    formattedZeitraum: [],
    filialen: [],
    status: [],
  };

  // Track current project filter field for popovers
  currentProjectFilterField: string = '';

  @ViewChild('projectColumnFilterPopover') projectColumnFilterPopover: any;
  @ViewChild('statusFilterPopover') statusFilterPopover: any;
  @ViewChild('merchandiserFilterPopover') merchandiserFilterPopover: any;
  @ViewChild('filialenFilterPopover') filialenFilterPopover: any;
  @ViewChild('plannedOnFilterPopover') plannedOnFilterPopover: any;
  @ViewChild('reportColumnsPopover') reportColumnsPopover: any;
  @ViewChild('op') op: any;

  private activeFilterPopover: any = null;
  private activeSettingsPopover: any = null;

  private lastLoadedClientId: number | null = null;

  // Track which report is being edited for plannedOn
  editingPlannedOnReportId: number | null = null;

  // Track loading state for reports per project
  loadingReports: { [projectId: string | number]: boolean } = {};
  
  // Track loading state for the whole page
  isLoading: boolean = false;

  // Called when pencil_square is clicked
  startEditingPlannedOn(report: Report): void {
    this.editingPlannedOnReportId = report.id ?? null;
  }

  // Called when save icon is clicked
  savePlannedOnEdit(report: Report): void {
    // Optionally, call a service to persist the change here
    this.editingPlannedOnReportId = null;
  }

  // Update onPlannedOnDateChange to only update the value, not close the input
  onPlannedOnDateChange(report: Report, event: any): void {
    report.plannedOn = event.target.value;
    // Do not close the input here
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private clientService: ClientService,
    private projectService: ProjectService,
    private reportService: ReportService,
    private clientCompanyService: ClientCompanyService,
    private toast: HotToastService,
  ) {}

  ngOnInit(): void {
    // Initialize filters
    this.reportStatusFilter = [];
    this.reportMerchandiserFilter = [];
    this.reportFilialenFilter = [];
    
    this.route.paramMap.subscribe((params) => {
      this.statusFilter = this.route.snapshot.queryParamMap.get('status') || '';
      // Support both projectSlug and projectId, and always extract clientId
      const clientId = params.get('clientId');
      const projectSlug = params.get('projectSlug') || params.get('projectId');
      console.log('Route params:', params.keys, 'clientId:', clientId, 'projectSlug:', projectSlug);

      // Reset expanded rows on route change
      this.expandedRows = {};

      const clientIdNum = Number(clientId);
      if (clientIdNum) {
        if (clientIdNum !== this.lastLoadedClientId) {
          this.lastLoadedClientId = clientIdNum;
          this.isLoading = true;
          this.clientCompanyService.getProjectsByClientCompany(clientIdNum).subscribe({
            next: (response) => {
              this.projects = response.projects || [];
              this.filteredProjects = [...this.projects];
              this.client = response.clientCompany;
              this.isLoading = false;

              // Update the selected client in ClientService with the loaded projects for sidebar
              if (this.client && this.projects) {
                const selectedClient = this.clientService.getClientById(this.client.id.toString());
                if (selectedClient) {
                  selectedClient.projects = this.projects.map((p) => ({
                    id: p.id?.toString() ?? '',
                    name: p.name ?? '',
                    slug: p.slug ?? '',
                    clientId: this.client!.id.toString(),
                    // Add more fields if needed for the sidebar
                  }));
                }
              }

              // If projectSlug is available, find and set the selectedProject
              if (projectSlug && this.projects) {
                const matchedProject = this.filteredProjects.find((p) => p.id == projectSlug || p.slug == projectSlug);

                if (matchedProject) {
                  this.selectedProject = matchedProject;
                  this.expandedRows[matchedProject.id as string] = true;
                  // Fetch reports for this project on initial load only if not already loaded
                  if (matchedProject.reports === undefined || matchedProject.reports === null) {
                    const projectIdKey = matchedProject.id.toString();
                    this.loadingReports[projectIdKey] = true;
                    // Also set with original key if it's a number
                    if (typeof matchedProject.id === 'number') {
                      this.loadingReports[matchedProject.id] = true;
                    }
                    this.reportService.getReportsByProject(matchedProject.id).subscribe({
                      next: (reports) => {
                        matchedProject.reports = reports;
                        this.loadingReports[projectIdKey] = false;
                        if (typeof matchedProject.id === 'number') {
                          this.loadingReports[matchedProject.id] = false;
                        }
                      },
                      error: (err) => {
                        console.error('Error fetching reports for project:', err);
                        matchedProject.reports = [];
                        this.loadingReports[projectIdKey] = false;
                        if (typeof matchedProject.id === 'number') {
                          this.loadingReports[matchedProject.id] = false;
                        }
                      },
                    });
                  } else {
                    console.log('Reports already loaded for project:', matchedProject.name, 'Skipping server call.');
                  }
                } else {
                  this.selectedProject = null;
                }
              } else {
                this.selectedProject = null;
              }
            },
            error: (err) => {
              console.error('Error fetching projects for client company:', err);
              this.isLoading = false;
              
              // Check if it's a 403 Forbidden error (permission denied)
              if (err.status === 403) {
                this.toast.error('Sie haben keine Berechtigung, auf diesen Kunden zuzugreifen.', {
                  position: 'bottom-right',
                  duration: 3000,
                });
                this.router.navigate(['/dashboard']);
              } else {
                this.toast.error('Fehler beim Laden der Projekte.', {
                  position: 'bottom-right',
                  duration: 3000,
                });
              }
              
              this.projects = [];
              this.filteredProjects = [];
              this.selectedProject = null;
              this.client = undefined;
            },
          });
        } else {
          // Only update selected project and fetch reports if needed
          if (projectSlug && this.projects) {
            const matchedProject = this.filteredProjects.find((p) => p.id == projectSlug || p.slug == projectSlug);

            if (matchedProject) {
              this.selectedProject = matchedProject;
              this.expandedRows[matchedProject.id as string] = true;
              // Fetch reports for this project on initial load only if not already loaded
              if (matchedProject.reports === undefined || matchedProject.reports === null) {
                const projectIdKey = matchedProject.id.toString();
                this.loadingReports[projectIdKey] = true;
                // Also set with original key if it's a number
                if (typeof matchedProject.id === 'number') {
                  this.loadingReports[matchedProject.id] = true;
                }
                this.reportService.getReportsByProject(matchedProject.id).subscribe({
                  next: (reports) => {
                    matchedProject.reports = reports;
                    this.loadingReports[projectIdKey] = false;
                    if (typeof matchedProject.id === 'number') {
                      this.loadingReports[matchedProject.id] = false;
                    }
                  },
                  error: (err) => {
                    console.error('Error fetching reports for project:', err);
                    matchedProject.reports = [];
                    this.loadingReports[projectIdKey] = false;
                    if (typeof matchedProject.id === 'number') {
                      this.loadingReports[matchedProject.id] = false;
                    }
                  },
                });
              } else {
                console.log('Reports already loaded for project:', matchedProject.name, 'Skipping server call.');
              }
            } else {
              this.selectedProject = null;
            }
          } else {
            this.selectedProject = null;
          }
        }
      } else {
        this.isLoading = false;
        this.client = undefined;
        this.projects = [];
        this.filteredProjects = [];
        this.selectedProject = null;
      }
    });

    // Initialize project columns
    this.cols = [
      { field: 'formattedZeitraum', header: 'Zeitraum' },
      { field: 'filialen', header: 'Filialen' },
      { field: 'status', header: 'Status' },
    ];
    this.selectedColumns = [...this.cols];

    // Initialize report columns
    this.reportCols = [
      { field: 'plannedOn', header: 'Geplant' },
      { field: 'merchandiser', header: 'Merchandiser' },
      { field: 'branch.name', header: 'Filiale' },
      { field: 'address', header: 'Adresse' },
      { field: 'note', header: 'Notiz' },
      { field: 'reportTo', header: 'Report bis' },
      { field: 'isSpecCompliant', header: 'Alles nach Vorgabe?' },
      { field: 'feedback', header: 'Feedback' },
    ];
    // Initialize selectedReportColumns with only visible columns (excluding isSpecCompliant and feedback)
    this.selectedReportColumns = this.reportCols.filter(
      (col) => col.field !== 'isSpecCompliant' && col.field !== 'feedback'
    );

    // Initialize ordered columns
    this.projectsOrderedColumns = [...this.cols];
    this.reportsOrderedColumns = [...this.reportCols];

    // Set all columns to visible by default
    this.initializeVisibleColumns();

    // Keep original selections for backward compatibility
    this.selectedColumns = [...this.cols];
  }

  // Navigate to project detail
  private navigateToProject(project: any): void {
    this.router.navigate(['/clients', this.client.id, 'projects', project.id]);
  }

  private navigateBackToClient(): void {
    this.router.navigate(['/clients', this.client.id]);
  }

  // Modify the column selector click handler to navigate if project is provided
  handleColumnHeaderClick(event: Event, project?: Project): void {
    if (project) {
      event.preventDefault();
      event.stopPropagation();
      this.navigateToProject(project);
    } else {
      // This is for the column selector in the header
      // Keep the existing op.toggle behavior
    }
  }

  // Enhance selectProject method to also expand the row
  selectProject(project: Project) {
    this.selectedProject = project;

    // Expand the selected project row
    if (project && project.id) {
      this.expandedRows = {}; // Clear any previous expanded rows
      this.expandedRows[project.id] = true;

      // Only fetch reports if they haven't been loaded yet
      // Check if reports array exists (even if empty, it means we've already fetched)
      if (project.reports === undefined || project.reports === null) {
        const projectIdKey = project.id.toString();
        this.loadingReports[projectIdKey] = true;
        // Also set with original key if it's a number
        if (typeof project.id === 'number') {
          this.loadingReports[project.id] = true;
        }
        this.reportService.getReportsByProject(project.id).subscribe({
          next: (reports) => {
            project.reports = reports;
            this.loadingReports[projectIdKey] = false;
            if (typeof project.id === 'number') {
              this.loadingReports[project.id] = false;
            }
          },
          error: (err) => {
            console.error('Error fetching reports for project:', err);
            project.reports = [];
            this.loadingReports[projectIdKey] = false;
            if (typeof project.id === 'number') {
              this.loadingReports[project.id] = false;
            }
          },
        });
      } else {
        // Reports already exist, no need to fetch
        console.log('Reports already loaded for project:', project.name, 'Skipping server call.');
      }
    }

    // Navigate to the project route
    if (this.statusFilter) {
      this.router.navigate(['/clients', this.client.id, 'projects', project.id], { queryParams: { status: this.statusFilter } });
    } else {
      this.router.navigate(['/clients', this.client.id, 'projects', project.id]);
    }
  }

  getSeverity(status: string) {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'PLANNED':
        return 'info';
      case 'DRAFT':
        return 'warning';
      case 'COMPLETED':
        return 'success';
      case 'PENDING':
        return 'warning';
      default:
        return 'info';
    }
  }

  getStatusSeverity(status: string) {
    switch (status) {
      case 'PENDING':
        return 'warn';
      case 'DELIVERED':
        return 'success';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'unknown';
    }
  }

  onRowExpand(event: TableRowExpandEvent) {
    const project = event.data as Project;
    console.log({ severity: 'info', summary: 'Project Expanded', detail: project.name, life: 3000 });
    
    // Only fetch reports if they haven't been loaded yet
    // Check if reports array exists (even if empty, it means we've already fetched)
    if (project && project.id && (project.reports === undefined || project.reports === null)) {
      const projectIdKey = project.id.toString();
      this.loadingReports[projectIdKey] = true;
      // Also set with original key if it's a number
      if (typeof project.id === 'number') {
        this.loadingReports[project.id] = true;
      }
      this.reportService.getReportsByProject(project.id).subscribe({
        next: (reports) => {
          project.reports = reports;
          this.loadingReports[projectIdKey] = false;
          if (typeof project.id === 'number') {
            this.loadingReports[project.id] = false;
          }
        },
        error: (err) => {
          console.error('Error fetching reports for project:', err);
          project.reports = [];
          this.loadingReports[projectIdKey] = false;
          if (typeof project.id === 'number') {
            this.loadingReports[project.id] = false;
          }
        },
      });
    } else if (project && project.reports !== undefined && project.reports !== null) {
      // Reports already exist, no need to fetch
      console.log('Reports already loaded for project:', project.name, 'Skipping server call.');
    }
  }

  // Method to collapse the currently expanded project
  collapseProject(): void {
    // Clear the expanded rows
    this.expandedRows = {};
    // Clear selected project
    this.selectedProject = null;

    // Navigate back to the client detail route (without project)
    if (this.client) {
      if (this.statusFilter) {
        this.router.navigate(['/clients', this.client.id], { queryParams: { status: this.statusFilter } });
      } else {
        this.router.navigate(['/clients', this.client.id]);
      }
    }
  }

  // Modify the existing onRowCollapse method to also update the route
  onRowCollapse(event: TableRowCollapseEvent) {
    console.log({ severity: 'success', summary: 'Project Collapsed', detail: event.data.name, life: 3000 });

    // If the collapsed row is the selected project, update the route
    if (this.selectedProject && this.selectedProject.id === event.data.id) {
      this.collapseProject();
    }
  }

  toggleDatePicker(): void {
    this.isDatePickerOpen = !this.isDatePickerOpen;
  }

  closeDatePicker(): void {
    this.isDatePickerOpen = false;
  }

  onDateRangeSelect(event: any): void {
    if (this.dateRange.length === 2) {
      // Both dates are selected, close the popover after a short delay
      setTimeout(() => this.closeDatePicker(), 200);
    }
  }

  onDateSelected(date: Date): void {
    console.log('Selected date:', date);
    this.myDate = date;
  }

  onFavoriteChanged(newStatus: boolean, project: Project): void {
    console.log('🔄 Toggling project favorite status:', { id: project.id, newStatus });

    // Optimistically update the UI
    const previousStatus = project.isFavorite;
    project.isFavorite = newStatus;

    // Call backend to toggle favorite status
    this.projectService
      .toggleFavoriteStatus(project.id!)
      .pipe(
        catchError((error) => {
          console.error('❌ Error toggling project favorite status:', error);

          // Revert the optimistic update on error
          project.isFavorite = previousStatus;

          return of(null);
        }),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            console.log('✅ Project favorite status updated:', result);

            // Update the status based on server response
            project.isFavorite = result.isFavorite;
          }
        },
      });
  }

  /**
   * Calculate the percentage of reported orders for a project
   */
  getReportedPercentage(project: Project): number {
    // Use backend-calculated value if available, otherwise fallback to 0
    return project.reportedPercentage ?? 0;
  }

  // Add this method to handle favorite changes for reports
  onReportFavoriteChanged(newStatus: boolean, report: Report): void {
    const previousStatus = report.isFavorite;
    report.isFavorite = newStatus;

    this.reportService.toggleFavoriteStatus(report.id!).subscribe({
      next: (result) => {
        if (result) {
          report.isFavorite = result.isFavorite;
          // Optionally show a toast: result.message
        }
      },
      error: (error) => {
        report.isFavorite = previousStatus; // revert on error
        // Optionally show a toast: 'Fehler beim Aktualisieren der Favoriten'
      },
    });
  }

  // Initialize visible columns
  initializeVisibleColumns() {
    // Set all project columns to visible by default
    this.cols.forEach((col) => {
      this.projectsVisibleColumns[col.field] = true;
    });

    // Set report columns - hide isSpecCompliant and feedback by default
    this.reportCols.forEach((col) => {
      if (col.field === 'isSpecCompliant' || col.field === 'feedback') {
        this.reportsVisibleColumns[col.field] = false; // Hidden by default
      } else {
        this.reportsVisibleColumns[col.field] = true;
      }
    });
  }

  // Get visible columns for projects table
  getProjectsVisibleColumns(): Column[] {
    // Return ordered columns that are visible
    return this.projectsOrderedColumns.filter((col) => this.projectsVisibleColumns[col.field]);
  }

  // Get visible columns for reports table
  getReportsVisibleColumns(): Column[] {
    // Return ordered columns that are visible
    return this.reportsOrderedColumns.filter((col) => this.reportsVisibleColumns[col.field]);
  }

  // Handle column reordering for projects table
  onProjectsColReorder(event: any) {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      // Get the column that was moved
      const movedColumn = this.projectsOrderedColumns[event.dragIndex];

      // Create a new array without the moved column
      const newOrderedColumns = [...this.projectsOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);

      // Insert the moved column at the drop index
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);

      // Update the ordered columns with the new order
      this.projectsOrderedColumns = newOrderedColumns;
    }
  }

  // Handle column reordering for reports table
  onReportsColReorder(event: any) {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      // Get the column that was moved
      const movedColumn = this.reportsOrderedColumns[event.dragIndex];

      // Create a new array without the moved column
      const newOrderedColumns = [...this.reportsOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);

      // Insert the moved column at the drop index
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);

      // Update the ordered columns with the new order
      this.reportsOrderedColumns = newOrderedColumns;
    }
  }

  // Update visible columns for projects
  onProjectsColumnsChange(selectedColumns: Column[]) {
    // Reset all to false
    Object.keys(this.projectsVisibleColumns).forEach((key) => {
      this.projectsVisibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.projectsVisibleColumns[col.field] = true;
    });

    // Update the selectedColumns for backward compatibility
    this.selectedColumns = selectedColumns;
  }

  // Update visible columns for reports
  onReportsColumnsChange(selectedColumns: Column[]) {
    // Reset all to false
    Object.keys(this.reportsVisibleColumns).forEach((key) => {
      this.reportsVisibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.reportsVisibleColumns[col.field] = true;
    });

    // Update the selectedReportColumns for backward compatibility
    this.selectedReportColumns = selectedColumns;
  }

  // Add filter methods
  onProjectSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.projectSearchTerm = target.value.toLowerCase();
    this.applyFilters();
  }

  onFilialeSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filialeSearchTerm = target.value.toLowerCase();
    this.applyFilters();
  }

  applyFilters(): void {
    this.filteredProjects = this.projects.filter((project) => {
      // Project search - search in project name
      const matchesProject = !this.projectSearchTerm || (project.name && project.name.toLowerCase().includes(this.projectSearchTerm));

      // Filiale search - search in reports' filiale field
      const matchesFiliale = !this.filialeSearchTerm || (project.reports && project.reports.some((report) => report.branch?.name && report.branch.name.toLowerCase().includes(this.filialeSearchTerm)));

      // Column filter: name (Projekt)
      if (this.projectColumnFilters['name'].length > 0 && !this.projectColumnFilters['name'].includes(project.name || '')) {
        return false;
      }

      // Column filter: formattedZeitraum (Zeitraum)
      const zeitraumValue = project.zeitraum || '';
      if (this.projectColumnFilters['formattedZeitraum'].length > 0 && !this.projectColumnFilters['formattedZeitraum'].includes(zeitraumValue)) {
        return false;
      }

      // Column filter: filialen (Filialen)
      const filialenValue = `${project.branchesCount ?? 0} Stores`;
      if (this.projectColumnFilters['filialen'].length > 0 && !this.projectColumnFilters['filialen'].includes(filialenValue)) {
        return false;
      }

      // Column filter: status (Status)
      const statusValue = `${project.reportedPercentage ?? 0}% reported`;
      if (this.projectColumnFilters['status'].length > 0 && !this.projectColumnFilters['status'].includes(statusValue)) {
        return false;
      }

      return matchesProject && matchesFiliale;
    });
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
      filialen: [],
      status: [],
    };
    
    // Clear report column filters
    this.reportStatusFilter = [];
    this.reportMerchandiserFilter = [];
    this.reportFilialenFilter = [];
    this.reportPlannedOnFilter = [];
    this.genericFilterValues = {};
    
    // Clear status filter from query params
    if (this.statusFilter) {
      this.statusFilter = '';
      // Navigate without the status query parameter
      const clientId = this.route.snapshot.paramMap.get('id') || this.route.snapshot.paramMap.get('clientId');
      if (clientId) {
        this.router.navigate(['/clients', clientId], { queryParams: {} });
      }
    }
    
    this.filteredProjects = [...this.projects];
  }

  private loadClient(): void {
    const clientId = this.route.snapshot.paramMap.get('id') || this.route.snapshot.paramMap.get('clientId');
    if (clientId) {
      // this.client is set from the backend response in ngOnInit
    }
  }

  /**
   * Generate address string for a report using street, zipCode, and branch city
   */
  getReportAddress(report: Report): string {
    const street = report.street || '';
    const zip = report.zipCode || '';
    // Try to get city from branch.name or branch.city (if available)
    let city = '';
    if (report.branch) {
      // Check if branch has a city property, otherwise use branch name
      if ((report.branch as any).city && (report.branch as any).city.name) {
        city = (report.branch as any).city.name;
      } else {
        city = report.branch.name || '';
      }
    }
    // Only include parts that are not empty
    return [street, zip, city].filter(Boolean).join(', ');
  }

  /**
   * Get merchandiser name for a report
   */
  getReportMerchandiserName(report: Report): string {
    if (report.merchandiser && report.merchandiser.user) {
      const user = report.merchandiser.user;
      return [user.firstName, user.lastName].filter(Boolean).join(' ');
    }
    return '';
  }

  // Add sorting methods
  onProjectSort(field: string, event?: Event): void {
    // Stop event propagation to prevent column toggle
    if (event) {
      event.stopPropagation();
    }

    if (this.projectSortField === field) {
      // If clicking on the same field, toggle the sort order
      this.projectSortOrder = this.projectSortOrder * -1;
    } else {
      // New sort field, default to ascending
      this.projectSortField = field;
      this.projectSortOrder = 1;
    }

    // Apply sorting
    this.sortProjects(field, this.projectSortOrder);
  }

  onReportSort(field: string, project: Project, event?: Event): void {
    // Stop event propagation to prevent column toggle and date picker opening
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    if (this.reportSortField === field) {
      // If clicking on the same field, toggle the sort order
      this.reportSortOrder = this.reportSortOrder * -1;
    } else {
      // New sort field, default to ascending
      this.reportSortField = field;
      this.reportSortOrder = 1;
    }

    // Apply sorting to the specific project's reports
    if (project && project.reports) {
      this.sortReports(project.reports, field, this.reportSortOrder);
    }
  }

  private sortProjects(field: string, order: number): void {
    // Sort the filtered projects that are displayed in the table
    this.filteredProjects.sort((a, b) => {
      const valueA = this.getProjectField(a, field);
      const valueB = this.getProjectField(b, field);

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

  private getProjectField(project: Project, field: string): any {
    if (field === 'name') {
      return project.name || '';
    }

    if (field === 'formattedZeitraum') {
      return project.zeitraum || '';
    }

    if (field === 'filialen') {
      // Return branchesCount for numeric sorting
      return project.branchesCount ?? 0;
    }

    if (field === 'status') {
      return this.getReportedPercentage(project);
    }

    return project[field as keyof Project] || '';
  }

  private getReportField(report: Report, field: string): any {
    if (field === 'status') {
      return report.status?.name || '';
    }

    if (field === 'isSpecCompliant' || field === 'feedback') {
      return report[field] ? 'Ja' : '';
    }

    return report[field as keyof Report] || '';
  }

  /**
   * Filter reports for a project based on the status filter
   * @param project The project to filter reports for
   * @returns Filtered reports array
   */
  filteredReports(project: Project): Report[] {
    if (!project.reports) {
      return [];
    }

    let filtered = project.reports;

    // Apply general status filter from query params
    if (this.statusFilter) {
      filtered = filtered.filter((report) => this.reportMatchesStatus(report, this.statusFilter));
    }

    // Apply column status filter (multiple selection)
    if (this.reportStatusFilter && Array.isArray(this.reportStatusFilter) && this.reportStatusFilter.length > 0) {
      filtered = filtered.filter((report) => {
        return report.status?.name && this.reportStatusFilter.includes(report.status.name);
      });
    }

    // Apply column merchandiser filter (multiple selection)
    if (this.reportMerchandiserFilter && Array.isArray(this.reportMerchandiserFilter) && this.reportMerchandiserFilter.length > 0) {
      filtered = filtered.filter((report) => {
        const merchandiserName = this.getReportMerchandiserName(report);
        return merchandiserName && this.reportMerchandiserFilter.includes(merchandiserName);
      });
    }

    // Apply column filialen filter (multiple selection)
    if (this.reportFilialenFilter && Array.isArray(this.reportFilialenFilter) && this.reportFilialenFilter.length > 0) {
      filtered = filtered.filter((report) => {
        return report.branch?.name && this.reportFilialenFilter.includes(report.branch.name);
      });
    }

    // Apply date range filter (filter by plannedOn)
    if (this.dateRange2.start && this.dateRange2.end) {
      filtered = filtered.filter((report) => {
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

    // Apply column plannedOn date filter (multiple selection)
    if (this.reportPlannedOnFilter && Array.isArray(this.reportPlannedOnFilter) && this.reportPlannedOnFilter.length > 0) {
      filtered = filtered.filter((report) => {
        if (!report.plannedOn) return false;
        const formattedDate = this.formatDateForFilter(report.plannedOn);
        return formattedDate && this.reportPlannedOnFilter.includes(formattedDate);
      });
    }

    // Apply generic column filters
    Object.keys(this.genericFilterValues).forEach((field) => {
      const filterValues = this.genericFilterValues[field];
      if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter((report) => {
          const value = this.getReportFieldValue(report, field);
          return value && filterValues.includes(value);
        });
      }
    });

    return filtered;
  }

  /**
   * Check if a report matches the specified status filter
   * @param report The report to check
   * @param statusFilter The status filter value
   * @returns true if the report matches the status filter
   */
  private reportMatchesStatus(report: Report, statusFilter: string): boolean {
    if (!report.status) {
      return false;
    }

    // Handle different status filter values - matching backend logic using enum
    switch (statusFilter.toLowerCase()) {
      case 'new':
        // Filter for new reports - NEW or ASSIGNED status (matching backend)
        return report.status.id === ReportStatusEnum.NEW || report.status.id === ReportStatusEnum.ASSIGNED;

      case 'completed':
        // Filter for completed reports - VALID status (matching backend)
        return report.status.id === ReportStatusEnum.VALID;

      case 'ongoing':
        // Filter for ongoing reports - all other statuses: DRAFT, IN_PROGRESS, DUE, FINISHED, OPENED_BY_CLIENT (matching backend)
        return [ReportStatusEnum.DRAFT, ReportStatusEnum.IN_PROGRESS, ReportStatusEnum.DUE, ReportStatusEnum.FINISHED, ReportStatusEnum.OPENED_BY_CLIENT, ReportStatusEnum.ACCEPTED].includes(
          report.status.id,
        );

      default:
        // For any other status, do exact match by name
        return report.status.name?.toLowerCase() === statusFilter.toLowerCase();
    }
  }

  /**
   * Get the display name for the status filter from query parameter
   * @returns The formatted status filter name for display, or empty string if no filter
   */
  getStatusFilterDisplayName(): string {
    if (!this.statusFilter) {
      return '';
    }

    const statusLower = this.statusFilter.toLowerCase();
    
    // Map common status filter values to display names
    switch (statusLower) {
      case 'new':
        return 'New';
      case 'completed':
        return 'Completed';
      case 'ongoing':
        return 'Ongoing';
      default:
        // For specific status names, capitalize first letter of each word
        return this.statusFilter
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
    }
  }

  // Download Excel for project
  downloadProjectCsv(project: any): void {
    if (!project) return;

    console.log('📊 Exporting project reports as Excel:', project);

    this.reportService.exportProjectReportsAsExcel(project.id).subscribe({
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

  // Methods to get unique values for filters
  getUniqueReportStatuses(project?: Project): any[] {
    const projectToUse = project || this.selectedProject;
    
    if (!projectToUse || !projectToUse.reports) {
      return [];
    }

    const statusMap = new Map<string, any>();
    projectToUse.reports.forEach((report) => {
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

  getUniqueMerchandisers(project?: Project): string[] {
    const projectToUse = project || this.selectedProject;
    
    if (!projectToUse || !projectToUse.reports) {
      return [];
    }

    const merchandiserSet = new Set<string>();
    
    projectToUse.reports.forEach((report) => {
      const merchandiserName = this.getReportMerchandiserName(report);
      if (merchandiserName && merchandiserName !== '') {
        merchandiserSet.add(merchandiserName);
      }
    });

    return Array.from(merchandiserSet).sort();
  }

  getUniqueFilialen(project?: Project): string[] {
    const projectToUse = project || this.selectedProject;
    
    if (!projectToUse || !projectToUse.reports) {
      return [];
    }
    
    const branchSet = new Set<string>();
    
    projectToUse.reports.forEach((report) => {
      if (report.branch?.name) {
        branchSet.add(report.branch.name);
      }
    });

    return Array.from(branchSet).sort();
  }

  /**
   * Get unique values for a specific field across all reports in the selected project
   */
  getUniqueValuesForField(field: string, project?: Project): string[] {
    const projectToUse = project || this.selectedProject;
    if (!projectToUse || !projectToUse.reports) {
      return [];
    }

    const valueSet = new Set<string>();

    projectToUse.reports.forEach((report) => {
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
    if (field === 'address') {
      return this.getReportAddress(report);
    }
    if (field === 'isSpecCompliant') {
      return report.isSpecCompliant ? 'Ja' : 'Nein';
    }
    if (field === 'feedback') {
      return report.feedback === true || report.feedback === 'true' ? 'Ja' : 'Nein';
    }
    if (field === 'plannedOn') {
      return report.plannedOn || '';
    }
    if (field === 'reportTo') {
      return report.reportTo || '';
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
    const isSameField = this.currentFilterField === field;
    const isPopoverOpen = this.activeFilterPopover === this.genericFilterPopover;
    
    // If clicking on the same field that's already open, just close it
    if (isSameField && isPopoverOpen) {
      this.genericFilterPopover.hide();
      this.activeFilterPopover = null;
      return;
    }
    
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
      
      // Use setTimeout to ensure the popover closes before reopening (if it was open)
      const delay = isPopoverOpen ? 150 : 50;
      setTimeout(() => {
        this.genericFilterPopover.show(positioningEvent);
        this.activeFilterPopover = this.genericFilterPopover;
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
    const col = this.reportCols.find((c) => c.field === field);
    return col ? col.header : field;
  }

  /**
   * Open status filter popover
   */
  openStatusFilter(event: Event): void {
    event.stopPropagation();
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) return;

    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }

    const isPopoverOpen = this.activeFilterPopover === this.statusFilterPopover;

    if (isPopoverOpen) {
      this.statusFilterPopover.hide();
      this.activeFilterPopover = null;
      return;
    }

    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }

    if (this.statusFilterPopover) {
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      const delay = isPopoverOpen ? 150 : 50;
      setTimeout(() => {
        this.statusFilterPopover.show(positioningEvent);
        this.activeFilterPopover = this.statusFilterPopover;
      }, delay);
    }
  }

  /**
   * Open merchandiser filter popover
   */
  openMerchandiserFilter(event: Event): void {
    event.stopPropagation();
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) return;

    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }

    const isPopoverOpen = this.activeFilterPopover === this.merchandiserFilterPopover;

    if (isPopoverOpen) {
      this.merchandiserFilterPopover.hide();
      this.activeFilterPopover = null;
      return;
    }

    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }

    if (this.merchandiserFilterPopover) {
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      const delay = isPopoverOpen ? 150 : 50;
      setTimeout(() => {
        this.merchandiserFilterPopover.show(positioningEvent);
        this.activeFilterPopover = this.merchandiserFilterPopover;
      }, delay);
    }
  }

  /**
   * Open filialen filter popover
   */
  openFilialenFilter(event: Event): void {
    event.stopPropagation();
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) return;

    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }

    const isPopoverOpen = this.activeFilterPopover === this.filialenFilterPopover;

    if (isPopoverOpen) {
      this.filialenFilterPopover.hide();
      this.activeFilterPopover = null;
      return;
    }

    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }

    if (this.filialenFilterPopover) {
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      const delay = isPopoverOpen ? 150 : 50;
      setTimeout(() => {
        this.filialenFilterPopover.show(positioningEvent);
        this.activeFilterPopover = this.filialenFilterPopover;
      }, delay);
    }
  }

  /**
   * Open plannedOn filter popover
   */
  openPlannedOnFilter(event: Event): void {
    event.stopPropagation();
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) return;

    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }

    const isPopoverOpen = this.activeFilterPopover === this.plannedOnFilterPopover;

    if (isPopoverOpen) {
      this.plannedOnFilterPopover.hide();
      this.activeFilterPopover = null;
      return;
    }

    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }

    if (this.plannedOnFilterPopover) {
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      const delay = isPopoverOpen ? 150 : 50;
      setTimeout(() => {
        this.plannedOnFilterPopover.show(positioningEvent);
        this.activeFilterPopover = this.plannedOnFilterPopover;
      }, delay);
    }
  }

  /**
   * Toggle project settings popover
   */
  toggleProjectSettingsPopover(event: Event): void {
    event.stopPropagation();
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) return;

    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }

    const isPopoverOpen = this.activeSettingsPopover === this.op;

    if (isPopoverOpen) {
      this.op.hide();
      this.activeSettingsPopover = null;
      return;
    }

    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }

    if (this.op) {
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      const delay = isPopoverOpen ? 150 : 50;
      setTimeout(() => {
        this.op.show(positioningEvent);
        this.activeSettingsPopover = this.op;
      }, delay);
    }
  }

  /**
   * Toggle report settings popover
   */
  toggleReportSettingsPopover(event: Event): void {
    event.stopPropagation();
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) return;

    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }

    const isPopoverOpen = this.activeSettingsPopover === this.reportColumnsPopover;

    if (isPopoverOpen) {
      this.reportColumnsPopover.hide();
      this.activeSettingsPopover = null;
      return;
    }

    if (this.activeSettingsPopover) {
      this.activeSettingsPopover.hide();
      this.activeSettingsPopover = null;
    }

    if (this.reportColumnsPopover) {
      const positioningEvent = {
        currentTarget: targetElement,
        target: targetElement,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;
      const delay = isPopoverOpen ? 150 : 50;
      setTimeout(() => {
        this.reportColumnsPopover.show(positioningEvent);
        this.activeSettingsPopover = this.reportColumnsPopover;
      }, delay);
    }
  }

  /**
   * Open plannedOn date filter by clicking the date range picker
   */
  openPlannedOnDateFilter(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    console.log('Opening date range picker');

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

  onPlannedOnColumnClick(event: Event) {
    event.stopPropagation();
    this.openPlannedOnDateFilter(event);
  }

  /**
   * Calculate column width percentage based on column type
   */
  getColumnWidth(field: string, columns: Column[]): number {
    // Custom width mapping for each column (in percentage)
    const columnWidths: { [key: string]: number } = {
      'status': 4,           // Status column
      'plannedOn': 4,        // Geplant column
      'merchandiser': 6,    // Merchandiser column
      'branch.name': 6,      // Filiale column
      'address': 8,         // Adresse column
      'note': 4,            // Notiz column
      'reportTo': 5,         // Report bis column
      'isSpecCompliant': 7,  // Alles nach Vorgabe? column
      'feedback': 4,          // Feedback column
      'actions': 5           // Actions column (Column Settings)
    };

    // If column has a custom width defined, return it
    if (columnWidths[field]) {
      return columnWidths[field];
    }

    // Default width for any column not in the mapping
    return 8;
  }

  /**
   * Get unique plannedOn dates from a project's reports
   * @param project The project to get dates from (optional, defaults to selectedProject)
   * @returns Array of unique formatted date strings
   */
  getUniquePlannedOnDates(project?: Project): string[] {
    const projectToUse = project || this.selectedProject;

    if (!projectToUse || !projectToUse.reports) {
      return [];
    }

    const dateSet = new Set<string>();

    projectToUse.reports.forEach((report) => {
      if (report.plannedOn) {
        const formattedDate = this.formatDateForFilter(report.plannedOn);
        if (formattedDate) {
          dateSet.add(formattedDate);
        }
      }
    });

    return Array.from(dateSet).sort();
  }

  /**
   * Format a date for filtering (consistent format)
   */
  private formatDateForFilter(date: string | Date): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    // Format as DD.MM.YYYY (EU format)
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  }

  // Project column filter methods
  getProjectFilterOptions(field: string): string[] {
    const values = new Set<string>();
    this.projects.forEach((project) => {
      let value: string = '';
      switch (field) {
        case 'name':
          value = project.name || '';
          break;
        case 'formattedZeitraum':
          value = project.zeitraum || '';
          break;
        case 'filialen':
          value = `${project.branchesCount ?? 0} Stores`;
          break;
        case 'status':
          value = `${project.reportedPercentage ?? 0}% reported`;
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
    const isSameField = this.currentProjectFilterField === field;
    const isPopoverOpen = this.activeFilterPopover === this.projectColumnFilterPopover;
    
    // If clicking on the same field that's already open, just close it
    if (isSameField && isPopoverOpen) {
      this.projectColumnFilterPopover.hide();
      this.activeFilterPopover = null;
      return;
    }
    
    // Close any other open filter popover
    if (this.activeFilterPopover) {
      this.activeFilterPopover.hide();
      this.activeFilterPopover = null;
    }
    
    // Update the current filter field
    this.currentProjectFilterField = field;
    
    // Open the popover with the new field using show() method for better control
    if (this.projectColumnFilterPopover) {
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
        this.projectColumnFilterPopover.show(positioningEvent);
        this.activeFilterPopover = this.projectColumnFilterPopover;
      }, delay);
    }
  }

  hasProjectColumnFilters(): boolean {
    return Object.values(this.projectColumnFilters).some(filters => filters.length > 0);
  }

  /**
   * Check if there are any report column filters active
   */
  hasReportColumnFilters(): boolean {
    return (
      (this.reportStatusFilter && this.reportStatusFilter.length > 0) ||
      (this.reportMerchandiserFilter && this.reportMerchandiserFilter.length > 0) ||
      (this.reportFilialenFilter && this.reportFilialenFilter.length > 0) ||
      (this.reportPlannedOnFilter && this.reportPlannedOnFilter.length > 0) ||
      Object.values(this.genericFilterValues).some(filters => filters && filters.length > 0)
    );
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
}
