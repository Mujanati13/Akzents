import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TableRowCollapseEvent, TableRowExpandEvent } from 'primeng/table';
import { catchError, of, filter, debounceTime } from 'rxjs';
import { ReportService, Report } from '@app/@core/services/report.service';
import { ProjectService } from '@app/@core/services/project.service';
import { ClientService, AssignedProject } from '@app/@core/services/client.service';
import { HotToastService } from '@ngneat/hot-toast';
import { ReportStatusEnum } from '@app/@core/enums/status.enum';

interface Project {
  id?: string;
  name?: string;
  zeitraum?: string;
  calendarWeek?: string;
  filialen?: number;
  branchesCount?: number;
  status?: string;
  isFavorite?: boolean;
  reports?: Report[];
  slug?: string;
  clientId?: string;
  clientName?: string;
  reportedPercentage?: number; // Calculated in backend
}

interface Column {
  field: string;
  header: string;
}

@UntilDestroy()
@Component({
  selector: 'app-projects',
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.scss'],
  standalone: false,
})
export class ProjectsComponent implements OnInit {
  activeFilter: 'all' | 'running' | 'completed' = 'all';
  dateRange: Date[] = [];
  projects: Project[] = [];
  selectedProject: Project | null = null;
  expandedRows: { [key: string]: boolean } = {};
  cols: Column[] = [];
  selectedColumns: Column[] = [];
  reportCols: Column[] = [];
  selectedReportColumns: Column[] = [];

  // Filter properties
  projectSearchTerm: string = '';
  filialeSearchTerm: string = '';
  filteredProjects: Project[] = [];

  // Loading state
  isLoadingProjects = false;
  loadingReports: { [projectId: string]: boolean } = {};

  // Sort properties
  projectSortField: string = '';
  projectSortOrder: number = 1;
  reportSortField: string = '';
  reportSortOrder: number = 1;

  // Column management
  projectsOrderedColumns: Column[] = [];
  reportsOrderedColumns: Column[] = [];
  projectsVisibleColumns: { [key: string]: boolean } = {};
  reportsVisibleColumns: { [key: string]: boolean } = {};

  // Report filters
  reportStatusFilter: string[] = [];
  reportMerchandiserFilter: string[] = [];
  reportFilialenFilter: string[] = [];
  reportPlannedOnFilter: string[] = [];
  
  // Project column filters
  projectColumnFilterValues: { [field: string]: string[] } = {};
  currentProjectFilterField: string = '';
  
  // Generic filter properties
  genericFilterValues: { [field: string]: string[] } = {};
  currentFilterField: string = '';
  
  // Date range filter
  dateRange2 = { start: null, end: null };

  @ViewChild('csvFileInput') csvFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('genericFilterPopover') genericFilterPopover: any;
  @ViewChild('projectColumnFilterPopover') projectColumnFilterPopover: any;
  @ViewChild('statusFilterPopover') statusFilterPopover: any;
  @ViewChild('merchandiserFilterPopover') merchandiserFilterPopover: any;
  @ViewChild('filialenFilterPopover') filialenFilterPopover: any;
  @ViewChild('plannedOnFilterPopover') plannedOnFilterPopover: any;
  @ViewChild('op') op: any;
  @ViewChild('reportColumnsPopover') reportColumnsPopover: any;
  csvDialogVisible = false;
  isUpload = false;
  dialogMessage = '';
  uploadedCsvData: any[] = [];
  csvDialogIsError: boolean = false;
  statusFilter: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private reportService: ReportService,
    private projectService: ProjectService,
    private clientService: ClientService,
    private toast: HotToastService,
  ) {}

  ngOnInit(): void {
    // Restore filter state from sessionStorage if available
    this.restoreFilterState();
    
    this.initializeColumns();
    this.loadProjects();
    this.setupRouteListener();
    this.setupNavigationListener();
  }

  onRangeSelected(range: { start: Date | null; end: Date | null }) {
    console.log('Selected range:', range);
    this.dateRange2 = range;
  }

  // Add these methods for the filter buttons
  showAllClients(): void {
    this.activeFilter = 'all';
    // Reset date range when showing all projects
    this.dateRange = [];
    this.dateRange2 = { start: null, end: null };
    this.applyFilters();
  }

  showRunningProjects(): void {
    this.activeFilter = 'running';
    this.applyFilters();
  }

  showCompletedProjects(): void {
    this.activeFilter = 'completed';
    this.applyFilters();
  }

  private initializeColumns(): void {
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
    this.selectedReportColumns = this.reportCols.filter((col) => col.field !== 'note' && col.field !== 'feedback' && col.field !== 'isSpecCompliant');

    // Initialize ordered columns
    this.projectsOrderedColumns = [...this.cols];
    this.reportsOrderedColumns = [...this.reportCols];

    // Initialize visible columns
    this.initializeVisibleColumns();
  }

  private initializeVisibleColumns(): void {
    // Set all project columns to visible by default
    this.cols.forEach((col) => {
      this.projectsVisibleColumns[col.field] = true;
    });

    // Set report columns - all visible by default except feedback and isSpecCompliant
    this.reportCols.forEach((col) => {
        this.reportsVisibleColumns[col.field] = true;
    });
    // Explicitly set feedback and isSpecCompliant to false by default
    this.reportsVisibleColumns['feedback'] = false;
    this.reportsVisibleColumns['isSpecCompliant'] = false;
  }

  private loadProjects(): void {
    // Prevent multiple simultaneous calls
    if (this.isLoadingProjects) {
      console.log('📦 ProjectsComponent: Already loading projects, skipping duplicate call');
      return;
    }

    console.log('📦 ProjectsComponent: Loading projects from API');
    this.isLoadingProjects = true;

    this.clientService
      .getAssignedProjects()
      .pipe(
        catchError((error) => {
          console.error('❌ Error loading assigned projects:', error);
          this.toast.error('Fehler beim Laden der Projekte', {
            position: 'bottom-right',
            duration: 4000,
          });
          this.isLoadingProjects = false;
          return of([]);
        }),
        untilDestroyed(this),
      )
      .subscribe((assignedProjects) => {
        console.log('📦 ProjectsComponent: Raw API response:', assignedProjects);
        console.log('📦 ProjectsComponent: Loading projects from API:', assignedProjects.length, 'projects');

        // Convert AssignedProject to Project interface
        this.projects = assignedProjects.map((ap) => {
          const transformed = this.transformAssignedProjectToProject(ap);
          console.log('📦 ProjectsComponent: Transformed project:', transformed);
          return transformed;
        });

        this.isLoadingProjects = false;

        // Apply filters after projects are loaded (this will apply any restored filter state)
        this.applyFilters();

        // After projects are loaded, check if we need to expand a specific project
        this.checkAndExpandProjectFromRoute();
      });
  }

  /**
   * Transform AssignedProject from API to Project interface for the component
   */
  private transformAssignedProjectToProject(assignedProject: AssignedProject): Project {
    const startDate = new Date(assignedProject.startDate);
    const endDate = new Date(assignedProject.endDate);

    // Generate date range string
    const zeitraum = `${startDate.getDate().toString().padStart(2, '0')}.${(startDate.getMonth() + 1).toString().padStart(2, '0')}. - ${endDate.getDate().toString().padStart(2, '0')}.${(endDate.getMonth() + 1).toString().padStart(2, '0')}.${endDate.getFullYear()}`;

    // Generate week number
    const calendarWeek = `KW ${this.getWeekNumber(startDate)}`;

    // Generate slug from name
    const slug = assignedProject.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    // Determine status based on dates if not provided by API
    let status = assignedProject.status || 'running';
    if (!assignedProject.status) {
      const today = new Date();
      if (endDate < today) {
        status = 'completed';
      }
    }

    return {
      id: assignedProject.id.toString(),
      name: assignedProject.name,
      slug: slug,
      clientId: assignedProject.clientCompany?.id?.toString() || '1',
      clientName: assignedProject.clientCompany?.name || 'Unknown Client',
      zeitraum: zeitraum,
      calendarWeek: calendarWeek,
      filialen: 0, // Default value - you can get this from API if available
      branchesCount: 0, // Will be calculated when reports are loaded
      status: status,
      isFavorite: assignedProject.isFavorite,
      reports: [], // Will be loaded when project is expanded
      reportedPercentage: assignedProject.reportedPercentage, // Use backend-calculated value
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

  private setupRouteListener(): void {
    // Listen for route changes
    this.route.params.pipe(untilDestroyed(this)).subscribe((params) => {
      this.statusFilter = this.route.snapshot.queryParamMap.get('status') || '';

      const projectId = params['projectId'];
      console.log('🔄 ProjectsComponent: Route params changed:', params, 'projectId:', projectId);

      if (projectId && this.projects.length > 0) {
        // Find and expand the specific project
        this.checkAndExpandProjectFromRoute();
      } else if (projectId && this.projects.length === 0) {
        // If we have a projectId but no projects loaded yet, wait for projects to load
        console.log('⏳ ProjectsComponent: Waiting for projects to load before expanding projectId:', projectId);
      } else if (!projectId) {
        // No projectId in route - collapse any expanded rows
        console.log('📂 ProjectsComponent: No projectId in route, collapsing expanded rows');
        this.collapseAllProjects();
      }
    });
  }

  private setupNavigationListener(): void {
    // Listen for navigation events to reload projects when coming back to this page
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        debounceTime(100), // Debounce to prevent rapid successive calls
        untilDestroyed(this),
      )
      .subscribe((event: NavigationEnd) => {
        const currentUrl = event.urlAfterRedirects;
        console.log('🔄 ProjectsComponent: Navigation detected:', currentUrl);

        // Save filter state when navigating to report detail
        if (currentUrl.includes('/reports/') && currentUrl.startsWith('/projects/')) {
          this.saveFilterState();
        }

        // Check if we're navigating to the projects page (with or without projectId)
        if (currentUrl === '/projects' || currentUrl.startsWith('/projects/')) {
          // Restore filter state when coming back (but don't restore expandedRows if navigating to specific project)
          if (!currentUrl.includes('/reports/')) {
            const hasProjectId = currentUrl.match(/\/projects\/(\d+)/);
            if (hasProjectId) {
              // Navigating to specific project - restore filters but not expandedRows
              this.restoreFilterStateWithoutExpandedRows();
            } else {
              // Navigating to /projects - restore everything including expandedRows
              this.restoreFilterState();
            }
          }
          // Only reload if we don't have projects loaded yet or if we're coming from a different page
          if (this.projects.length === 0) {
            console.log('📦 ProjectsComponent: No projects loaded, loading projects');
            this.loadProjects();
          } else {
            console.log('📦 ProjectsComponent: Projects already loaded, skipping reload');
            // Check if we need to expand a project from the route
            this.checkAndExpandProjectFromRoute();
          }
        }
      });
  }

  private checkAndExpandProjectFromRoute(): void {
    const projectId = this.route.snapshot.params['projectId'];
    console.log('🔍 ProjectsComponent: Checking route for projectId:', projectId, 'Available projects:', this.projects.length);

    if (projectId && this.projects.length > 0) {
      // Convert projectId to string for comparison since it might come as number from route
      const projectIdStr = projectId.toString();
      const project = this.projects.find((p) => p.id?.toString() === projectIdStr || p.slug === projectIdStr);
      console.log('🔍 ProjectsComponent: Found project:', project?.name, 'Project ID:', project?.id, 'Looking for:', projectIdStr);

      if (project) {
        console.log('✅ ProjectsComponent: Expanding project:', project.name);
        // Check if project is already expanded (check both string and numeric keys)
        const projectIdKey = project.id!.toString();
        const isAlreadyExpanded = this.expandedRows[projectIdKey] === true || 
                                  (typeof project.id === 'number' && this.expandedRows[project.id] === true);
        console.log('📂 ProjectsComponent: Project already expanded?', isAlreadyExpanded, 'expandedRows:', this.expandedRows);
        
        if (!isAlreadyExpanded || !project.reports || project.reports.length === 0) {
          // Only call selectProject if not already expanded or if reports aren't loaded
          this.selectProject(project);
        } else {
          // Project is already expanded and has reports, just ensure expandedRows is set
          this.expandedRows[projectIdKey] = true;
          if (typeof project.id === 'number') {
            this.expandedRows[project.id] = true;
          }
          this.selectedProject = project;
          console.log('📂 ProjectsComponent: Project already expanded with reports, ensuring expandedRows is set');
        }
      } else {
        console.log('❌ ProjectsComponent: Project not found for ID:', projectIdStr);
        console.log(
          '🔍 Available projects:',
          this.projects.map((p) => ({ id: p.id, name: p.name })),
        );
      }
    } else if (!projectId) {
      // No projectId in route - collapse any expanded rows
      console.log('📂 ProjectsComponent: No projectId in route, collapsing expanded rows');
      this.collapseAllProjects();
    }
  }

  // Navigation methods
  selectProject(project: Project): void {
    console.log('🎯 ProjectsComponent: Selecting project:', project.name, 'ID:', project.id);
    this.selectedProject = project;

    // Expand the selected project row
    if (project && project.id) {
      this.expandedRows = {}; // Clear any previous expanded rows
      const projectIdKey = project.id.toString();
      this.expandedRows[projectIdKey] = true;
      // Also set with numeric key if project.id is a number
      if (typeof project.id === 'number') {
        this.expandedRows[project.id] = true;
      }
      console.log('📂 ProjectsComponent: Expanded rows:', this.expandedRows);

      // Load reports for this project
      this.loadProjectReports(project);

      // Only navigate if we're not already on the correct route
      const currentProjectId = this.route.snapshot.params['projectId'];
      const currentProjectIdStr = currentProjectId?.toString();
      const projectIdStr = project.id.toString();

      console.log('🔄 ProjectsComponent: Current route projectId:', currentProjectIdStr, 'Selected projectId:', projectIdStr);

      if (currentProjectIdStr !== projectIdStr) {
        console.log('🧭 ProjectsComponent: Navigating to:', `/projects/${project.id}`);
        if (this.statusFilter) {
          this.router.navigate(['/projects', project.id], { queryParams: { status: this.statusFilter } });
        } else {
          this.router.navigate(['/projects', project.id]);
        }
      } else {
        console.log('📍 ProjectsComponent: Already on correct route, no navigation needed');
      }
    }
  }

  private loadProjectReports(project: Project): void {
    console.log('📡 ProjectsComponent: Loading reports for project:', project.name, 'ID:', project.id);

    // Set loading state
    if (project && project.id) {
      const projectIdKey = project.id.toString();
      this.loadingReports[projectIdKey] = true;
      // Ensure the project row is expanded
      this.expandedRows[projectIdKey] = true;
      // Also set with numeric key if project.id is a number
      if (typeof project.id === 'number') {
        this.loadingReports[project.id] = true;
        this.expandedRows[project.id] = true;
      }
      console.log('📂 ProjectsComponent: Ensuring project row is expanded:', this.expandedRows);
    }

    this.reportService.getReportsByProject(project.id!).subscribe({
      next: (reports) => {
        console.log('✅ ProjectsComponent: Reports loaded successfully:', reports.length, 'reports');
        project.reports = reports;
        // Calculate branchesCount from unique branches in reports
        const uniqueBranches = new Set<string>();
        reports.forEach((report) => {
          if (report.branch?.id) {
            uniqueBranches.add(report.branch.id.toString());
          }
        });
        project.branchesCount = uniqueBranches.size;
        // Clear loading state
        if (project && project.id) {
          const projectIdKey = project.id.toString();
          this.loadingReports[projectIdKey] = false;
          // Also clear with numeric key if project.id is a number
          if (typeof project.id === 'number') {
            this.loadingReports[project.id] = false;
          }
          // Ensure the project row remains expanded after loading
          this.expandedRows[projectIdKey] = true;
          // Also set with numeric key if project.id is a number
          if (typeof project.id === 'number') {
            this.expandedRows[project.id] = true;
          }
          console.log('📂 ProjectsComponent: Reports loaded, expandedRows:', this.expandedRows);
          console.log('📂 ProjectsComponent: Project ID:', project.id, 'Type:', typeof project.id);
          console.log('📂 ProjectsComponent: Total reports:', reports.length, 'Filtered reports count:', this.filteredReports(project).length);
        }
      },
      error: (err) => {
        console.error('❌ ProjectsComponent: Error fetching reports for project:', err);
        
        // Clear loading state on error
        if (project && project.id) {
          const projectIdKey = project.id.toString();
          this.loadingReports[projectIdKey] = false;
          // Also clear with numeric key if project.id is a number
          if (typeof project.id === 'number') {
            this.loadingReports[project.id] = false;
          }
        }
        
        // Check if it's a 403 Forbidden error (permission denied)
        if (err.status === 403) {
          this.toast.error('Sie haben keine Berechtigung, auf dieses Projekt zuzugreifen.', {
            position: 'bottom-right',
            duration: 3000,
          });
          this.router.navigate(['/projects']);
        } else {
          this.toast.error('Fehler beim Laden der Berichte.', {
            position: 'bottom-right',
            duration: 3000,
          });
        }
        
        project.reports = [];
      },
    });
  }

  // Table event handlers
  onRowExpand(event: TableRowExpandEvent): void {
    console.log('📂 ProjectsComponent: Project Expanded:', event.data.name);

    // Set loading state
    if (event.data && event.data.id) {
      this.loadingReports[event.data.id] = true;
    }

    // Load reports if not already loaded
    if (event.data && !event.data.reports) {
      this.loadProjectReports(event.data);
    } else if (event.data && event.data.reports) {
      // Reports already loaded, clear loading state
      if (event.data.id) {
        this.loadingReports[event.data.id] = false;
      }
    }
  }

  onRowCollapse(event: TableRowCollapseEvent): void {
    console.log('📂 ProjectsComponent: Project Collapsed:', event.data.name);

    // Clear loading state
    if (event.data && event.data.id) {
      this.loadingReports[event.data.id] = false;
    }

    // If the collapsed row is the selected project, clear selection
    if (this.selectedProject && this.selectedProject.id?.toString() === event.data.id?.toString()) {
      this.selectedProject = null;
      if (this.statusFilter) {
        this.router.navigate(['/projects'], { queryParams: { status: this.statusFilter } });
      } else {
        this.router.navigate(['/projects']);
      }
    }
  }

  // Collapse currently expanded project
  collapseProject(): void {
    this.expandedRows = {};
    this.selectedProject = null;
    if (this.statusFilter) {
      this.router.navigate(['/projects'], { queryParams: { status: this.statusFilter } });
    } else {
      this.router.navigate(['/projects']);
    }
  }

  // Toggle project expansion
  toggleProject(project: Project, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (project && project.id) {
      const projectId = project.id.toString();
      const isExpanded = this.expandedRows[projectId] === true;

      if (isExpanded) {
        // Collapse the project
        delete this.expandedRows[projectId];
        if (this.selectedProject && this.selectedProject.id?.toString() === projectId) {
          this.selectedProject = null;
          if (this.statusFilter) {
            this.router.navigate(['/projects'], { queryParams: { status: this.statusFilter } });
          } else {
            this.router.navigate(['/projects']);
          }
        }
      } else {
        // Expand the project
        this.expandedRows = {}; // Clear any previous expanded rows
        this.expandedRows[projectId] = true;
        this.selectedProject = project;
        
        // Load reports for this project
        this.loadProjectReports(project);

        // Navigate to the project route
        if (this.statusFilter) {
          this.router.navigate(['/projects', project.id], { queryParams: { status: this.statusFilter } });
        } else {
          this.router.navigate(['/projects', project.id]);
        }
      }
    }
  }

  // Collapse all projects (when navigating to /projects without projectId)
  collapseAllProjects(): void {
    console.log('📂 ProjectsComponent: Collapsing all projects');
    this.expandedRows = {};
    this.selectedProject = null;
  }

  // Filter methods
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

  private applyFilters(): void {
    this.filteredProjects = this.projects.filter((project) => {
      // Active filter (all, running, completed)
      let matchesActiveFilter = true;
      if (this.activeFilter === 'running') {
        matchesActiveFilter = project.status === 'running' || project.status === 'active';
      } else if (this.activeFilter === 'completed') {
        matchesActiveFilter = project.status === 'completed' || project.status === 'closed';
      }
      // If activeFilter is 'all', matchesActiveFilter remains true

      // Project search
      const matchesProject = !this.projectSearchTerm || (project.name && project.name.toLowerCase().includes(this.projectSearchTerm));

      // Filiale search
      const matchesFiliale = !this.filialeSearchTerm || (project.reports && project.reports.some((report) => report.branch?.name && report.branch.name.toLowerCase().includes(this.filialeSearchTerm)));

      // Project column filters
      let matchesColumnFilters = true;
      this.cols.forEach((col) => {
        const filterValues = this.projectColumnFilterValues[col.field];
        if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
          let projectValue: string = '';
          
          if (col.field === 'formattedZeitraum') {
            projectValue = project.zeitraum || '';
          } else if (col.field === 'filialen') {
            const count = project.branchesCount ?? 0;
            projectValue = `${count} Stores`;
          } else if (col.field === 'status') {
            const percentage = project.reportedPercentage ?? 0;
            projectValue = `${percentage}% reported`;
          } else {
            projectValue = project[col.field as keyof Project]?.toString() || '';
          }
          
          if (!filterValues.includes(projectValue)) {
            matchesColumnFilters = false;
          }
        }
      });

      const projectNameFilter = this.projectColumnFilterValues['name'];
      if (matchesColumnFilters && projectNameFilter && Array.isArray(projectNameFilter) && projectNameFilter.length > 0) {
        const projectName = project.name || '';
        if (!projectNameFilter.includes(projectName)) {
          matchesColumnFilters = false;
        }
      }

      return matchesActiveFilter && matchesProject && matchesFiliale && matchesColumnFilters;
    });
    
    // Save filter state after applying filters
    this.saveFilterState();
  }

  clearFilters(): void {
    this.projectSearchTerm = '';
    this.filialeSearchTerm = '';
    this.activeFilter = 'all';
    this.dateRange = [];
    this.dateRange2 = { start: null, end: null };
    this.reportStatusFilter = [];
    this.reportMerchandiserFilter = [];
    this.reportFilialenFilter = [];
    this.reportPlannedOnFilter = [];
    this.projectColumnFilterValues = {};
    this.genericFilterValues = {};
    this.applyFilters();
    // Clear saved filter state
    sessionStorage.removeItem('projectsFilterState');
    // Navigate to clear query parameters
    this.router.navigate(['/projects'], { queryParams: {} });
  }

  private saveFilterState(): void {
    try {
      const filterState = {
        activeFilter: this.activeFilter,
        dateRange2: this.dateRange2,
        projectSearchTerm: this.projectSearchTerm,
        filialeSearchTerm: this.filialeSearchTerm,
        reportStatusFilter: this.reportStatusFilter,
        reportMerchandiserFilter: this.reportMerchandiserFilter,
        reportFilialenFilter: this.reportFilialenFilter,
        reportPlannedOnFilter: this.reportPlannedOnFilter,
        projectColumnFilterValues: this.projectColumnFilterValues,
        genericFilterValues: this.genericFilterValues,
        expandedRows: this.expandedRows,
      };
      sessionStorage.setItem('projectsFilterState', JSON.stringify(filterState));
      console.log('💾 ProjectsComponent: Filter state saved');
    } catch (error) {
      console.error('Failed to save filter state:', error);
    }
  }

  private restoreFilterState(): void {
    try {
      const savedState = sessionStorage.getItem('projectsFilterState');
      if (savedState) {
        const filterState = JSON.parse(savedState);
        this.activeFilter = filterState.activeFilter || 'all';
        this.dateRange2 = filterState.dateRange2 || { start: null, end: null };
        this.projectSearchTerm = filterState.projectSearchTerm || '';
        this.filialeSearchTerm = filterState.filialeSearchTerm || '';
        this.reportStatusFilter = filterState.reportStatusFilter || [];
        this.reportMerchandiserFilter = filterState.reportMerchandiserFilter || [];
        this.reportFilialenFilter = filterState.reportFilialenFilter || [];
        this.reportPlannedOnFilter = filterState.reportPlannedOnFilter || [];
        this.projectColumnFilterValues = filterState.projectColumnFilterValues || {};
        this.genericFilterValues = filterState.genericFilterValues || {};
        this.expandedRows = filterState.expandedRows || {};
        
        // Convert date strings back to Date objects if needed
        if (this.dateRange2.start && typeof this.dateRange2.start === 'string') {
          this.dateRange2.start = new Date(this.dateRange2.start);
        }
        if (this.dateRange2.end && typeof this.dateRange2.end === 'string') {
          this.dateRange2.end = new Date(this.dateRange2.end);
        }
        
        console.log('📂 ProjectsComponent: Filter state restored');
        // Filters will be applied after projects are loaded in loadProjects()
      } else {
        // Initialize filters if no saved state
        this.reportStatusFilter = [];
        this.reportMerchandiserFilter = [];
        this.reportFilialenFilter = [];
        this.reportPlannedOnFilter = [];
        this.projectColumnFilterValues = {};
      }
    } catch (error) {
      console.error('Failed to restore filter state:', error);
      // Initialize filters on error
      this.reportStatusFilter = [];
      this.reportMerchandiserFilter = [];
      this.reportFilialenFilter = [];
      this.reportPlannedOnFilter = [];
      this.projectColumnFilterValues = {};
    }
  }

  private restoreFilterStateWithoutExpandedRows(): void {
    try {
      const savedState = sessionStorage.getItem('projectsFilterState');
      if (savedState) {
        const filterState = JSON.parse(savedState);
        this.activeFilter = filterState.activeFilter || 'all';
        this.dateRange2 = filterState.dateRange2 || { start: null, end: null };
        this.projectSearchTerm = filterState.projectSearchTerm || '';
        this.filialeSearchTerm = filterState.filialeSearchTerm || '';
        this.reportStatusFilter = filterState.reportStatusFilter || [];
        this.reportMerchandiserFilter = filterState.reportMerchandiserFilter || [];
        this.reportFilialenFilter = filterState.reportFilialenFilter || [];
        this.reportPlannedOnFilter = filterState.reportPlannedOnFilter || [];
        this.projectColumnFilterValues = filterState.projectColumnFilterValues || {};
        this.genericFilterValues = filterState.genericFilterValues || {};
        // Don't restore expandedRows - let the route handler expand the project
        
        // Convert date strings back to Date objects if needed
        if (this.dateRange2.start && typeof this.dateRange2.start === 'string') {
          this.dateRange2.start = new Date(this.dateRange2.start);
        }
        if (this.dateRange2.end && typeof this.dateRange2.end === 'string') {
          this.dateRange2.end = new Date(this.dateRange2.end);
        }
        
        console.log('📂 ProjectsComponent: Filter state restored (without expandedRows)');
        // Filters will be applied after projects are loaded in loadProjects()
      } else {
        // Initialize filters if no saved state
        this.reportStatusFilter = [];
        this.reportMerchandiserFilter = [];
        this.reportFilialenFilter = [];
        this.reportPlannedOnFilter = [];
        this.projectColumnFilterValues = {};
      }
    } catch (error) {
      console.error('Failed to restore filter state:', error);
      // Initialize filters on error
      this.reportStatusFilter = [];
      this.reportMerchandiserFilter = [];
      this.reportFilialenFilter = [];
      this.reportPlannedOnFilter = [];
      this.projectColumnFilterValues = {};
    }
  }

  // Sort methods
  onProjectSort(field: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    if (this.projectSortField === field) {
      this.projectSortOrder = this.projectSortOrder * -1;
    } else {
      this.projectSortField = field;
      this.projectSortOrder = 1;
    }

    this.sortProjects(field, this.projectSortOrder);
  }

  onReportSort(field: string, project: Project, event?: Event): void {
    // Stop event propagation to prevent column toggle and date picker opening
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    if (this.reportSortField === field) {
      this.reportSortOrder = this.reportSortOrder * -1;
    } else {
      this.reportSortField = field;
      this.reportSortOrder = 1;
    }

    if (project && project.reports) {
      this.sortReports(project.reports, field, this.reportSortOrder);
    }
  }

  private sortProjects(field: string, order: number): void {
    // Sort the filtered projects that are displayed in the table
    this.filteredProjects.sort((a, b) => {
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

  private sortReports(reports: Report[], field: string, order: number): void {
    reports.sort((a, b) => {
      const valueA = this.getReportField(a, field);
      const valueB = this.getReportField(b, field);

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
    if (field === 'filialen') {
      // Return branchesCount for numeric sorting
      return project.branchesCount ?? 0;
    }
    if (field === 'status') return this.getReportedPercentage(project);
    return project[field as keyof Project] || '';
  }

  private getReportField(report: Report, field: string): any {
    if (field === 'status') return report.status?.name || '';
    if (field === 'isSpecCompliant' || field === 'feedback') return report[field] ? 'Ja' : '';
    return report[field as keyof Report] || '';
  }

  // Utility methods
  getReportedPercentage(project: Project): number {
    // Use backend-calculated value if available, otherwise fallback to 0
    return project.reportedPercentage ?? 0;
  }

  getReportAddress(report: Report): string {
    const street = report.street || '';
    const zip = report.zipCode || '';
    let city = '';
    if (report.branch) {
      if ((report.branch as any).city && (report.branch as any).city.name) {
        city = (report.branch as any).city.name;
      } else {
        city = report.branch.name || '';
      }
    }
    return [street, zip, city].filter(Boolean).join(', ');
  }

  getReportMerchandiserName(report: Report): string {
    if (report.merchandiser && report.merchandiser.user) {
      const user = report.merchandiser.user;
      return [user.firstName, user.lastName].filter(Boolean).join(' ');
    }
    return '';
  }

  // Column management methods
  getProjectsVisibleColumns(): Column[] {
    return this.projectsOrderedColumns.filter((col) => this.projectsVisibleColumns[col.field]);
  }

  getReportsVisibleColumns(): Column[] {
    return this.reportsOrderedColumns.filter((col) => this.reportsVisibleColumns[col.field]);
  }

  onProjectsColReorder(event: any): void {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      const movedColumn = this.projectsOrderedColumns[event.dragIndex];
      const newOrderedColumns = [...this.projectsOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);
      this.projectsOrderedColumns = newOrderedColumns;
    }
  }

  onReportsColReorder(event: any): void {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      const movedColumn = this.reportsOrderedColumns[event.dragIndex];
      const newOrderedColumns = [...this.reportsOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);
      this.reportsOrderedColumns = newOrderedColumns;
    }
  }

  onProjectsColumnsChange(selectedColumns: Column[]): void {
    Object.keys(this.projectsVisibleColumns).forEach((key) => {
      this.projectsVisibleColumns[key] = false;
    });

    selectedColumns.forEach((col) => {
      this.projectsVisibleColumns[col.field] = true;
    });

    this.selectedColumns = selectedColumns;
  }

  onReportsColumnsChange(selectedColumns: Column[]): void {
    Object.keys(this.reportsVisibleColumns).forEach((key) => {
      this.reportsVisibleColumns[key] = false;
    });

    selectedColumns.forEach((col) => {
      this.reportsVisibleColumns[col.field] = true;
    });

    this.selectedReportColumns = selectedColumns;
  }

  // Favorite methods
  onFavoriteChanged(newStatus: boolean, project: Project): void {
    console.log('🔄 ProjectsComponent: Toggling project favorite status:', { id: project.id, newStatus });

    const previousStatus = project.isFavorite;
    project.isFavorite = newStatus;

    // Call API to update project favorite status
    this.projectService.toggleFavoriteStatus(project.id!).subscribe({
      next: (updatedProject) => {
        console.log('✅ ProjectsComponent: Project favorite status updated:', updatedProject);
        project.isFavorite = updatedProject.isFavorite;
      },
      error: (err) => {
        console.error('❌ ProjectsComponent: Error updating project favorite status:', err);
        project.isFavorite = previousStatus; // Revert on error
      },
    });
  }

  onReportFavoriteChanged(newStatus: boolean, report: Report): void {
    const previousStatus = report.isFavorite;
    report.isFavorite = newStatus;

    // Call API to update report favorite status
    this.reportService.toggleFavoriteStatus(report.id!).subscribe({
      next: (updatedReport) => {
        console.log('✅ ProjectsComponent: Report favorite status updated:', updatedReport);
        report.isFavorite = updatedReport.isFavorite;
      },
      error: (err) => {
        console.error('❌ ProjectsComponent: Error updating report favorite status:', err);
        report.isFavorite = previousStatus; // Revert on error
      },
    });
  }

  // Download Excel for project (previously downloadProjectCsv)
  downloadProjectCsv(project: Project): void {
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

        this.isUpload = false;
        this.dialogMessage = 'Excel-Export erfolgreich heruntergeladen';
        this.csvDialogVisible = true;
      },
      error: (error) => {
        console.error('❌ Error exporting Excel:', error);
        
        // Check if it's a "no data" error
        if (error.status === 404 && error.error?.error === 'NO_DATA_FOUND') {
          this.dialogMessage = 'Keine Daten in diesem Projekt vorhanden.';
        } else {
          this.dialogMessage = 'Excel-Export fehlgeschlagen!';
        }
        
        this.csvDialogIsError = true;
        this.csvDialogVisible = true;
      }
    });
  }

  // Generate CSV content from project data
  private generateProjectCsv(project: Project): string {
    // Create CSV header row
    let csv = 'ID,Filiale,Status,Geplant,Merchandiser,Adresse,Notiz,Report bis,Nach Vorgabe,Feedback\n';

    // Add data rows
    if (project.reports && project.reports.length > 0) {
      project.reports.forEach((report) => {
        csv += `${report.id || ''},`;
        csv += `${this.escapeCsvValue(report.branch?.name || '')},`;
        csv += `${report.status?.name || ''},`;
        csv += `${report.plannedOn || ''},`;
        csv += `${this.escapeCsvValue(this.getReportMerchandiserName(report))},`;
        csv += `${this.escapeCsvValue(this.getReportAddress(report))},`;
        csv += `${this.escapeCsvValue(report.note || '')},`;
        csv += `${report.reportTo || ''},`;
        csv += `${report.isSpecCompliant ? 'Ja' : 'Nein'},`;
        csv += `${report.feedback ? 'Ja' : 'Nein'}\n`;
      });
    }

    return csv;
  }

  // Helper method to escape CSV values that might contain commas
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      // Escape quotes by doubling them and wrap in quotes
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
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
        return [
          ReportStatusEnum.DRAFT,
          ReportStatusEnum.IN_PROGRESS,
          ReportStatusEnum.DUE,
          ReportStatusEnum.FINISHED,
          ReportStatusEnum.OPENED_BY_CLIENT
        ].includes(report.status.id);
      
      default:
        // For any other status, do exact match by name
        return report.status.name?.toLowerCase() === statusFilter.toLowerCase();
    }
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
   * Close all filter popovers
   */
  closeAllFilterPopovers(): void {
    if (this.genericFilterPopover) {
      this.genericFilterPopover.hide();
    }
    if (this.projectColumnFilterPopover) {
      this.projectColumnFilterPopover.hide();
    }
    if (this.statusFilterPopover) {
      this.statusFilterPopover.hide();
    }
    if (this.merchandiserFilterPopover) {
      this.merchandiserFilterPopover.hide();
    }
    if (this.filialenFilterPopover) {
      this.filialenFilterPopover.hide();
    }
    if (this.plannedOnFilterPopover) {
      this.plannedOnFilterPopover.hide();
    }
  }

  closeAllPopovers(): void {
    this.closeAllFilterPopovers();
    if (this.op) {
      this.op.hide();
    }
    if (this.reportColumnsPopover) {
      this.reportColumnsPopover.hide();
    }
  }

  toggleProjectSettingsPopover(event: Event): void {
    // Close all other popovers first
    this.closeAllPopovers();
    
    // Use setTimeout to ensure close completes, then toggle the settings popover
    setTimeout(() => {
      if (this.op) {
        this.op.toggle(event);
      }
    }, 50);
  }

  toggleReportSettingsPopover(event: Event): void {
    // Close all other popovers first
    this.closeAllPopovers();
    
    // Use setTimeout to ensure close completes, then toggle the settings popover
    setTimeout(() => {
      if (this.reportColumnsPopover) {
        this.reportColumnsPopover.toggle(event);
      }
    }, 50);
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
                                    target.closest('.p-dropdown') !== null;
    
    // If click is not inside popover, not on filter icon, and not on PrimeNG component, close all popovers
    if (!isClickInsidePopover && !isClickOnFilterIcon && !isClickOnPrimeComponent) {
      this.closeAllFilterPopovers();
    }
  }

  /**
   * Open generic filter popover for a field
   */
  openGenericFilter(field: string, event: Event): void {
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    // Close all other popovers first (including settings)
    this.closeAllPopovers();
    
    this.currentFilterField = field;
    // Initialize filter values if not exists
    if (!this.genericFilterValues[field]) {
      this.genericFilterValues[field] = [];
    }
    
    event.stopPropagation();
    
    // Use setTimeout to ensure close completes, then show the new popover at the correct position
    setTimeout(() => {
      if (this.genericFilterPopover && targetElement) {
        // Ensure popover is hidden first
        this.genericFilterPopover.hide();
        
        // Then show it at the correct position
        setTimeout(() => {
          if (this.genericFilterPopover && targetElement) {
            // Create a new event-like object with the stored target element for correct positioning
            const positioningEvent = {
              currentTarget: targetElement,
              target: targetElement,
              preventDefault: () => {},
              stopPropagation: () => {}
            } as any;
            this.genericFilterPopover.show(positioningEvent);
          }
        }, 10);
      }
    }, 50);
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
   * Open plannedOn date filter by clicking the date range picker
   */
  openPlannedOnDateFilter(event: Event): void {
    event.stopPropagation();
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

  /**
   * Handle click on "Geplant" column header to open date range picker
   */
  onPlannedOnColumnClick(event: Event): void {
    event.stopPropagation();
    this.openPlannedOnDateFilter(event);
  }

  /**
   * Get unique plannedOn dates for filter
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
   * Format date for filter display (DD.MM.YYYY)
   */
  private formatDateForFilter(date: string | Date): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  }

  /**
   * Get column width percentage for table columns
   */
  getColumnWidth(field: string, columns: Column[]): number {
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
    if (columnWidths[field]) {
      return columnWidths[field];
    }
    return 8; // Default width
  }

  /**
   * Check if any generic filters are active
   */
  hasGenericFilters(): boolean {
    return Object.keys(this.genericFilterValues).some((field) => {
      const values = this.genericFilterValues[field];
      return values && Array.isArray(values) && values.length > 0;
    });
  }

  /**
   * Open project column filter popover
   */
  openProjectColumnFilter(field: string, event: Event): void {
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    // Close all other popovers first (including settings)
    this.closeAllPopovers();
    
    this.currentProjectFilterField = field;
    // Initialize filter values if not exists
    if (!this.projectColumnFilterValues[field]) {
      this.projectColumnFilterValues[field] = [];
    }
    event.stopPropagation();
    
    // Use setTimeout to ensure close completes, then show the new popover at the correct position
    setTimeout(() => {
      if (this.projectColumnFilterPopover && targetElement) {
        // Ensure popover is hidden first
        this.projectColumnFilterPopover.hide();
        
        // Then show it at the correct position
        setTimeout(() => {
          if (this.projectColumnFilterPopover && targetElement) {
            // Create a new event-like object with the stored target element for correct positioning
            const positioningEvent = {
              currentTarget: targetElement,
              target: targetElement,
              preventDefault: () => {},
              stopPropagation: () => {}
            } as any;
            this.projectColumnFilterPopover.show(positioningEvent);
          }
        }, 10);
      }
    }, 50);
  }

  /**
   * Open status filter popover
   */
  openStatusFilter(event: Event): void {
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    this.closeAllPopovers();
    
    event.stopPropagation();
    
    // Use setTimeout to ensure close completes, then show the new popover at the correct position
    setTimeout(() => {
      if (this.statusFilterPopover && targetElement) {
        // Ensure popover is hidden first
        this.statusFilterPopover.hide();
        
        // Then show it at the correct position
        setTimeout(() => {
          if (this.statusFilterPopover && targetElement) {
            // Create a new event-like object with the stored target element for correct positioning
            const positioningEvent = {
              currentTarget: targetElement,
              target: targetElement,
              preventDefault: () => {},
              stopPropagation: () => {}
            } as any;
            this.statusFilterPopover.show(positioningEvent);
          }
        }, 10);
      }
    }, 50);
  }

  /**
   * Open merchandiser filter popover
   */
  openMerchandiserFilter(event: Event): void {
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    this.closeAllPopovers();
    
    event.stopPropagation();
    
    // Use setTimeout to ensure close completes, then show the new popover at the correct position
    setTimeout(() => {
      if (this.merchandiserFilterPopover && targetElement) {
        // Ensure popover is hidden first
        this.merchandiserFilterPopover.hide();
        
        // Then show it at the correct position
        setTimeout(() => {
          if (this.merchandiserFilterPopover && targetElement) {
            // Create a new event-like object with the stored target element for correct positioning
            const positioningEvent = {
              currentTarget: targetElement,
              target: targetElement,
              preventDefault: () => {},
              stopPropagation: () => {}
            } as any;
            this.merchandiserFilterPopover.show(positioningEvent);
          }
        }, 10);
      }
    }, 50);
  }

  /**
   * Open filialen filter popover
   */
  openFilialenFilter(event: Event): void {
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    this.closeAllPopovers();
    
    event.stopPropagation();
    
    // Use setTimeout to ensure close completes, then show the new popover at the correct position
    setTimeout(() => {
      if (this.filialenFilterPopover && targetElement) {
        // Ensure popover is hidden first
        this.filialenFilterPopover.hide();
        
        // Then show it at the correct position
        setTimeout(() => {
          if (this.filialenFilterPopover && targetElement) {
            // Create a new event-like object with the stored target element for correct positioning
            const positioningEvent = {
              currentTarget: targetElement,
              target: targetElement,
              preventDefault: () => {},
              stopPropagation: () => {}
            } as any;
            this.filialenFilterPopover.show(positioningEvent);
          }
        }, 10);
      }
    }, 50);
  }

  /**
   * Open plannedOn filter popover
   */
  openPlannedOnFilter(event: Event): void {
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    this.closeAllPopovers();
    
    event.stopPropagation();
    
    // Use setTimeout to ensure close completes, then show the new popover at the correct position
    setTimeout(() => {
      if (this.plannedOnFilterPopover && targetElement) {
        // Ensure popover is hidden first
        this.plannedOnFilterPopover.hide();
        
        // Then show it at the correct position
        setTimeout(() => {
          if (this.plannedOnFilterPopover && targetElement) {
            // Create a new event-like object with the stored target element for correct positioning
            const positioningEvent = {
              currentTarget: targetElement,
              target: targetElement,
              preventDefault: () => {},
              stopPropagation: () => {}
            } as any;
            this.plannedOnFilterPopover.show(positioningEvent);
          }
        }, 10);
      }
    }, 50);
  }

  /**
   * Get filter value for a project column
   */
  getProjectColumnFilterValue(field: string): string[] {
    return this.projectColumnFilterValues[field] || [];
  }

  /**
   * Get unique values for a project column
   */
  getUniqueValuesForProjectColumn(field: string): string[] {
    if (!Array.isArray(this.projects) || this.projects.length === 0) {
      return [];
    }

    const uniqueValues = new Set<string>();
    this.projects.forEach((project) => {
      let value: string = '';
      
      if (field === 'formattedZeitraum') {
        value = project.zeitraum || '';
      } else if (field === 'filialen') {
        const count = project.branchesCount ?? 0;
        value = `${count} Stores`;
      } else if (field === 'status') {
        const percentage = project.reportedPercentage ?? 0;
        value = `${percentage}% reported`;
      } else {
        value = project[field as keyof Project]?.toString() || '';
      }
      
      if (value) {
        uniqueValues.add(value);
      }
    });

    return Array.from(uniqueValues).sort();
  }

  /**
   * Get column header for a project column
   */
  getProjectColumnHeader(field: string): string {
    if (field === 'name') {
      return 'Projekt';
    }
    const col = this.cols.find((c) => c.field === field);
    return col ? col.header : field;
  }

  /**
   * Handle project column filter change
   */
  onProjectColumnFilterChange(): void {
    this.applyFilters();
  }

  /**
   * Check if any project column filters are active
   */
  hasProjectColumnFilters(): boolean {
    return Object.keys(this.projectColumnFilterValues).some((field) => {
      const values = this.projectColumnFilterValues[field];
      return values && Array.isArray(values) && values.length > 0;
    });
  }
 
  getProjectQueryParams(): Record<string, any> {
    const params: Record<string, any> = {};
    if (this.statusFilter) {
      params['status'] = this.statusFilter;
    }
    return params;
  }

  /**
   * Get the formatted status filter for display in the heading
   * @returns Formatted status string (e.g., "New", "Ongoing", "Completed")
   */
  getStatusFilterDisplay(): string {
    if (!this.statusFilter) {
      return '';
    }
    // Capitalize first letter and keep the rest lowercase
    return this.statusFilter.charAt(0).toUpperCase() + this.statusFilter.slice(1).toLowerCase();
  }
}
