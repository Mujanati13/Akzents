import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { CreateAkzenteDto } from './dto/create-akzente.dto';
import { UpdateAkzenteDto } from './dto/update-akzente.dto';
import { AkzenteRepository } from './infrastructure/persistence/akzente.repository';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { Akzente } from './domain/akzente';
import { UsersService } from '../users/users.service';
import { User } from '../users/domain/user';
import { AkzenteFavoriteClientCompaniesService } from '../akzente-favorite-client-companies/akzente-favorite-client-companies.service';
import { AkzenteFavoriteReportsService } from '../akzente-favorite-reports/akzente-favorite-reports.service';
import { AkzenteFavoriteProjectService } from '../akzente-favorite-projects/akzente-favorite-project.service';
import { ReportService } from '../report/report.service';
import { ReportStatusEnum } from '../report-status/dto/status.enum';
import { StatusService } from '../report-status/status.service';
import { ProjectService } from '../project/project.service';
import { ClientCompanyAssignedAkzenteService } from 'src/client-company-assigned-akzente/client-company-assigned-akzente.service';

@Injectable()
export class AkzenteService {
  constructor(
    private readonly akzenteRepository: AkzenteRepository,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => AkzenteFavoriteClientCompaniesService))
    private readonly akzenteFavoriteClientCompaniesService: AkzenteFavoriteClientCompaniesService,
    @Inject(forwardRef(() => AkzenteFavoriteReportsService))
    private readonly akzenteFavoriteReportsService: AkzenteFavoriteReportsService,
    @Inject(forwardRef(() => AkzenteFavoriteProjectService))
    private readonly akzenteFavoriteProjectService: AkzenteFavoriteProjectService,
    @Inject(forwardRef(() => ReportService))
    private readonly reportService: ReportService,
    @Inject(forwardRef(() => StatusService))
    private readonly statusService: StatusService,
    @Inject(forwardRef(() => ProjectService))
    private readonly projectService: ProjectService,
    @Inject(forwardRef(() => ClientCompanyAssignedAkzenteService))
    private readonly assignedAkzenteService: ClientCompanyAssignedAkzenteService,
  ) { }

  async create(createAkzenteDto: CreateAkzenteDto): Promise<Akzente> {
    const user = await this.usersService.findById(createAkzenteDto.user.id);
    if (!user) {
      throw new Error('User not found');
    }

    return this.akzenteRepository.create({
      user,
      isSales: createAkzenteDto.isSales ?? false, // Use provided value or default to false
    });
  }

  findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }) {
    return this.akzenteRepository.findAllWithPagination({
      paginationOptions: {
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      },
    });
  }

  findById(id: Akzente['id']) {
    return this.akzenteRepository.findById(id);
  }

  findByUserId(userId: User['id']) {
    return this.akzenteRepository.findByUserId(userId);
  }

  findByIds(ids: Akzente['id'][]) {
    return this.akzenteRepository.findByIds(ids);
  }

  async update(id: Akzente['id'], updateAkzenteDto: UpdateAkzenteDto) {
    let user: User | undefined = undefined;

    if (updateAkzenteDto.user) {
      const foundUser = await this.usersService.findById(
        updateAkzenteDto.user.id,
      );
      if (!foundUser) {
        throw new Error('User not found');
      }
      user = foundUser;
    }

    return this.akzenteRepository.update(id, {
      user,
      isSales: updateAkzenteDto.isSales, // Allow updating isSales field
    });
  }

  remove(id: Akzente['id']) {
    return this.akzenteRepository.remove(id);
  }

  /**
   * Helper method to get report counts for client companies
   */
  private async getReportCountsForClientCompanies(clientCompanyIds: number[]): Promise<Map<number, { newReports: number; ongoingReports: number; completedReports: number }>> {
    if (!clientCompanyIds || clientCompanyIds.length === 0) {
      return new Map();
    }

    try {
      // Get all projects for all client companies
      const allProjects = await Promise.all(
        clientCompanyIds.map(clientCompanyId =>
          this.projectService.findByClientCompanyId(clientCompanyId)
        )
      );

      // Flatten all projects and create a map of client company -> project IDs
      const clientCompanyToProjectIds = new Map<number, number[]>();
      allProjects.forEach((projects, index) => {
        const clientCompanyId = clientCompanyIds[index];
        const projectIds = projects.map(project => project.id);
        clientCompanyToProjectIds.set(clientCompanyId, projectIds);
      });

      // Get all project IDs
      const allProjectIds = allProjects.flat().map(project => project.id);

      if (allProjectIds.length === 0) {
        // No projects found, return empty counts
        const emptyCountsMap = new Map<number, { newReports: number; ongoingReports: number; completedReports: number }>();
        clientCompanyIds.forEach(clientCompanyId => {
          emptyCountsMap.set(clientCompanyId, { newReports: 0, ongoingReports: 0, completedReports: 0 });
        });
        return emptyCountsMap;
      }

      // Single query to get ALL reports for ALL projects
      const allReports = await this.reportService.findByProjectIds(allProjectIds);

      // Initialize counts map
      const reportCountsMap = new Map<number, { newReports: number; ongoingReports: number; completedReports: number }>();
      clientCompanyIds.forEach(clientCompanyId => {
        reportCountsMap.set(clientCompanyId, { newReports: 0, ongoingReports: 0, completedReports: 0 });
      });

      // Count reports by client company and status category
      allReports.forEach(report => {
        const projectId = report.project.id;
        const statusId = report.status.id;

        // Find which client company this project belongs to
        for (const [clientCompanyId, projectIds] of clientCompanyToProjectIds) {
          if (projectIds.includes(projectId)) {
            const counts = reportCountsMap.get(clientCompanyId);
            if (counts) {
              // Categorize by status
              if (statusId === ReportStatusEnum.NEW || statusId === ReportStatusEnum.ASSIGNED) {
                counts.newReports++;
              } else if (statusId === ReportStatusEnum.VALID) {
                counts.completedReports++;
              } else {
                // All other statuses: DRAFT, IN_PROGRESS, DUE, FINISHED, ACCEPTED_BY_CLIENT
                counts.ongoingReports++;
              }
            }
            break; // Found the client company, no need to continue
          }
        }
      });

      return reportCountsMap;
    } catch (error) {
      console.error('Error getting report counts for client companies:', error);
      // Return empty counts if there's an error
      const emptyCountsMap = new Map<number, { newReports: number; ongoingReports: number; completedReports: number }>();
      clientCompanyIds.forEach(clientCompanyId => {
        emptyCountsMap.set(clientCompanyId, { newReports: 0, ongoingReports: 0, completedReports: 0 });
      });
      return emptyCountsMap;
    }
  }

  async getUserFavorites(userId: number) {

    // Validate userId
    if (!userId || isNaN(userId) || userId <= 0) {
      console.error('❌ Invalid user ID in service:', {
        userId,
        userIdType: typeof userId,
        isNaN: isNaN(userId),
      });
      throw new Error('Invalid user ID provided');
    }

    // Find the akzente record for this user
    const akzente = await this.findByUserId(userId);
    if (!akzente) {
      throw new Error('Akzente profile not found for user');
    }

    // Get favorite client companies
    const favoriteClientCompanies = await this.akzenteFavoriteClientCompaniesService.findByAkzenteId(akzente.id);
    const clientCompanies = favoriteClientCompanies.map(fav => fav.clientCompany);

    // Get report counts for favorite client companies
    const clientCompanyIds = clientCompanies.map(company => company.id);
    const reportCountsMap = await this.getReportCountsForClientCompanies(clientCompanyIds);

    // Add report counts to favorite client companies
    const clientCompaniesWithCounts = clientCompanies.map(company => {
      const reportCounts = reportCountsMap.get(company.id) || { newReports: 0, ongoingReports: 0, completedReports: 0 };
      return {
        ...company,
        reportCounts: {
          newReports: reportCounts.newReports,
          ongoingReports: reportCounts.ongoingReports,
          completedReports: reportCounts.completedReports,
        }
      };
    });

    // Get favorite reports (missions)
    const favoriteReports = await this.akzenteFavoriteReportsService.findByAkzenteId(akzente.id);
    const reports = favoriteReports.map(fav => fav.report);

    // Get favorite projects
    const favoriteProjects = await this.akzenteFavoriteProjectService.findByAkzenteId(akzente.id);
    const projects = favoriteProjects.map(fav => fav.project);

    return {
      favoriteClientCompanies: clientCompaniesWithCounts,
      favoriteReports: reports,
      favoriteProjects: projects,
    };
  }


  /**
   * Helper method to add favorite status to client companies
   */
  private async addFavoriteStatusToClientCompanies(clientCompanies: any[], userId?: number): Promise<any[]> {
    if (!userId) {
      // If no user ID, all client companies are not favorited
      return clientCompanies.map(company => ({ ...company, isFavorite: false }));
    }

    try {
      // Find the Akzente entity for this user
      const akzenteEntity = await this.findByUserId(userId);
      if (!akzenteEntity) {
        // If no Akzente entity found, all client companies are not favorited
        return clientCompanies.map(company => ({ ...company, isFavorite: false }));
      }

      // Get all favorite client companies for this Akzente user
      const allFavorites = await this.akzenteFavoriteClientCompaniesService.findAllWithPagination({
        paginationOptions: { page: 1, limit: 1000 }
      });
      const favoriteCompanyIds = allFavorites.data
        .filter(fav => fav.akzente.id === akzenteEntity.id)
        .map(fav => fav.clientCompany.id);

      // Add isFavorite field to each client company
      return clientCompanies.map(company => ({
        ...company,
        isFavorite: favoriteCompanyIds.includes(company.id)
      }));
    } catch (error) {
      // If there's an error, assume all client companies are not favorited
      console.error('Error adding favorite status to client companies:', error);
      return clientCompanies.map(company => ({ ...company, isFavorite: false }));
    }
  }

  /**
   * Helper method to get assigned client companies with favorite status
   */
  private async getAssignedClientCompaniesWithFavoriteStatus(userId?: number): Promise<any[]> {
    if (!userId) {
      // If no user ID, return empty array
      return [];
    }

    try {
      // Find the Akzente entity for this user
      const akzenteEntity = await this.findByUserId(userId);
      if (!akzenteEntity) {
        // If no Akzente entity found, return empty array
        return [];
      }

      // Get all client company assignments for this Akzente user
      const allAssignments = await this.assignedAkzenteService.findAllWithPagination({
        paginationOptions: { page: 1, limit: 1000 }
      });
      
      // Filter assignments to only those belonging to this Akzente user
      const userAssignments = allAssignments.data
        .filter(assignment => assignment.akzente.id === akzenteEntity.id);

      // Extract client companies from assignments
      const assignedClientCompanies = userAssignments.map(assignment => assignment.clientCompany);

      // Get report counts for assigned client companies
      const clientCompanyIds = assignedClientCompanies.map(company => company.id);
      const reportCountsMap = await this.getReportCountsForClientCompanies(clientCompanyIds);

      // Get all favorite client companies for this Akzente user
      const allFavorites = await this.akzenteFavoriteClientCompaniesService.findAllWithPagination({
        paginationOptions: { page: 1, limit: 1000 }
      });
      const favoriteCompanyIds = allFavorites.data
        .filter(fav => fav.akzente.id === akzenteEntity.id)
        .map(fav => fav.clientCompany.id);

      // Add isFavorite field and report counts to each assigned client company
      return assignedClientCompanies.map(company => {
        const reportCounts = reportCountsMap.get(company.id) || { newReports: 0, ongoingReports: 0, completedReports: 0 };
        return {
          ...company,
          isFavorite: favoriteCompanyIds.includes(company.id),
          reportCounts: {
            newReports: reportCounts.newReports,
            ongoingReports: reportCounts.ongoingReports,
            completedReports: reportCounts.completedReports,
          }
        };
      });
    } catch (error) {
      // If there's an error, return empty array
      console.error('Error getting assigned client companies with favorite status:', error);
      return [];
    }
  }

  /**
   * Helper method to apply status filtering to reports based on user type
   */
  private async applyStatusFilteringToReports(reports: any[], userType: 'akzente' | 'client' | 'merchandiser'): Promise<any[]> {
    if (!reports || reports.length === 0) {
      return reports;
    }

    try {
      return reports.map(report => {
        if (!report.status) return report;
        // Get the user-type-specific name and color
        const userSpecificName = this.statusService.getStatusNameForUserType(report.status, userType);
        const userSpecificColor = this.statusService.getStatusColorForUserType(report.status, userType);

        const filteredStatus = {
          id: report.status.id,
          name: userSpecificName,
          color: userSpecificColor,
        };

        return {
          ...report,
          status: filteredStatus
        };
      });
    } catch (error) {
      // If there's an error, return reports without filtering
      console.error('Error applying status filtering to reports:', error);
      return reports;
    }
  }

  async getDashboardData(userId: number, request?: any) {

    // Validate userId
    if (!userId || isNaN(userId) || userId <= 0) {
      console.error('❌ Invalid user ID in dashboard service:', {
        userId,
        userIdType: typeof userId,
        isNaN: isNaN(userId),
      });
      throw new Error('Invalid user ID provided');
    }

    // Find the akzente record for this user
    const akzente = await this.findByUserId(userId);
    if (!akzente) {
      throw new Error('Akzente profile not found for user');
    }

    // Get favorite projects for this akzente user
    const favoriteProjects = await this.akzenteFavoriteProjectService.findByAkzenteId(akzente.id);
    const favoriteProjectIds = favoriteProjects.map(fav => fav.project.id);

    // Get reports with status NEW from favorite projects
    const newReports = await this.reportService.findByProjectIdsAndStatus(
      favoriteProjectIds,
      ReportStatusEnum.NEW
    );

    // Get reports with status REJECTED from favorite projects
    const rejectedReports = await this.reportService.findByProjectIdsAndStatus(
      favoriteProjectIds,
      ReportStatusEnum.DUE
    );

    // Get favorite client companies
    const favoriteClientCompanies = await this.akzenteFavoriteClientCompaniesService.findByAkzenteId(akzente.id);
    const clientCompanies = favoriteClientCompanies.map(fav => fav.clientCompany);

    // Get report counts for favorite client companies
    const clientCompanyIds = clientCompanies.map(company => company.id);
    const reportCountsMap = await this.getReportCountsForClientCompanies(clientCompanyIds);

    // Add report counts to favorite client companies
    const clientCompaniesWithCounts = clientCompanies.map(company => {
      const reportCounts = reportCountsMap.get(company.id) || { newReports: 0, ongoingReports: 0, completedReports: 0 };
      return {
        ...company,
        reportCounts: {
          newReports: reportCounts.newReports,
          ongoingReports: reportCounts.ongoingReports,
          completedReports: reportCounts.completedReports,
        }
      };
    });

    // Add isFavorite status to reports using ReportService
    const newReportsWithFavorites = await this.reportService.addFavoriteStatusToReports(newReports, userId, request);
    const rejectedReportsWithFavorites = await this.reportService.addFavoriteStatusToReports(rejectedReports, userId, request);

    // Apply status filtering based on user type (akzente)
    const newReportsWithFilteredStatus = await this.applyStatusFilteringToReports(newReportsWithFavorites, 'akzente');
    const rejectedReportsWithFilteredStatus = await this.applyStatusFilteringToReports(rejectedReportsWithFavorites, 'akzente');
    // Get assigned client companies with favorite status
    const clientCompaniesAssignedAkzente = await this.getAssignedClientCompaniesWithFavoriteStatus(userId);

    return {
      newReports: newReportsWithFilteredStatus,
      rejectedReports: rejectedReportsWithFilteredStatus,
      clientCompaniesAssignedAkzente: clientCompaniesAssignedAkzente,
    };
  }
}
