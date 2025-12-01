import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportRepository } from './infrastructure/persistence/report.repository';
import { ReportStatusEnum } from '../report-status/dto/status.enum';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { Report } from './domain/report';
import { ProjectService } from '../project/project.service';
import { ClientCompanyService } from '../client-company/client-company.service';
import { MerchandiserService } from '../merchandiser/merchandiser.service';
import { BranchService } from '../branch/branch.service';
import { Project } from '../project/domain/project';
import { ClientCompany } from '../client-company/domain/client-company';
import { Merchandiser } from '../merchandiser/domain/merchandiser';
import { Branch } from '../branch/domain/branch';
import { StatusService } from '../report-status/status.service';
import { UpdateReportDto } from './dto/update-cities.dto';
import { ReportStatus } from '../report-status/domain/status';
import { AkzenteFavoriteReportsService } from '../akzente-favorite-reports/akzente-favorite-reports.service';
import { AkzenteService } from '../akzente/akzente.service';
import { ClientService } from '../client/client.service';
import { ClientFavoriteReportsService } from '../client-favorite-reports/client-favorite-reports.service';
import { MerchandiserFavoriteReportsService } from '../merchandiser-favorite-reports/merchandiser-favorite-reports.service';
import { ProjectAssignedAkzenteService } from '../project-assigned-akzente/project-assigned-akzente.service';
import { MailerService } from '../mailer/mailer.service';
import * as XLSX from 'xlsx-js-style';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import appConfig from '../config/app.config';
import fileConfig from '../files/config/file.config';
import { FileDriver } from '../files/config/file-config.type';

@Injectable()
export class ReportService {
  constructor(
    @Inject(forwardRef(() => ReportRepository))
    private readonly reportRepository: ReportRepository,
    @Inject(forwardRef(() => ProjectService))
    private readonly projectService: ProjectService,
    @Inject(forwardRef(() => StatusService))
    private readonly statusService: StatusService,
    @Inject(forwardRef(() => ClientCompanyService))
    private readonly clientCompanyService: ClientCompanyService,
    @Inject(forwardRef(() => MerchandiserService))
    private readonly merchandiserService: MerchandiserService,
    @Inject(forwardRef(() => BranchService))
    private readonly branchService: BranchService,
    @Inject(forwardRef(() => AkzenteFavoriteReportsService))
    private readonly akzenteFavoriteReportsService: AkzenteFavoriteReportsService,
    @Inject(forwardRef(() => AkzenteService))
    private readonly akzenteService: AkzenteService,
    @Inject(forwardRef(() => ClientService))
    private readonly clientService: ClientService,
    @Inject(forwardRef(() => ClientFavoriteReportsService))
    private readonly clientFavoriteReportsService: ClientFavoriteReportsService,
    @Inject(forwardRef(() => MerchandiserFavoriteReportsService))
    private readonly merchandiserFavoriteReportsService: MerchandiserFavoriteReportsService,
    @Inject(forwardRef(() => ProjectAssignedAkzenteService))
    private readonly projectAssignedAkzenteService: ProjectAssignedAkzenteService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async create(createReportDto: CreateReportDto): Promise<Report> {
    const project = await this.projectService.findById(
      createReportDto.project.id,
    );
    if (!project) {
      throw new Error('Project not found');
    }

    const status = await this.statusService.findById(createReportDto.status.id);
    if (!status) {
      throw new Error('Status not found');
    }

    const clientCompany = await this.clientCompanyService.findById(
      createReportDto.clientCompany.id,
    );
    if (!clientCompany) {
      throw new Error('Client company not found');
    }

    const branch = await this.branchService.findById(createReportDto.branch.id);
    if (!branch) {
      throw new Error('Branch not found');
    }

    let merchandiser: Merchandiser | null = null;
    if (createReportDto.merchandiser) {
      const foundMerchandiser = await this.merchandiserService.findById(
        createReportDto.merchandiser.id,
      );
      if (!foundMerchandiser) {
        throw new Error('Merchandiser not found');
      }
      merchandiser = foundMerchandiser;
    }

    const report = await this.reportRepository.create({
      project,
      status,
      clientCompany,
      merchandiser,
      branch,
      street: createReportDto.street,
      zipCode: createReportDto.zipCode,
      plannedOn: createReportDto.plannedOn
        ? new Date(createReportDto.plannedOn)
        : null,
      note: createReportDto.note,
      reportTo: createReportDto.reportTo
        ? new Date(createReportDto.reportTo)
        : null,
      feedback: createReportDto.feedback,
      isSpecCompliant: createReportDto.isSpecCompliant,
    });

    const reportWithFavorite = await this.addFavoriteStatusToReport(report);
    if (!reportWithFavorite) {
      throw new Error('Failed to create report');
    }
    return reportWithFavorite;
  }

  findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }) {
    return this.reportRepository.findAllWithPagination({
      paginationOptions: {
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      },
    });
  }

  async findById(id: Report['id'], userId?: number, request?: any) {
    if (!userId) {
      const report = await this.reportRepository.findById(id);
      if (!report) return null;
      return this.addFavoriteStatusToReport(report, userId, request);
    }

    // Get userType from JWT (fastest - no DB calls)
    const userType = request?.user?.userType;
    
    if (!userType) {
      // Fallback to database calls if JWT doesn't have userType
      return this.findByIdFallback(id, userId);
    }

    const report = await this.reportRepository.findByIdWithFilteredConversation(
      id,
      { role: userType, userId },
    );
    if (!report) return null;

    const reportWithFavorite = await this.addFavoriteStatusToReport(
      report,
      userId,
      request,
    );
    if (!reportWithFavorite) return null;

    return this.filterStatusForUserType(reportWithFavorite, userType);
  }

  /**
   * Optimized version of findById specifically for updates - only loads essential data
   * This method is separate from the main findById to avoid breaking existing functionality
   */
  async findByIdForUpdate(id: Report['id']): Promise<Report | null> {
    const report = await this.reportRepository.findByIdForUpdate(id);
    return report;
  }

  /**
   * Fallback method for when JWT doesn't have userType
   */
  private async findByIdFallback(id: Report['id'], userId: number) {
    const akzenteEntity = await this.akzenteService.findByUserId(userId);
    const clientEntity = await this.clientService.findByUserId(userId);
    let merchandiserEntity: any = null;
    try {
      merchandiserEntity =
        await this.merchandiserService.findByUserIdNumber(userId);
    } catch {}

    let viewerRole: 'akzente' | 'client' | 'merchandiser' = 'akzente';
    if (clientEntity) viewerRole = 'client';
    else if (merchandiserEntity && !akzenteEntity) viewerRole = 'merchandiser';

    const report = await this.reportRepository.findByIdWithFilteredConversation(
      id,
      { role: viewerRole, userId },
    );
    if (!report) return null;

    const reportWithFavorite = await this.addFavoriteStatusToReport(
      report,
      userId,
    );
    if (!reportWithFavorite) return null;

    return this.filterStatusForUserType(reportWithFavorite, viewerRole);
  }

  async findByIds(ids: Report['id'][], userId?: number, request?: any) {
    const reports = await this.reportRepository.findByIds(ids);
    return this.addFavoriteStatusToReports(reports, userId, request);
  }

  async update(
    id: Report['id'],
    updateReportDto: UpdateReportDto,
    userId?: number,
  ) {
    
    // Only fetch entities that are actually being updated
    const fetchPromises: Promise<any>[] = [];
    const entityKeys: string[] = [];

    if (updateReportDto.project) {
      fetchPromises.push(this.projectService.findById(updateReportDto.project.id));
      entityKeys.push('project');
    }

    if (updateReportDto.status) {
      fetchPromises.push(this.statusService.findById(updateReportDto.status.id));
      entityKeys.push('status');
    }

    if (updateReportDto.clientCompany) {
      fetchPromises.push(this.clientCompanyService.findById(updateReportDto.clientCompany.id));
      entityKeys.push('clientCompany');
    }

    if (updateReportDto.merchandiser) {
      fetchPromises.push(this.merchandiserService.findById(updateReportDto.merchandiser.id));
      entityKeys.push('merchandiser');
    }

    if (updateReportDto.branch) {
      fetchPromises.push(this.branchService.findById(updateReportDto.branch.id));
      entityKeys.push('branch');
    }

    // Fetch all entities in parallel
    const fetchedEntities = await Promise.all(fetchPromises);

    // Map results back to variables
    let projectUpdate: Project | undefined = undefined;
    let statusUpdate: ReportStatus | undefined = undefined;
    let clientCompanyUpdate: ClientCompany | undefined = undefined;
    let merchandiserUpdate: Merchandiser | undefined = undefined;
    let branchUpdate: Branch | undefined = undefined;

    entityKeys.forEach((key, index) => {
      const entity = fetchedEntities[index];
      if (!entity) {
        throw new Error(`${key} not found`);
      }
      
      switch (key) {
        case 'project':
          projectUpdate = entity;
          break;
        case 'status':
          statusUpdate = entity;
          break;
        case 'clientCompany':
          clientCompanyUpdate = entity;
          break;
        case 'merchandiser':
          merchandiserUpdate = entity;
          break;
        case 'branch':
          branchUpdate = entity;
          break;
      }
    });

    // Build payload conditionally to avoid unintentionally nulling relations
    const updatePayload: any = {
      street: updateReportDto.street,
      zipCode: updateReportDto.zipCode,
      plannedOn: updateReportDto.plannedOn
        ? new Date(updateReportDto.plannedOn)
        : undefined,
      note: updateReportDto.note,
      reportTo: updateReportDto.reportTo
        ? new Date(updateReportDto.reportTo)
        : undefined,
      visitDate: updateReportDto.visitDate
        ? new Date(updateReportDto.visitDate)
        : undefined,
      feedback: updateReportDto.feedback,
      isSpecCompliant: updateReportDto.isSpecCompliant,
    };

    if (projectUpdate !== undefined) {
      updatePayload.project = projectUpdate;
    }
    if (statusUpdate !== undefined) {
      updatePayload.status = statusUpdate;
    }
    if (clientCompanyUpdate !== undefined) {
      updatePayload.clientCompany = clientCompanyUpdate;
    }
    if (merchandiserUpdate !== undefined) {
      updatePayload.merchandiser = merchandiserUpdate;
    }
    if (branchUpdate !== undefined) {
      updatePayload.branch = branchUpdate;
    }

    const report = await this.reportRepository.update(id, updatePayload);
    const reportWithFavorite = await this.addFavoriteStatusToReport(
      report,
      userId,
    );
    
    if (!reportWithFavorite) return null;

    if (userId) {
      const { userType } = await this.determineUserTypeAndEntities(userId);
      const result = this.filterStatusForUserType(reportWithFavorite, userType);
      return result;
    }

    return reportWithFavorite;
  }

  remove(id: Report['id']) {
    return this.reportRepository.remove(id);
  }

  async findByProjectId(
    projectId: number,
    userId?: number,
    request?: any,
  ): Promise<Report[]> {
    const reports = await this.reportRepository.findByProjectId(projectId);
    return this.addFavoriteStatusToReports(reports, userId, request);
  }

  /**
   * Get reports for a project based on user type
   * - Akzente users: Get all reports for the project
   * - Merchandiser users: Get only reports where the merchandiser is assigned
   * Uses JWT userType to avoid database calls for user type determination
   */
  async findByProjectIdForUserType(
    projectId: number,
    userId?: number,
    request?: any,
  ): Promise<Report[]> {
    if (!userId) {
      console.log('No userId');
      // If no user ID, return all reports (fallback behavior)
      return this.findByProjectId(projectId, userId, request);
    }

    try {
      // Get userType from JWT (fastest - no DB calls)
      const userType = request?.user?.userType;
      
      if (!userType) {
        console.log('No userType');
        // Fallback to database calls if JWT doesn't have userType
        return this.findByProjectIdForUserTypeFallback(projectId, userId, request);
      }

      if (userType === 'merchandiser') {
        console.log('Merchandiser');
        // For merchandisers, get only reports where they are assigned
        const merchandiserEntity = await this.merchandiserService.findByUserIdNumber(userId).catch(() => null);
        if (merchandiserEntity) {
          return this.findByProjectIdForMerchandiser(
            projectId,
            merchandiserEntity.id,
            userId,
            request,
          );
        }
      }
      
      // For Akzente users (or other types), return all reports
      return this.findByProjectId(projectId, userId, request);
    } catch (error) {
      console.error(
        '❌ Error getting project reports:',
        error,
      );
      // Fallback to all reports on error
      return this.findByProjectId(projectId, userId, request);
    }
  }

  /**
   * Fallback method for when JWT doesn't have userType
   */
  private async findByProjectIdForUserTypeFallback(
    projectId: number,
    userId: number,
    request?: any,
  ): Promise<Report[]> {
    // CRITICAL: Validate userId before making database calls
    if (!userId || typeof userId !== 'number' || isNaN(userId) || userId <= 0) {
      console.warn('❌ Invalid userId in findByProjectIdForUserTypeFallback, returning all reports');
      return this.findByProjectId(projectId, userId, request);
    }

    try {
      // Determine user type
      const { userType, merchandiserEntity } =
        await this.determineUserTypeAndEntities(userId);

      if (userType === 'merchandiser' && merchandiserEntity) {
        // For merchandisers, get only reports where they are assigned
        return this.findByProjectIdForMerchandiser(
          projectId,
          merchandiserEntity.id,
          userId,
          request,
        );
      } else {
        // For Akzente users (or other types), return all reports
        return this.findByProjectId(projectId, userId, request);
      }
    } catch (error) {
      console.error(
        '❌ Error determining user type for project reports (fallback):',
        error,
      );
      // Fallback to all reports on error
      return this.findByProjectId(projectId, userId, request);
    }
  }

  /**
   * Get reports for a project where the merchandiser is assigned
   */
  private async findByProjectIdForMerchandiser(
    projectId: number,
    merchandiserId: number,
    userId: number,
    request?: any,
  ): Promise<Report[]> {
    // Get all reports for the project
    const allReports = await this.reportRepository.findByProjectId(projectId);

    // Filter reports to only include those where the merchandiser is assigned
    const filteredReports = allReports.filter(
      (report) => report.merchandiser?.id === merchandiserId,
    );

    // Add favorite status to filtered reports
    return this.addFavoriteStatusToReports(filteredReports, userId, request);
  }

  async findByBranchId(
    branchId: number,
    userId?: number,
    request?: any,
  ): Promise<Report[]> {
    const reports = await this.reportRepository.findByBranchId(branchId);
    return this.addFavoriteStatusToReports(reports, userId, request);
  }

  async findByProjectIdsAndStatus(
    projectIds: number[],
    status: number,
  ): Promise<Report[]> {
    if (!projectIds || projectIds.length === 0) {
      return [];
    }

    const reports = await this.reportRepository.findByProjectIdsAndStatus(
      projectIds,
      status,
    );

    return reports;
  }

  async findByProjectIds(projectIds: number[]): Promise<Report[]> {
    if (!projectIds || projectIds.length === 0) {
      return [];
    }

    const reports = await this.reportRepository.findByProjectIds(projectIds);

    return reports;
  }

  /**
   * Optimized method to get report counts by status categories for multiple projects
   * This method makes only ONE database query instead of 8 separate queries
   */
  async getReportCountsByStatusCategories(
    projectIds: number[],
  ): Promise<
    Map<
      number,
      { newReports: number; ongoingReports: number; completedReports: number }
    >
  > {
    if (!projectIds || projectIds.length === 0) {
      return new Map();
    }

    try {
      // Single database query to get ALL reports for all projects
      const allReports = await this.findByProjectIds(projectIds);

      // Initialize counts map
      const reportCountsMap = new Map<
        number,
        { newReports: number; ongoingReports: number; completedReports: number }
      >();
      projectIds.forEach((projectId) => {
        reportCountsMap.set(projectId, {
          newReports: 0,
          ongoingReports: 0,
          completedReports: 0,
        });
      });

      // Count reports by project and status category in memory (very fast)
      allReports.forEach((report) => {
        const projectId = report.project.id;
        const statusId = report.status.id;
        const counts = reportCountsMap.get(projectId);

        if (!counts) return; // Skip if project not in our list

        // Categorize by status
        if (
          statusId === ReportStatusEnum.NEW ||
          statusId === ReportStatusEnum.ASSIGNED
        ) {
          counts.newReports++;
        } else if (statusId === ReportStatusEnum.VALID) {
          counts.completedReports++;
        } else {
          // All other statuses: DRAFT, IN_PROGRESS, DUE, FINISHED, ACCEPTED_BY_CLIENT
          counts.ongoingReports++;
        }
      });

      return reportCountsMap;
    } catch (error) {
      console.error('Error getting optimized report counts:', error);
      // Return empty counts if there's an error
      const emptyCountsMap = new Map<
        number,
        { newReports: number; ongoingReports: number; completedReports: number }
      >();
      projectIds.forEach((projectId) => {
        emptyCountsMap.set(projectId, {
          newReports: 0,
          ongoingReports: 0,
          completedReports: 0,
        });
      });
      return emptyCountsMap;
    }
  }

  /**
   * Helper method to add favorite status to reports and filter status
   * Uses JWT userType to avoid database calls for user type determination
   */
  async addFavoriteStatusToReports(
    reports: Report[],
    userId?: number,
    request?: any,
  ): Promise<Report[]> {
    // Early return if userId is invalid - CRITICAL: This must be checked first
    if (!userId || isNaN(userId) || userId <= 0) {
      console.log('❌ Invalid user ID, skipping favorite status:', userId);
      // If no valid user ID, all reports are not favorited - return immediately
      return reports.map((report) => ({ ...report, isFavorite: false }));
    }

    try {
      // Get userType from JWT (fastest - no DB calls)
      const userType = request?.user?.userType;
      
      if (!userType) {
        // For merchandiser endpoints, skip favorite status to avoid connection pool issues
        // Check if this is a merchandiser request by looking at the request path or user context
        const isMerchandiserRequest = request?.url?.includes('/merchandiser') || 
                                     request?.route?.path?.includes('merchandiser');
        
        if (isMerchandiserRequest) {
          // Merchandisers don't need favorite status for reports
          return reports.map((report) => ({ ...report, isFavorite: false }));
        }
        
        // CRITICAL: Skip fallback to prevent connection pool exhaustion
        // If userType is not available in JWT, it means we'd need to make database calls
        // to determine it, which can exhaust the connection pool under load.
        // Instead, skip favorite status entirely to avoid connection pool issues.
        console.warn('⚠️ userType not available in JWT, skipping favorite status to prevent connection pool exhaustion');
        return reports.map((report) => ({ ...report, isFavorite: false }));
        
        // REMOVED: Fallback method that causes connection pool exhaustion
        // The fallback was causing too many concurrent database connections
        // If favorite status is critical, ensure userType is always in JWT
      }

      let reportsWithFavorites: Report[];

      if (userType === 'akzente') {
        // Akzente logic - get entity and favorites
        const akzenteEntity = await this.akzenteService
          .findByUserId(userId)
          .catch(() => null);
        
        if (akzenteEntity) {
          // Optimize: Only fetch favorites for the specific reports being loaded
          const reportIds = reports.map((r) => r.id);
          const favorites = await this.akzenteFavoriteReportsService.findByAkzenteIdAndReportIds(
            akzenteEntity.id,
            reportIds,
          );
          const favoriteReportIds = new Set(favorites.map((fav) => fav.report.id));

          reportsWithFavorites = reports.map((report) => ({
            ...report,
            isFavorite: favoriteReportIds.has(report.id),
          }));
        } else {
          reportsWithFavorites = reports.map((report) => ({
            ...report,
            isFavorite: false,
          }));
        }
      } else if (userType === 'client') {
        // Client logic - get entity and favorites
        const clientEntity = await this.clientService
          .findByUserId(userId)
          .catch(() => null);
        
        if (clientEntity) {
          // Optimize: Only fetch favorites for the specific reports being loaded
          const reportIds = reports.map((r) => r.id);
          const favorites = await this.clientFavoriteReportsService.findByClientIdAndReportIds(
            clientEntity.id,
            reportIds,
          );
          const favoriteReportIds = new Set(favorites.map((fav) => fav.report.id));

          reportsWithFavorites = reports.map((report) => ({
            ...report,
            isFavorite: favoriteReportIds.has(report.id),
          }));
        } else {
          reportsWithFavorites = reports.map((report) => ({
            ...report,
            isFavorite: false,
          }));
        }
      } else {
        // Merchandiser or unknown type - all reports are not favorited
        reportsWithFavorites = reports.map((report) => ({
          ...report,
          isFavorite: false,
        }));
      }

      // Apply status filtering to all reports using JWT userType
      return reportsWithFavorites.map((report) =>
        this.filterStatusForUserType(report, userType),
      );
    } catch (error) {
      // If there's an error, assume all reports are not favorited
      console.error('Error adding favorite status to reports:', error);
      return reports.map((report) => ({ ...report, isFavorite: false }));
    }
  }

  /**
   * Fallback method for when JWT doesn't have userType
   */
  private async addFavoriteStatusToReportsFallback(
    reports: Report[],
    userId?: number,
  ): Promise<Report[]> {
    // CRITICAL: Double-check userId validity before making any database calls
    // Check for undefined, null, NaN, non-number types, and invalid numbers
    if (!userId || typeof userId !== 'number' || isNaN(userId) || userId <= 0) {
      console.warn('❌ Invalid user ID in fallback, skipping favorite status. userId:', userId, 'type:', typeof userId);
      // Return immediately without making any database calls
      return reports.map((report) => ({ ...report, isFavorite: false }));
    }

    try {
      // Fallback to DB calls if JWT doesn't have userType
      // But catch connection errors early to prevent pool exhaustion
      // Use a shorter timeout to fail fast and avoid connection pool exhaustion
      // Also add a check to prevent calling determineUserTypeAndEntities if userId is invalid
      const result = await Promise.race([
        this.determineUserTypeAndEntities(userId).catch((error) => {
          // If determineUserTypeAndEntities fails, return default values
          console.error('Error in determineUserTypeAndEntities:', error);
          return {
            userType: 'akzente' as const,
            akzenteEntity: null,
            clientEntity: null,
            merchandiserEntity: null,
          };
        }),
        new Promise<{
          userType: 'akzente' | 'client' | 'merchandiser';
          akzenteEntity: any;
          clientEntity: any;
          merchandiserEntity: any;
        }>((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 2000) // Reduced from 5000 to 2000ms
        ),
      ]) as {
        userType: 'akzente' | 'client' | 'merchandiser';
        akzenteEntity: any;
        clientEntity: any;
        merchandiserEntity: any;
      };

      const userType = result.userType;
      const akzenteEntity = result.akzenteEntity;
      const clientEntity = result.clientEntity;

      let reportsWithFavorites: Report[];

      if (akzenteEntity) {
        // Akzente logic - only fetch favorites for the specific reports being loaded
        const reportIds = reports.map((r) => r.id);
        const favorites = await this.akzenteFavoriteReportsService.findByAkzenteIdAndReportIds(
          akzenteEntity.id,
          reportIds,
        );
        const favoriteReportIds = new Set(favorites.map((fav) => fav.report.id));

        // Add isFavorite field to each report
        reportsWithFavorites = reports.map((report) => ({
          ...report,
          isFavorite: favoriteReportIds.has(report.id),
        }));
      } else if (clientEntity) {
        // Client logic - only fetch favorites for the specific reports being loaded
        const reportIds = reports.map((r) => r.id);
        const favorites = await this.clientFavoriteReportsService.findByClientIdAndReportIds(
          clientEntity.id,
          reportIds,
        );
        const favoriteReportIds = new Set(favorites.map((fav) => fav.report.id));

        // Add isFavorite field to each report
        reportsWithFavorites = reports.map((report) => ({
          ...report,
          isFavorite: favoriteReportIds.has(report.id),
        }));
      } else {
        // If no entity found, all reports are not favorited
        reportsWithFavorites = reports.map((report) => ({
          ...report,
          isFavorite: false,
        }));
      }

      // Apply status filtering to all reports
      return reportsWithFavorites.map((report) =>
        this.filterStatusForUserType(report, userType),
      );
    } catch (error: any) {
      // If there's an error (including connection pool exhaustion), 
      // assume all reports are not favorited and skip status filtering
      const errorMessage = error?.message || '';
      const errorCode = error?.code || '';
      const isConnectionError = errorCode === '53300' || // PostgreSQL connection pool error
                                errorMessage.includes('too many clients') || 
                                errorMessage.includes('connection slots') ||
                                errorMessage.includes('Connection timeout');
      
      if (isConnectionError) {
        console.warn('⚠️ Connection pool exhausted or timeout in favorite status fallback, skipping favorite status');
      } else {
        console.error('Error adding favorite status to reports (fallback):', error);
      }
      
      // Return reports without favorite status and without status filtering to avoid more DB calls
      return reports.map((report) => ({ ...report, isFavorite: false }));
    }
  }

  /**
   * Helper method to add favorite status to a single report - ULTRA OPTIMIZED VERSION
   * Uses JWT userType to avoid database calls for user type determination
   */
  async addFavoriteStatusToReport(
    report: Report | null,
    userId?: number,
    request?: any,
  ): Promise<Report | null> {
    if (!report) return null;

    if (!userId) {
      return { ...report, isFavorite: false };
    }

    try {
      // Get userType from JWT (fastest - no DB calls)
      const userType = request?.user?.userType;
      
      if (!userType) {
        // Fallback to database calls if JWT doesn't have userType
        return this.addFavoriteStatusToReportFallback(report, userId);
      }

      // Use JWT userType to get the appropriate entity
      let entity: any = null;
      
      if (userType === 'akzente') {
        entity = await this.akzenteService.findByUserId(userId).catch(() => null);
        if (entity) {
          const existing = await this.akzenteFavoriteReportsService.findOne({
            akzenteId: entity.id,
            reportId: report.id,
          });
          return { ...report, isFavorite: !!existing };
        }
      } else if (userType === 'client') {
        entity = await this.clientService.findByUserId(userId).catch(() => null);
        if (entity) {
          const existing = await this.clientFavoriteReportsService.findOne({
            clientId: entity.id,
            reportId: report.id,
          });
          return { ...report, isFavorite: !!existing };
        }
      } else if (userType === 'merchandiser') {
        entity = await this.merchandiserService.findByUserIdNumber(userId).catch(() => null);
        if (entity) {
          const existing = await this.merchandiserFavoriteReportsService.findOne({
            merchandiserId: entity.id,
            reportId: report.id,
          });
          return { ...report, isFavorite: !!existing };
        }
      }

      // If no entity found, report is not favorited
      return { ...report, isFavorite: false };
    } catch (error) {
      console.error('Error adding favorite status to report:', error);
      return { ...report, isFavorite: false };
    }
  }

  /**
   * Fallback method for when JWT doesn't have userType
   */
  private async addFavoriteStatusToReportFallback(
    report: Report | null,
    userId?: number,
  ): Promise<Report | null> {
    if (!report) return null;

    if (!userId) {
      return { ...report, isFavorite: false };
    }

    try {
      // Use parallel queries to find user type - much faster than sequential
      const [akzenteEntity, clientEntity, merchandiserEntity] = await Promise.all([
        this.akzenteService.findByUserId(userId).catch(() => null),
        this.clientService.findByUserId(userId).catch(() => null),
        this.merchandiserService.findByUserIdNumber(userId).catch(() => null),
      ]);

      if (akzenteEntity) {
        // User is Akzente - check favorite status
        const existing = await this.akzenteFavoriteReportsService.findOne({
          akzenteId: akzenteEntity.id,
          reportId: report.id,
        });
        return { ...report, isFavorite: !!existing };
      }

      if (clientEntity) {
        const existing = await this.clientFavoriteReportsService.findOne({
          clientId: clientEntity.id,
          reportId: report.id,
        });
        return { ...report, isFavorite: !!existing };
      }

      if (merchandiserEntity) {
        const existing = await this.merchandiserFavoriteReportsService.findOne({
          merchandiserId: merchandiserEntity.id,
          reportId: report.id,
        });
        return { ...report, isFavorite: !!existing };
      }

      // If no entity found, report is not favorited
      return { ...report, isFavorite: false };
    } catch (error) {
      console.error('Error adding favorite status to report (fallback):', error);
      return { ...report, isFavorite: false };
    }
  }

  /**
   * Helper method to filter status based on user type
   */
  filterStatusForUserType(
    report: Report,
    userType: 'akzente' | 'client' | 'merchandiser',
  ): Report {
    if (!report.status) return report;

    // Get the user-type-specific name and color
    const userSpecificName = this.statusService.getStatusNameForUserType(
      report.status,
      userType,
    );
    const userSpecificColor = this.statusService.getStatusColorForUserType(
      report.status,
      userType,
    );

    const filteredStatus = {
      id: report.status.id,
      name: userSpecificName,
      color: userSpecificColor,
    };

    return {
      ...report,
      status: filteredStatus,
    };
  }

  /**
   * Optimized method to determine user type from JWT token (no DB calls)
   */
  private getUserTypeFromJWT(
    request: any,
  ): 'akzente' | 'client' | 'merchandiser' {
    // If userType is stored in JWT, use it directly (fastest)
    if (request.user?.userType) {
      return request.user.userType;
    }

    // Fallback to default if not in JWT
    return 'akzente';
  }

  /**
   * Optimized method to determine user type and get entities (fallback for when JWT doesn't have userType)
   */
  async determineUserTypeAndEntities(userId: number): Promise<{
    userType: 'akzente' | 'client' | 'merchandiser';
    akzenteEntity: any;
    clientEntity: any;
    merchandiserEntity: any;
  }> {
    // CRITICAL: Validate userId before making any database calls
    if (!userId || isNaN(userId) || userId <= 0) {
      console.error('❌ determineUserTypeAndEntities called with invalid userId:', userId);
      // Return default values without making database calls
      return {
        userType: 'akzente',
        akzenteEntity: null,
        clientEntity: null,
        merchandiserEntity: null,
      };
    }

    try {
      // Make all calls in parallel for better performance
      // Add individual error handling to prevent one failure from affecting others
      const [akzenteEntity, clientEntity, merchandiserEntity] =
        await Promise.all([
          this.akzenteService.findByUserId(userId).catch((e) => {
            console.error('Error fetching Akzente user:', e);
            return null;
          }),
          this.clientService.findByUserId(userId).catch((e) => {
            console.error('Error fetching Client user:', e);
            return null;
          }),
          this.merchandiserService
            .findByUserId(userId as any)
            .catch((e) => {
              console.error('Error fetching Merchandiser user:', e);
              return null;
            }),
        ]);

      let userType: 'akzente' | 'client' | 'merchandiser' = 'akzente';

      if (akzenteEntity) {
        userType = 'akzente';
      } else if (clientEntity) {
        userType = 'client';
      } else if (merchandiserEntity) {
        userType = 'merchandiser';
      }

      return {
        userType,
        akzenteEntity,
        clientEntity,
        merchandiserEntity,
      };
    } catch (error) {
      console.error('Error determining user type:', error);
      return {
        userType: 'akzente',
        akzenteEntity: null,
        clientEntity: null,
        merchandiserEntity: null,
      };
    }
  }

  /**
   * Helper method to determine user type from userId (kept for backward compatibility)
   */
  private async getUserType(
    userId: number,
  ): Promise<'akzente' | 'client' | 'merchandiser'> {
    const { userType } = await this.determineUserTypeAndEntities(userId);
    return userType;
  }

  /**
   * Accept or reject a report by a merchandiser
   */
  async acceptRejectReport(reportId: number, accept: boolean, merchandiserId: number): Promise<Report | null> {

    // Get the report with full details
    const report = await this.reportRepository.findById(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    // Verify this report is assigned to this merchandiser
    if (!report.merchandiser || report.merchandiser.id !== merchandiserId) {
      throw new Error('This report is not assigned to this merchandiser');
    }

    // Get merchandiser details for email
    const merchandiser = await this.merchandiserService.findById(merchandiserId);
    if (!merchandiser) {
      throw new Error('Merchandiser not found');
    }

    // Update the report
    const updateData: any = {
      isAccepted: accept,
    };

    // If accepting, change status to ACCEPTED (3)
    if (accept) {
      updateData.status = { id: ReportStatusEnum.ACCEPTED };
    } else {
      // If rejecting, remove merchandiser assignment and set status back to NEW (1)
      updateData.merchandiser = null;
      updateData.status = { id: ReportStatusEnum.NEW };

      // Send email notification to Akzente staff assigned to the project
      try {
        await this.sendRejectionEmailToAkzente(report, merchandiser);
      } catch (emailError) {
        console.error('⚠️ Failed to send rejection email:', emailError);
        // Don't fail the entire operation if email fails
      }
    }
    await this.reportRepository.update(reportId, updateData);
    return this.findById(reportId);
  }

  /**
   * Send email to Akzente staff when a merchandiser rejects a report
   */
  private async sendRejectionEmailToAkzente(report: Report, merchandiser: Merchandiser): Promise<void> {
    if (!report.project || !report.project.id) {
      console.warn('⚠️ Report has no associated project, cannot send rejection email');
      return;
    }

    // Get Akzente staff assigned to this project
    const projectAssignments = await this.projectAssignedAkzenteService.findByProjectId(report.project.id);
    
    if (!projectAssignments || projectAssignments.length === 0) {
      console.warn('⚠️ No Akzente staff assigned to project, cannot send rejection email');
      return;
    }

    // Get merchandiser name
    const merchandiserName = merchandiser.user 
      ? `${merchandiser.user.firstName || ''} ${merchandiser.user.lastName || ''}`.trim()
      : 'Unbekannter Merchandiser';

    // Prepare email content
    const subject = `Auftrag abgelehnt - ${report.project.name || 'Projekt'}`;
    const emailBody = `
      <h2>Auftrag wurde abgelehnt</h2>
      <p>Der Merchandiser <strong>${merchandiserName}</strong> hat den folgenden Auftrag abgelehnt:</p>
      
      <ul>
        <li><strong>Projekt:</strong> ${report.project.name || 'N/A'}</li>
        <li><strong>Filiale:</strong> ${report.branch?.name || 'N/A'}</li>
        <li><strong>Adresse:</strong> ${report.street || ''} ${report.zipCode || ''}</li>
        <li><strong>Geplant am:</strong> ${report.plannedOn ? new Date(report.plannedOn).toLocaleDateString('de-DE') : 'N/A'}</li>
      </ul>
      
      <p>Der Report wurde auf den Status "NEU" zurückgesetzt und der Merchandiser wurde entfernt.</p>
      <p>Bitte weisen Sie den Report einem anderen Merchandiser zu.</p>
    `;

    const emailBodyText = `
Auftrag wurde abgelehnt

Der Merchandiser ${merchandiserName} hat den folgenden Auftrag abgelehnt:

- Projekt: ${report.project.name || 'N/A'}
- Report ID: ${report.id}
- Filiale: ${report.branch?.name || 'N/A'}
- Adresse: ${report.street || ''} ${report.zipCode || ''}
- Geplant am: ${report.plannedOn ? new Date(report.plannedOn).toLocaleDateString('de-DE') : 'N/A'}

Der Report wurde auf den Status "NEU" zurückgesetzt und der Merchandiser wurde entfernt.
Bitte weisen Sie den Report einem anderen Merchandiser zu.
    `;

    // Send email to all assigned Akzente staff
    const emailPromises = projectAssignments.map(async (assignment) => {
      if (!assignment.akzente?.user?.email) {
        console.warn('⚠️ Akzente staff has no email address, skipping');
        return;
      }

      try {
        await this.mailerService.sendMail({
          to: assignment.akzente.user.email,
          subject: subject,
          text: emailBodyText,
          html: emailBody,
        });
      } catch (error) {
        console.error(`❌ Failed to send email to ${assignment.akzente.user.email}:`, error);
        // Continue with other emails even if one fails
      }
    });

    await Promise.allSettled(emailPromises);
  }

  async findByMerchandiserId(merchandiserId: number, userId?: number): Promise<Report[]> {
    const reports =
      await this.reportRepository.findByMerchandiserId(merchandiserId);

    // CRITICAL: Validate userId before making any database calls
    if (!userId || typeof userId !== 'number' || isNaN(userId) || userId <= 0) {
      // If no valid user ID, return reports without favorite status
      // This is safe for merchandiser requests as they don't need favorite status
      return reports.map((report) => ({ ...report, isFavorite: false }));
    }

    // For merchandiser requests, skip favorite status to avoid connection pool exhaustion
    // Merchandisers don't have favorite reports in the same way as Akzente/Client users
    // Return reports without favorite status and without status filtering
    return reports.map((report) => ({ ...report, isFavorite: false }));
  }

  /**
   * Optimized method for dashboard - only loads essential fields and adds favorites efficiently
   */
  async findDashboardReportsByMerchandiserId(
    merchandiserId: number,
    userId?: number,
    request?: any,
  ): Promise<Report[]> {
    const reports = await this.reportRepository.findDashboardReportsByMerchandiserId(merchandiserId);

    // For merchandiser dashboard, we don't need favorite status
    // Merchandisers don't have favorite reports in the same way
    // This avoids unnecessary database connections
    return reports.map((report) => ({ ...report, isFavorite: false }));
  }

  /**
   * Get unique client companies associated with a merchandiser through their reports
   */
  async getClientCompaniesByMerchandiserId(
    merchandiserId: number,
  ): Promise<number[]> {
    const reports =
      await this.reportRepository.findByMerchandiserId(merchandiserId);

    // Extract unique client company IDs
    const clientCompanyIds = [
      ...new Set(reports.map((report) => report.clientCompany.id)),
    ];

    return clientCompanyIds;
  }

  /**
   * Generate Excel export for project reports with files and photos
   */
  async generateExcelExport(reports: Report[]): Promise<Buffer> {
    // Check if there are any reports to export
    if (!reports || reports.length === 0) {
      throw new Error('Keine Daten in diesem Projekt vorhanden.');
    }

    const STATIC_COLUMN_COUNT = 14;

    reports.forEach((report, index) => {
      if (
        report.uploadedAdvancedPhotos &&
        report.uploadedAdvancedPhotos.length > 0
      ) {
        report.uploadedAdvancedPhotos.forEach((photo, photoIndex) => {
          const url = photo.file?.path
            ? this.formatFileUrl(photo.file.path)
            : 'No URL';
          const label = photo?.label || 'No label';
        });
      }
    });

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();

    // Collect all unique questions from all reports to create dynamic columns
    const allQuestions = new Set<string>();
    reports.forEach((report) => {
      if (report.answers) {
        report.answers.forEach((answer) => {
          if (answer.question?.questionText) {
            allQuestions.add(answer.question.questionText);
          }
        });
      }
    });

    // Prepare data for Excel export
    const excelData = reports.map((report) => {
      // Get merchandiser name
      const merchandiserName = report.merchandiser?.user
        ? `${report.merchandiser.user.firstName || ''} ${report.merchandiser.user.lastName || ''}`.trim()
        : '';

      const branchNumber = report.branch?.branchNumber
        ? report.branch.branchNumber.toString().trim()
        : '';
      const branchName = report.branch?.name ? report.branch.name.trim() : '';
      // Get uploaded files info (for future use if needed)
      // const uploadedFiles = report.uploadedAdvancedPhotos
      //   ?.map((photo) => {
      //     const fileName = photo.file?.path
      //       ? photo.file.path.split('/').pop()
      //       : '';
      //     return `${fileName}${photo.label ? ` (${photo.label})` : ''}`;
      //   })
      //   .join('; ') || '';

      // Answers info removed - not needed for Excel export

      // Separate photos by type (before/after)
      const beforePhotos =
        report.uploadedAdvancedPhotos?.filter(
          (photo) => photo.beforeAfterType === 'before',
        ) || [];
      const afterPhotos =
        report.uploadedAdvancedPhotos?.filter(
          (photo) => photo.beforeAfterType === 'after',
        ) || [];
      // const otherPhotos =
      //   report.uploadedAdvancedPhotos?.filter(
      //     (photo) =>
      //       !photo.beforeAfterType ||
      //       (photo.beforeAfterType !== 'before' &&
      //         photo.beforeAfterType !== 'after'),
      //   ) || [];

      // Generate URLs for photos (for future use if needed)
      // const beforePhotoUrls = beforePhotos
      //   .map((photo) => {
      //     const fileName = photo.file?.path
      //       ? photo.file.path.split('/').pop()
      //       : '';
      //     const url = photo.file?.path || '';
      //     return `${url}${photo.label ? ` (${photo.label})` : ''}`;
      //   })
      //   .join('; ');

      // const afterPhotoUrls = afterPhotos
      //   .map((photo) => {
      //     const fileName = photo.file?.path
      //       ? photo.file.path.split('/').pop()
      //       : '';
      //     const url = photo.file?.path || '';
      //     return `${url}${photo.label ? ` (${photo.label})` : ''}`;
      //   })
      //   .join('; ');

      // const otherPhotoUrls = otherPhotos
      //   .map((photo) => {
      //     const fileName = photo.file?.path
      //       ? photo.file.path.split('/').pop()
      //       : '';
      //     const url = photo.file?.path || '';
      //     return `${url}${photo.label ? ` (${photo.label})` : ''}`;
      //   })
      //   .join('; ');

      // Create row data with static columns + dynamic questions
      const rowData: any = {
        ID: report.id,
        FILIALNUMMER: branchNumber,
        'FILIALE\n(Text)': branchName,
        'STRABE +\nHAUSNUM\nMER': report.street || '',
        PLZ: report.zipCode || '',
        ORT: report.branch?.city?.name || '',
        LAND: 'Deutschland',
        'TELEFON\nFILIALE\n(Text)': '',
        'NOTIZ\n(Text)': report.note || '',
        'MERCHANDISER\n(Text)': merchandiserName,
        BESUCHSDATUM: report.plannedOn
          ? new Date(report.plannedOn).toLocaleDateString('de-DE')
          : '',
        'Report bis': report.reportTo
          ? new Date(report.reportTo).toLocaleDateString('de-DE')
          : '',
      };

      // Add dynamic question columns with formatted headers
      allQuestions.forEach((questionText) => {
        // Find any answer with this question text to get the question options
        const sampleAnswer = reports.find(r => r.answers?.some(ans => ans.question?.questionText === questionText))?.answers?.find(
          (ans) => ans.question?.questionText === questionText
        );
        
        const answer = report.answers?.find(
          (ans) => ans.question?.questionText === questionText
        );
        
        // Create formatted header based on question type
        let headerText = '';
        
        if (sampleAnswer?.question?.answerType?.name?.toLowerCase() === 'boolean') {
          // For boolean questions: show question text with JA/NEIN options
          headerText = `${questionText}\n1. JA\n2. NEIN`;
        } else {
          // For other questions: show FRAGE: "Question Text"
          headerText = `FRAGE:\n"${questionText}"`;
        }
        
        if (answer) {
          let answerText = '';
          if (answer.textAnswer) {
            answerText = answer.textAnswer;
          } else if (answer.selectedOption) {
            answerText = answer.selectedOption.optionText;
          }
          rowData[headerText] = answerText;
        } else {
          rowData[headerText] = ''; // Empty for reports that don't have this question
        }
      });

      // Add photo columns after questions
      // FOTO VORHER columns (1, 2, 3)
      for (let i = 1; i <= 3; i++) {
        const photo = beforePhotos[i - 1];
        const url = photo?.file?.path
          ? this.formatFileUrl(photo.file.path)
          : '';
        rowData[`FOTO\nVORHER\n${i}`] = url; // Store URL for hyperlink creation later
      }

      // FOTO NACHHER columns (1, 2, 3)
      for (let i = 1; i <= 3; i++) {
        const photo = afterPhotos[i - 1];
        const url = photo?.file?.path
          ? this.formatFileUrl(photo.file.path)
          : '';
        rowData[`FOTO\nNACHHER\n${i}`] = url; // Store URL for hyperlink creation later
      }

      // FOTO (erweitert) columns with dynamic labels
      // Group advanced photos by their labels and create VORHER/NACHHER pairs
      const advancedPhotos = report.uploadedAdvancedPhotos || [];
      const photosByLabel = new Map<string, { before?: any; after?: any }>();
      
      advancedPhotos.forEach((photo) => {
        if (photo.label && photo.label.trim() !== '') {
          const label = photo.label.trim();
          if (!photosByLabel.has(label)) {
            photosByLabel.set(label, {});
          }
          const labelGroup = photosByLabel.get(label)!;
          if (photo.beforeAfterType === 'before') {
            labelGroup.before = photo;
          } else if (photo.beforeAfterType === 'after') {
            labelGroup.after = photo;
          }
        }
      });

      // Create columns for each label group (up to 2 groups)
      let groupIndex = 1;
      for (const [label, group] of photosByLabel) {
        if (groupIndex > 2) break; // Limit to 2 groups
        
        // VORHER column for this label
        const beforeUrl = group.before?.file?.path
          ? this.formatFileUrl(group.before.file.path)
          : '';
        rowData[`FOTO (erweitert)\nVORHER "Bezeichnung"\n${groupIndex}"`] = beforeUrl;
        
        // NACHHER column for this label
        const afterUrl = group.after?.file?.path
          ? this.formatFileUrl(group.after.file.path)
          : '';
        rowData[`FOTO (erweitert)\nNACHHER\n"${label}"`] = afterUrl;
        
        groupIndex++;
      }

      return rowData;
    });

    // Create worksheet from data
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths for static + dynamic format
    const columnWidths = [
      { wch: 8 }, // ID
      { wch: 15 }, // FILIALNUMMER
      { wch: 20 }, // FILIALE
      { wch: 25 }, // STRABE + HAUSNUM MER
      { wch: 8 }, // PLZ
      { wch: 15 }, // ORT
      { wch: 12 }, // LAND
      { wch: 15 }, // TELEFON FILIALE
      { wch: 30 }, // NOTIZ
      { wch: 20 }, // MERCHANDISER
      { wch: 12 }, // BESUCHSDATUM
      { wch: 12 }, // Report bis
    ];

    // Add dynamic column widths for questions (first)
    allQuestions.forEach(() => {
      columnWidths.push({ wch: 30 }); // Default width for question columns
    });

    // Add photo column widths (after questions)
    columnWidths.push(
      { wch: 20 }, // FOTO VORHER 1
      { wch: 20 }, // FOTO VORHER 2
      { wch: 20 }, // FOTO VORHER 3
      { wch: 20 }, // FOTO NACHHER 1
      { wch: 20 }, // FOTO NACHHER 2
      { wch: 20 }, // FOTO NACHHER 3
      { wch: 25 }, // FOTO (erweitert) VORHER "Bezeichnung" 1
      { wch: 25 }, // FOTO (erweitert) NACHHER "Bezeichnung 1"
      { wch: 25 }, // FOTO (erweitert) VORHER "Bezeichnung" 2
      { wch: 25 }, // FOTO (erweitert) NACHHER "Bezeichnung 2"
    );

    worksheet['!cols'] = columnWidths;

    // Add photos to Excel cells and create hyperlinks
    await this.addPhotosToWorksheet(
      worksheet,
      reports,
      STATIC_COLUMN_COUNT,
      allQuestions.size,
    );
    this.addHyperlinksToPhotoCells(
      worksheet,
      reports,
      allQuestions,
      STATIC_COLUMN_COUNT,
    );

    // Get the range of the worksheet
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    // Style the header row (row 0) with full styling support
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!worksheet[cellAddress]) continue;

      // Set header cell styling with xlsx-js-style
      worksheet[cellAddress].s = {
        fill: {
          patternType: 'solid',
          fgColor: { rgb: 'C0C0C0' }, // Silver gray background
          bgColor: { rgb: 'C0C0C0' },
        },
        font: {
          bold: true,
          sz: 10,
          color: { rgb: '000000' }, // Black text
          name: 'Calibri',
        },
        alignment: {
          horizontal: 'center',
          vertical: 'top',
          wrapText: true,
        },
      };
    }

    // Set row height for header row - much taller
    worksheet['!rows'] = [
      { hpt: 100 }, // Header row height increased to 60 points
      ...Array(range.e.r).fill({ hpt: 18 }), // Data rows height
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reports Export');

    // Generate Excel buffer with styling
    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true,
    });

    return excelBuffer;
  }

  /**
   * Add photos to Excel worksheet cells with new structured format
   */
  private async addPhotosToWorksheet(
    worksheet: any,
    reports: Report[],
    staticColumnCount: number,
    questionCount: number,
  ): Promise<void> {
    try {
      const basePhotoCol = staticColumnCount + questionCount;
      const fotoVorherCols = [
        basePhotoCol,
        basePhotoCol + 1,
        basePhotoCol + 2,
      ];
      const fotoNachherCols = [
        basePhotoCol + 3,
        basePhotoCol + 4,
        basePhotoCol + 5,
      ];
      const fotoErweitertVorherCols = [
        basePhotoCol + 6,
        basePhotoCol + 8,
      ];
      const fotoErweitertNachherCols = [
        basePhotoCol + 7,
        basePhotoCol + 9,
      ];

      // Process each report row
      for (let rowIndex = 0; rowIndex < reports.length; rowIndex++) {
        const report = reports[rowIndex];
        const excelRowIndex = rowIndex + 2; // +2 because Excel is 1-indexed and we have headers

        // Separate photos by type
        const beforePhotos =
          report.uploadedAdvancedPhotos?.filter(
            (photo) => photo.beforeAfterType === 'before',
          ) || [];
        const afterPhotos =
          report.uploadedAdvancedPhotos?.filter(
            (photo) => photo.beforeAfterType === 'after',
          ) || [];

        // Add FOTO VORHER photos (1, 2, 3)
        for (let i = 0; i < 3; i++) {
          if (beforePhotos[i]) {
            await this.addPhotoToCell(
              worksheet,
              beforePhotos[i],
              excelRowIndex,
              fotoVorherCols[i],
            );
          }
        }

        // Add FOTO NACHHER photos (1, 2, 3)
        for (let i = 0; i < 3; i++) {
          if (afterPhotos[i]) {
            await this.addPhotoToCell(
              worksheet,
              afterPhotos[i],
              excelRowIndex,
              fotoNachherCols[i],
            );
          }
        }

        // Add FOTO (erweitert) NACHHER "Bezeichnung" photos (4th, 5th after photos)
        for (let i = 0; i < 2; i++) {
          const beforeIndex = i + 3;
          if (beforePhotos[beforeIndex]) {
            await this.addPhotoToCell(
              worksheet,
              beforePhotos[beforeIndex],
              excelRowIndex,
              fotoErweitertVorherCols[i],
            );
          }

          const afterIndex = i + 3;
          if (afterPhotos[afterIndex]) {
            await this.addPhotoToCell(
              worksheet,
              afterPhotos[afterIndex],
              excelRowIndex,
              fotoErweitertNachherCols[i],
            );
          }
        }
      }
    } catch (error) {
      console.error('❌ Error adding photos to worksheet:', error);
      // Continue without photos if there's an error
    }
  }

  /**
   * Add a single photo to a specific Excel cell
   */
  private async addPhotoToCell(
    worksheet: any,
    uploadedPhoto: any,
    rowIndex: number,
    colIndex: number,
  ): Promise<void> {
    try {
      if (!uploadedPhoto?.file?.path) {
        return;
      }

      const filePath = uploadedPhoto.file.path;

      // Convert URL back to local file path if it's a URL
      let localFilePath = filePath;
      if (filePath.startsWith('http')) {
        // Extract the path from URL (remove domain and API prefix)
        const urlParts = filePath.split('/');
        const uploadsIndex = urlParts.findIndex((part) => part === 'uploads');
        if (uploadsIndex !== -1) {
          localFilePath = path.join(
            process.cwd(),
            urlParts.slice(uploadsIndex).join('/'),
          );
        } else {
          console.warn(`Cannot extract local path from URL: ${filePath}`);
          return;
        }
      } else if (filePath.startsWith('/api/v1/uploads/')) {
        // Remove API prefix and convert to local path
        localFilePath = path.join(
          process.cwd(),
          filePath.replace('/api/v1/', ''),
        );
      }

      // Check if file exists
      if (!fs.existsSync(localFilePath)) {
        console.warn(
          `Photo file not found: ${localFilePath} (original: ${filePath})`,
        );
        return;
      }

      // Read the image file
      const imageBuffer = fs.readFileSync(localFilePath);

      // Create base64 string
      const base64Image = imageBuffer.toString('base64');
      const imageExtension = path.extname(localFilePath).toLowerCase();

      // Determine MIME type
      let mimeType = 'image/jpeg';
      if (imageExtension === '.png') mimeType = 'image/png';
      if (imageExtension === '.gif') mimeType = 'image/gif';
      if (imageExtension === '.bmp') mimeType = 'image/bmp';

      const dataUri = `data:${mimeType};base64,${base64Image}`;

      // Create image object for Excel
      const imageObj = {
        type: 'image',
        data: dataUri,
        position: {
          type: 'absolute',
          x: 0,
          y: 0,
          width: 150, // Fixed width for photos
          height: 100, // Fixed height for photos
        },
      };

      // Get cell reference
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex - 1, c: colIndex });

      // Set cell content to empty and add image
      if (!worksheet[cellRef]) {
        worksheet[cellRef] = { v: '', t: 's' };
      }

      // Add image to cell (xlsx-js-style supports images)
      worksheet[cellRef].image = imageObj;
    } catch (error) {
      console.error(`❌ Error adding photo to cell:`, error);
    }
  }

  /**
   * Add hyperlinks to photo URL cells
   */
  private addHyperlinksToPhotoCells(
    worksheet: any,
    reports: Report[],
    allQuestions: Set<string>,
    staticColumnCount: number,
  ): void {
    try {
      const questionCount = allQuestions.size;
      const basePhotoCol = staticColumnCount + questionCount;
      const fotoVorherCols = [
        basePhotoCol,
        basePhotoCol + 1,
        basePhotoCol + 2,
      ];
      const fotoNachherCols = [
        basePhotoCol + 3,
        basePhotoCol + 4,
        basePhotoCol + 5,
      ];
      const fotoErweitertVorherCols = [
        basePhotoCol + 6,
        basePhotoCol + 8,
      ];
      const fotoErweitertNachherCols = [
        basePhotoCol + 7,
        basePhotoCol + 9,
      ];

      // Process each report row
      for (let rowIndex = 0; rowIndex < reports.length; rowIndex++) {
        const report = reports[rowIndex];
        const excelRowIndex = rowIndex + 2; // +2 because Excel is 1-indexed and we have headers

        // Separate photos by type
        const beforePhotos =
          report.uploadedAdvancedPhotos?.filter(
            (photo) => photo.beforeAfterType === 'before',
          ) || [];
        const afterPhotos =
          report.uploadedAdvancedPhotos?.filter(
            (photo) => photo.beforeAfterType === 'after',
          ) || [];

        // Add hyperlinks to FOTO VORHER columns
        for (let i = 0; i < 3; i++) {
          const photo = beforePhotos[i];
          if (photo?.file?.path) {
            const url = this.formatFileUrl(photo.file.path);
            const cellRef = XLSX.utils.encode_cell({
              r: excelRowIndex - 1,
              c: fotoVorherCols[i],
            });
            this.createHyperlinkInCell(worksheet, cellRef, url, url);
          }
        }

        // Add hyperlinks to FOTO NACHHER columns
        for (let i = 0; i < 3; i++) {
          const photo = afterPhotos[i];
          if (photo?.file?.path) {
            const url = this.formatFileUrl(photo.file.path);
            const cellRef = XLSX.utils.encode_cell({
              r: excelRowIndex - 1,
              c: fotoNachherCols[i],
            });
            this.createHyperlinkInCell(worksheet, cellRef, url, url);
          }
        }

        // Add hyperlinks to FOTO (erweitert) columns
        // Group advanced photos by their labels and create VORHER/NACHHER pairs
        const advancedPhotos = report.uploadedAdvancedPhotos || [];
        const photosByLabel = new Map<string, { before?: any; after?: any }>();
        
        advancedPhotos.forEach((photo) => {
          if (photo.label && photo.label.trim() !== '') {
            const label = photo.label.trim();
            if (!photosByLabel.has(label)) {
              photosByLabel.set(label, {});
            }
            const labelGroup = photosByLabel.get(label)!;
            if (photo.beforeAfterType === 'before') {
              labelGroup.before = photo;
            } else if (photo.beforeAfterType === 'after') {
              labelGroup.after = photo;
            }
          }
        });

        // Create hyperlinks for each label group (up to 2 groups)
        let groupIndex = 0;
        for (const [, group] of photosByLabel) {
          if (groupIndex >= 2) break; // Limit to 2 groups
          
          // VORHER hyperlink
          if (group.before?.file?.path) {
            const url = this.formatFileUrl(group.before.file.path);
            const cellRef = XLSX.utils.encode_cell({
              r: excelRowIndex - 1,
              c: fotoErweitertVorherCols[groupIndex],
            });
            this.createHyperlinkInCell(worksheet, cellRef, url, url);
          }
          
          // NACHHER hyperlink
          if (group.after?.file?.path) {
            const url = this.formatFileUrl(group.after.file.path);
            const cellRef = XLSX.utils.encode_cell({
              r: excelRowIndex - 1,
              c: fotoErweitertNachherCols[groupIndex],
            });
            this.createHyperlinkInCell(worksheet, cellRef, url, url);
          }
          
          groupIndex++;
        }
      }
    } catch (error) {
      console.error('❌ Error adding hyperlinks to photo cells:', error);
    }
  }

  /**
   * Create a hyperlink in a specific Excel cell
   */
  private createHyperlinkInCell(
    worksheet: any,
    cellRef: string,
    url: string,
    displayText: string,
  ): void {
    try {
      if (!worksheet[cellRef]) {
        worksheet[cellRef] = { v: displayText, t: 's' };
      }

      // Create hyperlink object for xlsx-js-style
      worksheet[cellRef].l = {
        Target: url,
        Tooltip: `Click to open: ${displayText}`,
      };

      // Style the hyperlink (blue color, underlined)
      worksheet[cellRef].s = {
        ...worksheet[cellRef].s,
        font: {
          ...worksheet[cellRef].s?.font,
          color: { rgb: '0000FF' }, // Blue color
          underline: true,
        },
      };
    } catch (error) {
      console.error(`❌ Error creating hyperlink in cell ${cellRef}:`, error);
    }
  }

  /**
   * Format file path to full URL (same logic as FileType @Transform decorator)
   */
  private formatFileUrl(filePath: string): string {
    if (!filePath) return '';

    const fileDriver = (fileConfig() as any).driver;

    if (fileDriver === FileDriver.LOCAL) {
      const backendDomain =
        (appConfig() as any).backendDomain || 'http://localhost:3000';
      return backendDomain + filePath;
    }

    // For S3 or other drivers, return as is (they should already be URLs)
    return filePath;
  }
}
