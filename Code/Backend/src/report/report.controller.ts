import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Request,
  Res,
  HttpException,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { EditReportDto } from './dto/edit-report.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { Report } from './domain/report';
import { FindAllReportDto } from './dto/find-all-report.dto';
import {
  InfinityPaginationResponse,
  InfinityPaginationResponseDto,
} from '../utils/dto/infinity-pagination-response.dto';
import { infinityPagination } from '../utils/infinity-pagination';
import { UpdateReportDto } from './dto/update-cities.dto';
import { BranchService } from '../branch/branch.service';
import { ProjectService } from '../project/project.service';
import { ProjectBranchService } from '../project-branch/project-branch.service';
import { ClientCompanyService } from '../client-company/client-company.service';
import { StatusService } from '../report-status/status.service';
import { ReportStatusEnum } from '../report-status/dto/status.enum';
import { QuestionService } from '../question/question.service';
import { AnswerService } from '../answer/answer.service';
import { MerchandiserService } from '../merchandiser/merchandiser.service';
import { ClientService } from '../client/client.service';
import { ProjectAssignedClientService } from '../project-assigned-client/project-assigned-client.service';
import { QuestionOptionService } from '../question-option/question-option.service';
import { CitiesService } from '../cities/cities.service';
import { ConversationService } from '../conversation/conversation.service';
import { MessageService } from '../message/message.service';
import { MessageMapper } from '../message/infrastructure/persistence/relational/mappers/message.mapper';
import { UsersService } from '../users/users.service';
import { ClientCompanyAssignedClientService } from '../client-company-assigned-client/client-company-assigned-client.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PhotoService } from '../photo/photo.service';
import { Inject, forwardRef } from '@nestjs/common';
import { AdvancedPhotoService } from '../advanced-photo/advanced-photo.service';
import { UploadedAdvancedPhotosService } from '../uploaded-advanced-photos/uploaded-advanced-photos.service';
import { FilesLocalService } from '../files/infrastructure/uploader/local/files.service';
import { AkzenteFavoriteReportsService } from '../akzente-favorite-reports/akzente-favorite-reports.service';
import { AkzenteService } from '../akzente/akzente.service';
import { ClientFavoriteReportsService } from '../client-favorite-reports/client-favorite-reports.service';
import { MerchandiserFavoriteReportsService } from '../merchandiser-favorite-reports/merchandiser-favorite-reports.service';
import { ReportStatusSchedulerService } from './report-status-scheduler.service';

function parseDate(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }

  if (typeof value === 'number') {
    if (isNaN(value)) {
      return null;
    }

    // Excel stores dates as numbers counting days since 1899-12-30
    const excelEpoch = Date.UTC(1899, 11, 30);
    const millis = excelEpoch + value * 24 * 60 * 60 * 1000;
    const dateFromNumber = new Date(millis);
    return isNaN(dateFromNumber.getTime()) ? null : dateFromNumber.toISOString();
  }

  const dateStr = String(value).trim();
  if (!dateStr) {
    return null;
  }

  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (dateStr.includes('.')) {
    const [day, month, year] = dateStr.split('.');
    const date = new Date(Number(year), Number(month) - 1, Number(day));
  return isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

@ApiTags('Report')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'report',
  version: '1',
})
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly branchService: BranchService,
    private readonly projectService: ProjectService,
    private readonly projectBranchService: ProjectBranchService,
    private readonly clientCompanyService: ClientCompanyService,
    private readonly statusService: StatusService,
    private readonly questionService: QuestionService,
    private readonly answerService: AnswerService,
    private readonly merchandiserService: MerchandiserService,
    private readonly questionOptionService: QuestionOptionService,
    private readonly citiesService: CitiesService,
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => ClientCompanyAssignedClientService))
    private readonly clientCompanyAssignedClientService: ClientCompanyAssignedClientService,
    private readonly notificationsService: NotificationsService,
    private readonly photoService: PhotoService,
    private readonly advancedPhotoService: AdvancedPhotoService,
    private readonly uploadedAdvancedPhotosService: UploadedAdvancedPhotosService,
    private readonly filesLocalService: FilesLocalService,
    private readonly akzenteFavoriteReportsService: AkzenteFavoriteReportsService,
    private readonly akzenteService: AkzenteService,
    private readonly clientService: ClientService,
    private readonly clientFavoriteReportsService: ClientFavoriteReportsService,
    private readonly merchandiserFavoriteReportsService: MerchandiserFavoriteReportsService,
    private readonly reportStatusSchedulerService: ReportStatusSchedulerService,
    private readonly projectAssignedClientService: ProjectAssignedClientService,
  ) {}

  @Post()
  @ApiCreatedResponse({
    type: Report,
  })
  async create(@Body() createReportDto: CreateReportDto) {
    const createdReport = await this.reportService.create(createReportDto);
    
    // Create conversation for this report
    await this.conversationService.create({
      reportId: createdReport.id,
    });
    
    return createdReport;
  }

  @Post('bulkinsert/:projectId')
  async bulkInsertReports(
    @Param('projectId') projectId: number,
    @Body() reports: any[],
  ) {
    // Get the project and its client company
    const project = await this.projectService.findById(Number(projectId));
    if (!project) throw new Error('Project not found');
    const clientCompanyId = project.clientCompany.id;

    // Get all statuses for lookup
    const allStatuses = await this.statusService.findAllWithPagination({ paginationOptions: { page: 1, limit: 100 } });
    const statusMap: Map<string | number, any> = new Map();
    for (const s of allStatuses.data) {
      statusMap.set(s.id, s);
      statusMap.set(s.name, s);
    }

    // Get all project questions for matching
    const projectQuestions = await this.questionService.findByProjectId(projectId);
    // Fetch options for each question
    for (const pq of projectQuestions as any[]) {
      pq.options = await this.questionOptionService.findByQuestionId(pq.id);
    }

    const createdReports: Report[] = [];
    for (const report of reports) {
      const branchNumber = report.branchNumber
        ? String(report.branchNumber).trim()
        : '';
      // 1. Find or create branch using all details (name, street, zipCode, city) in the same project
      let branch: any = null;
      let cityObj: any = undefined;
      let cityId: number | undefined = undefined;
      
      if (report.city) {
        const foundCity = await this.citiesService.findByName(report.city);
        if (foundCity) {
          cityObj = { id: foundCity.id };
          cityId = foundCity.id;
        }
      }

      if (!branch && branchNumber) {
        branch = await this.branchService.findByBranchNumberAndClient(
          branchNumber,
          clientCompanyId,
        );
      }

      // First, try to find existing branch with exact match (name + street + zipCode + city + project)
      if (!branch && cityId) {
        branch = await this.branchService.findByNameStreetZipCodeCityAndProject(
          report.branch,
          report.street || null,
          report.zip || null,
          cityId,
          projectId
        );
      }

      // If exact match found, use it
      if (branch) {
        // Update phone if different (phone can be updated without creating new branch)
        if (report.phone && branch.phone !== report.phone) {
          await this.branchService.update(branch.id, { phone: report.phone });
          branch = await this.branchService.findById(branch.id);
        }
        if (branchNumber && branch.branchNumber !== branchNumber) {
          await this.branchService.update(branch.id, {
            branchNumber,
          });
          branch = await this.branchService.findById(branch.id);
        }
      } else {
        // No exact match found, create a new branch
        // Ensure branch name is not empty
        const branchName = report.branch && String(report.branch).trim() ? String(report.branch).trim() : null;
        const branchStreet = report.street && String(report.street).trim() ? String(report.street).trim() : null;
        
        if (!branchName) {
          console.warn(`⚠️ Skipping report: branch name is missing for branch number ${branchNumber || 'N/A'}`);
          continue; // Skip this report if branch name is missing
        }
        
        const branchCreatePayload: any = {
          name: branchName,
          branchNumber: branchNumber || null,
          street: branchStreet,
          zipCode: report.zip && String(report.zip).trim() ? String(report.zip).trim() : null,
          client: { id: clientCompanyId },
          phone: report.phone && String(report.phone).trim() ? String(report.phone).trim() : null,
        };

        if (cityObj?.id) {
          branchCreatePayload.city = cityObj;
        }

        branch = await this.branchService.create(branchCreatePayload);
      }
      
      // Create project-branch relationship if it doesn't exist
      // (handled in service, but we ensure it exists for both new and existing branches)
      await this.projectBranchService.create({
        project: { id: projectId },
        branch: { id: branch.id },
      });
      
      // 2. Merchandiser assignment by full name (needed for status determination)
      let merchandiserId: number | undefined = undefined;
      if (report.merchandiser) {
        const merchandiser = await this.merchandiserService.findByFullName(report.merchandiser);
        if (merchandiser && merchandiser.id) {
          merchandiserId = merchandiser.id;
        }
      }
      // Helper function to check if a date value is effectively empty
      const hasValidDate = (dateValue: any): boolean => {
        if (!dateValue) return false;
        if (typeof dateValue === 'string' && dateValue.trim() === '') return false;
        return true;
      };

      // Determine status based on merchandiser and planned date
      const hasPlannedOn = hasValidDate(report.plannedOn);
      const hasVisitDate = hasValidDate(report.visitDate);
      
      let status: any = null;
      if (!merchandiserId) {
        // No merchandiser assigned = NEW
        status = statusMap.get(ReportStatusEnum.NEW);
      } else if (merchandiserId && !hasPlannedOn) {
        // Has merchandiser but no planned date = ASSIGNED
        status = statusMap.get(ReportStatusEnum.ASSIGNED);
      } else if (merchandiserId && hasPlannedOn && !hasVisitDate) {
        // Has merchandiser and planned date but no visit date = ACCEPTED
        status = statusMap.get(ReportStatusEnum.ACCEPTED);
      } else if (merchandiserId && hasPlannedOn && hasVisitDate) {
        // Has merchandiser, planned date, and visit date = DRAFT
        status = statusMap.get(ReportStatusEnum.DRAFT);
      } else {
        // Fallback to NEW
        status = statusMap.get(ReportStatusEnum.NEW);
      }
      // 4. Build CreateReportDto
      const createReportDto: any = {
        project: { id: project.id },
        status: { id: status.id },
        clientCompany: { id: clientCompanyId },
        branch: { id: branch.id },
        address: report.address,
        plannedOn: report.plannedOn ? parseDate(report.plannedOn) : null,
        note: report.note,
        reportTo: report.reportTo ? parseDate(report.reportTo) : null,
        visitDate: report.visitDate ? parseDate(report.visitDate) : null,
        feedback: report.feedback,
        isSpecCompliant: report.isSpecCompliant === '1' || report.isSpecCompliant === 1 || report.isSpecCompliant === true,
        merchandiser: merchandiserId ? { id: merchandiserId } : undefined,
        street: report.street,
        zipCode: report.zip,
        city: report.city,
        phone: report.phone,
      };
      // 5. Create report
      const created = await this.reportService.create(createReportDto);
      // 6. Handle questions/answers
      if (Array.isArray(report.questions)) {
        for (const q of report.questions) {
          const projectQuestion = (projectQuestions as any[]).find(pq => pq.questionText === q.question);
          if (projectQuestion) {
            const answerType = projectQuestion.answerType?.name?.toLowerCase().trim();
            
            // Validation for answer type vs. answer value
            if (answerType === 'multiselect' && !(Array.isArray(q.answer) || typeof q.answer === 'string')) {
              throw new Error(`Expected array or string answer for multiselect question: ${q.question}`);
            }
            if (answerType === 'boolean' && typeof q.answer !== 'boolean') {
              throw new Error(`Expected boolean answer for boolean question: ${q.question}`);
            }
            if ((answerType === 'text' || answerType === 'long text') && typeof q.answer !== 'string') {
              throw new Error(`Expected string answer for text question: ${q.question}`);
            }

            let answerPayload: any = {
              question: { id: projectQuestion.id },
              report: { id: created.id },
            };

            if (answerType === 'multiselect' || answerType === 'multiple choice') {
              // Accept both array and string for multiselect
              const selectedOptions = Array.isArray(q.answer)
                ? q.answer
                : typeof q.answer === 'string'
                  ? [q.answer]
                  : [];
              
              for (const optionText of selectedOptions) {
                // Try exact match first
                let option = (projectQuestion.options as any[]).find((opt: any) =>
                  (opt.optionText || opt.text) === optionText
                );
                
                // If no exact match, try case-insensitive match
                if (!option) {
                  option = (projectQuestion.options as any[]).find((opt: any) =>
                    (opt.optionText || opt.text).toLowerCase() === optionText.toLowerCase()
                  );
                }
                
                // If still no match, try partial match (for cases like "moption1" vs "moption 1")
                if (!option) {
                  option = (projectQuestion.options as any[]).find((opt: any) =>
                    (opt.optionText || opt.text).toLowerCase().replace(/\s+/g, '') === optionText.toLowerCase().replace(/\s+/g, '')
                  );
                }
                
                if (option && option.id) {
                  await this.answerService.create({
                    ...answerPayload,
                    selectedOption: { id: option.id },
                    textAnswer: null,
                  });
                } else {
                  console.error('No matching option found for:', optionText);
                  console.error('Available options:', (projectQuestion.options as any[]).map(opt => opt.optionText || opt.text));
                }
              }
            } else if ((answerType === 'select' || answerType === 'dropdown') && typeof q.answer === 'string') {
              // Try exact match first
              let option = (projectQuestion.options as any[]).find((opt: any) =>
                (opt.optionText || opt.text) === q.answer
              );
              
              // If no exact match, try case-insensitive match
              if (!option) {
                option = (projectQuestion.options as any[]).find((opt: any) =>
                  (opt.optionText || opt.text).toLowerCase() === q.answer.toLowerCase()
                );
              }
              
              // If still no match, try partial match
              if (!option) {
                option = (projectQuestion.options as any[]).find((opt: any) =>
                  (opt.optionText || opt.text).toLowerCase().replace(/\s+/g, '') === q.answer.toLowerCase().replace(/\s+/g, '')
                );
              }
              
              if (option && option.id) {
                await this.answerService.create({
                  ...answerPayload,
                  selectedOption: { id: option.id },
                  textAnswer: null,
                });
              } else {
                console.error('No matching option for select question:', q.answer);
                console.error('Available options:', (projectQuestion.options as any[]).map(opt => opt.optionText || opt.text));
              }
            } else if (answerType === 'boolean') {
              await this.answerService.create({
                ...answerPayload,
                textAnswer: q.answer === true ? 'true' : 'false',
              });
            } else if (answerType === 'text' || answerType === 'long text') {
              await this.answerService.create({
                ...answerPayload,
                textAnswer: String(q.answer),
              });
            } else {
              throw new Error(`Unrecognized answer type: ${answerType} for question: ${q.question}`);
            }
          }
        }
      }
      
      // Create conversation for this report
      await this.conversationService.create({
        reportId: created.id,
      });
      
      createdReports.push(created);
    }
    return createdReports;
  }

  @Get()
  @ApiOkResponse({
    type: InfinityPaginationResponse(Report),
  })
  async findAll(
    @Query() query: FindAllReportDto,
    @Request() request: any,
  ): Promise<InfinityPaginationResponseDto<Report>> {
    const page = query?.page ?? 1;
    let limit = query?.limit ?? 10;
    if (limit > 50) {
      limit = 50;
    }

    const userId = request.user?.id;
    const { data } = await this.reportService.findAllWithPagination({
      paginationOptions: {
        page,
        limit,
      },
    });

    // Add favorite status to reports using the service method
    const reportsWithFavorites = await this.reportService.addFavoriteStatusToReports(data, userId, request);

    return infinityPagination(reportsWithFavorites, { page, limit });
  }

  @Get('project/:projectId')
  async getReportsByProject(
    @Param('projectId') projectId: number,
    @Request() request: any,
  ) {
    
    const userId = request.user?.id;
    const userType = request.user?.userType || request.user?.type?.name;
    // Security check: If user is a client, verify they are assigned to this project
    if (userType === 'client') {
      
      const client = await this.clientService.findByUserId(userId);
      
      if (!client) {
        throw new ForbiddenException('Client not found');
      }
      
      // Check if client is assigned to this project
      const projectAssignments = await this.projectAssignedClientService.findByProjectId(projectId);
      
      const isAssigned = projectAssignments.some(assignment => {
        return assignment.client.id === client.id;
      });
      
      if (!isAssigned) {
        throw new ForbiddenException('You do not have permission to access this project');
      }
    }

    // Determine user type and get appropriate reports
    return this.reportService.findByProjectIdForUserType(projectId, userId, request);
  }

  /**
   * Get appropriate error message for status filter
   */
  private getStatusFilterMessage(status: string): string {
    switch (status?.toLowerCase()) {
      case 'new':
        return 'Keine neuen Berichte in diesem Projekt vorhanden.';
      case 'completed':
        return 'Keine abgeschlossenen Berichte in diesem Projekt vorhanden.';
      case 'ongoing':
        return 'Keine laufenden Berichte in diesem Projekt vorhanden.';
      default:
        return 'Keine Daten in diesem Projekt vorhanden.';
    }
  }

  @Get('project/:projectId/export-excel')
  @ApiOkResponse({
    description: 'Export project reports as Excel file',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async exportProjectReportsAsExcel(
    @Param('projectId') projectId: number,
    @Query('status') status: string,
    @Request() request: any,
    @Res({ passthrough: false }) res: Response,
  ) {
    const userId = request.user?.id;
    
    try {
      // Get all reports for the project with all relations including files
      const reports = await this.reportService.findByProjectIdForUserType(projectId, userId, request);
      
      // Filter reports by status if specified
      let filteredReports = reports;
      if (status) {
        switch (status.toLowerCase()) {
          case 'new':
            // Filter for new reports - NEW or ASSIGNED status
            filteredReports = reports.filter(report => 
              report.status?.id === ReportStatusEnum.NEW || report.status?.id === ReportStatusEnum.ASSIGNED
            );
            break;
            
          case 'completed':
            // Filter for completed reports - VALID status
            filteredReports = reports.filter(report => report.status?.id === ReportStatusEnum.VALID);
            break;
            
          case 'ongoing':
            // Filter for ongoing reports - all other statuses
            filteredReports = reports.filter(report => 
              [ReportStatusEnum.DRAFT, ReportStatusEnum.IN_PROGRESS, ReportStatusEnum.DUE, 
               ReportStatusEnum.FINISHED, ReportStatusEnum.OPENED_BY_CLIENT, ReportStatusEnum.ACCEPTED]
              .includes(report.status?.id)
            );
            break;
            
          default:
            // For any other status, do exact match by name
            filteredReports = reports.filter(report => 
              report.status?.name?.toLowerCase() === status.toLowerCase()
            );
            break;
        }
      }
      
      // Check if there are any reports to export after filtering
      if (filteredReports.length === 0) {
        return res.status(404).json({
          error: 'NO_DATA_FOUND',
          message: this.getStatusFilterMessage(status)
        });
      }

      // Generate Excel file
      const excelBuffer = await this.reportService.generateExcelExport(filteredReports);
      
      // Set response headers for file download
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="project_${projectId}_reports_export.xlsx"`,
        'Content-Length': excelBuffer.length.toString(),
      });
      
      // Send the buffer directly without serialization
      res.end(excelBuffer);
    } catch (error) {
      console.error('❌ Error exporting Excel:', error);
      
      // Check if it's a "no data" error
      if (error.message && error.message.includes('Keine Daten in diesem Projekt')) {
        res.status(404).json({ 
          message: 'Keine Daten in diesem Projekt vorhanden.',
          error: 'NO_DATA_FOUND',
          projectId: projectId
        });
      } else {
        // Generic error for other issues
        res.status(500).json({ 
          message: 'Fehler beim Generieren des Excel-Exports',
          error: 'EXPORT_ERROR'
        });
      }
    }
  }

  @Get(':id/export-excel')
  @ApiOkResponse({
    description: 'Export single report as Excel file',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async exportSingleReportAsExcel(
    @Param('id') reportId: number,
    @Request() request: any,
    @Res({ passthrough: false }) res: Response,
  ) {
    const userId = request.user?.id;
    
    try {
      // Get the single report with all relations
      const report = await this.reportService.findById(reportId, userId);
      
      if (!report) {
        return res.status(404).json({
          error: 'REPORT_NOT_FOUND',
          message: 'Bericht nicht gefunden.'
        });
      }
      
      // Generate Excel file for single report (pass as array)
      const excelBuffer = await this.reportService.generateExcelExport([report]);
      
      // Set response headers for file download
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="report_${reportId}_export.xlsx"`,
        'Content-Length': excelBuffer.length.toString(),
      });
      
      // Send the buffer directly without serialization
      res.end(excelBuffer);
    } catch (error) {
      console.error('❌ Error exporting single report Excel:', error);
      
      res.status(500).json({ 
        message: 'Fehler beim Generieren des Excel-Exports',
        error: 'EXPORT_ERROR'
      });
    }
  }

  @Get('branch/:branchId')
  async getReportsByBranch(
    @Param('branchId') branchId: number,
    @Request() request: any,
  ) {
    const userId = request.user?.id;
    return this.reportService.findByBranchId(branchId, userId, request);
  }

  @Get(':id')
  @ApiParam({
    name: 'id',
    type: Number,
    required: true,
  })
  @ApiOkResponse({
    type: Report,
  })
  async findById(
    @Param('id') id: number,
    @Request() request: any,
  ) {
    const userId = request.user?.id;
    // userType can be either request.user.userType (string) or request.user.type.name (from entity)
    const userType = request.user?.userType || request.user?.type?.name;

    // Fetch the report first
    const report = await this.reportService.findById(id, userId, request);
    
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Security check: If user is a merchandiser, ensure they are assigned to this report
    if (userType === 'merchandiser') {
      
      // Get the merchandiser's ID from the user
      const merchandiser = await this.merchandiserService.findByUserIdNumber(Number(userId));
      
      if (!merchandiser) {
        throw new ForbiddenException('Merchandiser not found');
      }

      // Check if the report is assigned to this merchandiser
      if (!report.merchandiser || report.merchandiser.id !== merchandiser.id) {
        throw new ForbiddenException('You do not have permission to access this report');
      }
      
    } else if (userType === 'client') {
      // Security check: If user is a client, ensure they are assigned to this report's project
      
      const client = await this.clientService.findByUserId(userId);
      
      if (!client) {
        throw new ForbiddenException('Client not found');
      }
      
      
      // Check if client is assigned to this report's project
      const projectId = report.project?.id;
      if (!projectId) {
        throw new ForbiddenException('Invalid report data');
      }
      
      const projectAssignments = await this.projectAssignedClientService.findByProjectId(projectId);
      
      const isAssigned = projectAssignments.some(assignment => assignment.client.id === client.id);
      
      if (!isAssigned) {
        throw new ForbiddenException('You do not have permission to access this report');
      }
      
    }

    return report;
  }

  @Patch(':id')
  @ApiParam({
    name: 'id',
    type: Number,
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'JSON string containing edit data',
        },
        filesToDelete: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'IDs of uploaded advanced photos to delete',
        },
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Files to upload',
        },
        fileLabels: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Labels for the files',
        },
        advancedPhotoIds: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Advanced photo IDs to link files to',
        },
        beforeAfterTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['before', 'after'],
          },
          description: 'Before/after types for the files',
        },
        fileOrders: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Display order for each uploaded file',
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10))
  async editReport(
    @Param('id') id: number,
    @Body('data') data: string,
    @Request() request: any,
    @Body('filesToDelete') filesToDeleteRaw?: string[] | string,
    @UploadedFiles() files?: Express.Multer.File[],
    @Body('fileLabels') fileLabels?: string[],
    @Body('advancedPhotoIds') advancedPhotoIds?: string[],
    @Body('beforeAfterTypes') beforeAfterTypesRaw?: string[] | string,
    @Body('fileOrders') fileOrdersRaw?: string[] | string,
  ) {

      try {
        // Parse the data JSON string
        const editData: EditReportDto = JSON.parse(data);
        
        // Handle file deletion first
        let filesToDelete: number[] = [];
        if (filesToDeleteRaw) {
          if (Array.isArray(filesToDeleteRaw)) {
            filesToDelete = filesToDeleteRaw.map(id => parseInt(id)).filter(id => !isNaN(id));
          } else if (typeof filesToDeleteRaw === 'string') {
            try {
              const parsed = JSON.parse(filesToDeleteRaw);
              if (Array.isArray(parsed)) {
                filesToDelete = parsed.map(id => parseInt(id)).filter(id => !isNaN(id));
              } else {
                const id = parseInt(filesToDeleteRaw);
                if (!isNaN(id)) filesToDelete = [id];
              }
            } catch {
              const id = parseInt(filesToDeleteRaw);
              if (!isNaN(id)) filesToDelete = [id];
            }
          }
        }
        
        // Also check if filesToDelete is in the JSON data
        if (editData.filesToDelete && Array.isArray(editData.filesToDelete)) {
          filesToDelete = [...filesToDelete, ...editData.filesToDelete];
        }
        
        
        // Delete the specified uploaded advanced photos
        if (filesToDelete.length > 0) {
          for (const uploadedPhotoId of filesToDelete) {
            try {
              // Get the uploaded advanced photo first to access the file
              const uploadedPhoto = await this.uploadedAdvancedPhotosService.findById(uploadedPhotoId);
              if (uploadedPhoto) {
                // Delete the uploaded advanced photo record
                await this.uploadedAdvancedPhotosService.remove(uploadedPhotoId);
                
                // Optionally, you could also delete the file from the filesystem here
                // if (uploadedPhoto.file && uploadedPhoto.file.path) {
                //   await this.filesLocalService.remove(uploadedPhoto.file.id);
                // }
              }
            } catch (deleteError) {
              console.error(`Error deleting uploaded advanced photo ${uploadedPhotoId}:`, deleteError);
              // Continue with other deletions even if one fails
            }
          }
        }
      
      // Get the existing report (optimized version for updates)
      const existingReport = await this.reportService.findByIdForUpdate(id);
      if (!existingReport) {
        throw new Error('Report not found');
      }

      // Security check: If user is a merchandiser, ensure they are assigned to this report
      const editUserId = request.user?.id;
      // userType can be either request.user.userType (string) or request.user.type.name (from entity)
      const editUserType = request.user?.userType || request.user?.type?.name;
      
      if (editUserType === 'merchandiser') {
        const merchandiser = await this.merchandiserService.findByUserIdNumber(Number(editUserId));
        
        if (!merchandiser) {
          throw new ForbiddenException('Merchandiser not found');
        }

        // Check if the report is assigned to this merchandiser
        if (!existingReport.merchandiser || existingReport.merchandiser.id !== merchandiser.id) {
          throw new ForbiddenException('You do not have permission to edit this report');
        }
      }

      // Update report basic info
      const updateData: any = {};
      if (editData.appointmentDate) {
        updateData.plannedOn = editData.appointmentDate;
      }
      if (editData.visitDate) {
        updateData.visitDate = editData.visitDate;
      }
      if (editData.reportTo) {
        updateData.reportTo = editData.reportTo;
      }
      if (editData.status) {
        updateData.status = { id: editData.status.id };
      }
      if (editData.merchandiserId) {
        updateData.merchandiser = { id: editData.merchandiserId };
      }

      // Auto-update status to DRAFT if conditions are met
      // Check if report has merchandiser, reportTo, plannedOn, visitDate and current status is ACCEPTED
      const hasReportTo = updateData.reportTo || existingReport.reportTo;
      const hasPlannedOn = updateData.plannedOn || existingReport.plannedOn;
      const hasVisitDate = updateData.visitDate || existingReport.visitDate;
      const hasMerchandiser = updateData.merchandiser || existingReport.merchandiser;
      const currentStatusId = existingReport.status?.id;

      // Auto-update status when merchandiser is assigned
      if (editData.merchandiserId && currentStatusId === ReportStatusEnum.NEW) {
        // Merchandiser assigned to NEW report
        if (hasPlannedOn) {
          // Has merchandiser and planned date = ACCEPTED
          updateData.status = { id: ReportStatusEnum.ACCEPTED };
        } else {
          // Has merchandiser but no planned date = ASSIGNED
          updateData.status = { id: ReportStatusEnum.ASSIGNED };
        }
      } else if (currentStatusId === ReportStatusEnum.ACCEPTED && hasMerchandiser && hasReportTo && hasPlannedOn && hasVisitDate) {
        updateData.status = { id: ReportStatusEnum.DRAFT };
      }

      // Update the report
      await this.reportService.update(id, updateData);
      // Handle answers - optimized with parallel processing
      if (editData.answers && Array.isArray(editData.answers)) {
        
        // First, delete existing answers for this report
        await this.answerService.deleteByReportId(id);
        
        // Create new answers using optimized bulk method
        await this.answerService.createBulk(editData.answers, id);
      }

      // Handle file uploads - simplified approach
      if (files && files.length > 0) {
        
        // Normalize all form data fields to arrays
        let beforeAfterTypes: (string | null)[] = [];
        let normalizedFileLabels: (string | null)[] = [];
        let normalizedAdvancedPhotoIds: (string | null)[] = [];
        
        if (Array.isArray(beforeAfterTypesRaw)) {
          beforeAfterTypes = beforeAfterTypesRaw;
        } else if (typeof beforeAfterTypesRaw === 'string') {
          beforeAfterTypes = [beforeAfterTypesRaw];
        }
        
        if (Array.isArray(fileLabels)) {
          normalizedFileLabels = fileLabels;
        } else if (typeof fileLabels === 'string') {
          normalizedFileLabels = [fileLabels];
        }
        
        if (Array.isArray(advancedPhotoIds)) {
          normalizedAdvancedPhotoIds = advancedPhotoIds;
        } else if (typeof advancedPhotoIds === 'string') {
          normalizedAdvancedPhotoIds = [advancedPhotoIds];
        }

        // Process files in parallel for better performance
        let normalizedFileOrders: (number | undefined)[] = [];
        if (Array.isArray(fileOrdersRaw)) {
          normalizedFileOrders = fileOrdersRaw.map((value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : undefined;
          });
        } else if (typeof fileOrdersRaw === 'string') {
          try {
            const parsedOrders = JSON.parse(fileOrdersRaw);
            if (Array.isArray(parsedOrders)) {
              normalizedFileOrders = parsedOrders.map((value) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : undefined;
              });
            } else {
              const parsedSingle = Number(fileOrdersRaw);
              if (Number.isFinite(parsedSingle)) {
                normalizedFileOrders = [parsedSingle];
              }
            }
          } catch {
            const parsedSingle = Number(fileOrdersRaw);
            if (Number.isFinite(parsedSingle)) {
              normalizedFileOrders = [parsedSingle];
            }
          }
        }

        const filePromises = files.map(async (file, i) => {
          
          // Check if file.path exists
          if (!file.path) {
            console.error('ERROR: file.path is undefined! This means multer did not save the file to disk.');
            console.error('This usually means the multer configuration is not being applied correctly.');
            throw new Error('File upload failed: file.path is undefined. Multer configuration issue.');
          }
          
          const label = normalizedFileLabels[i] || null;
          const advancedPhotoId = normalizedAdvancedPhotoIds[i] ? parseInt(normalizedAdvancedPhotoIds[i]!) : null;
          const beforeAfterTypeRaw = beforeAfterTypes[i] || null;
          const beforeAfterType = beforeAfterTypeRaw === 'before' || beforeAfterTypeRaw === 'after'
            ? beforeAfterTypeRaw as 'before' | 'after'
            : null;
          const orderValueRaw = normalizedFileOrders[i];
          const orderValue =
            typeof orderValueRaw === 'number' && Number.isFinite(orderValueRaw)
              ? orderValueRaw
              : i;
          
          try {
            // Upload the file first using FilesLocalService
            const { file: uploadedFile } = await this.filesLocalService.create(file);
            
            if (advancedPhotoId) {
              // Verify the advanced photo exists before creating the uploaded_advanced_photo record
              const advancedPhoto = await this.advancedPhotoService.findById(advancedPhotoId);
              if (!advancedPhoto) {
                console.error(`Advanced Photo with ID ${advancedPhotoId} not found`);
                return; // Skip this file and continue with others
              }
              
              // Create uploaded_advanced_photo record linking the file to the existing advanced photo and report
              await this.uploadedAdvancedPhotosService.createOptimized({
                advancedPhoto: { id: advancedPhotoId },
                file: { id: uploadedFile.id, path: uploadedFile.path },
                report: { id: id },
                label: label,
                beforeAfterType: beforeAfterType,
                order: orderValue,
              }, existingReport);
            } else if (label) {
              // If no advanced photo ID but has label, create a new advanced photo first
              const newAdvancedPhoto = await this.advancedPhotoService.create({
                project: { id: existingReport.project.id },
                labels: [label],
                isVisibleInReport: true,
                isBeforeAfter: false,
              });
              
              // Then create uploaded_advanced_photo record
              await this.uploadedAdvancedPhotosService.createOptimized({
                advancedPhoto: { id: newAdvancedPhoto.id },
                file: { id: uploadedFile.id, path: uploadedFile.path },
                report: { id: id },
                label: label,
                beforeAfterType: beforeAfterType,
                order: orderValue,
              }, existingReport);
            }
          } catch (fileError) {
            console.error('Error processing file:', fileError);
            // Continue with other files even if one fails
          }
        });

        // Wait for all files to be processed in parallel
        await Promise.all(filePromises);
      }

      const photoOrderUpdatesPayload = Array.isArray(editData.photoOrderUpdates)
        ? editData.photoOrderUpdates
        : [];

      if (photoOrderUpdatesPayload.length > 0) {
        for (const update of photoOrderUpdatesPayload) {
          try {
            // Build update payload with explicit label handling
            const updatePayload: any = {
              beforeAfterType: update.beforeAfterType,
              order: update.order,
            };
            
            // Explicitly include label if provided (including empty string or null)
            if (update.label !== undefined) {
              updatePayload.label = update.label;
            }
            
            console.log(`Updating uploaded photo ${update.uploadedPhotoId} with:`, updatePayload);
            
            await this.uploadedAdvancedPhotosService.update(update.uploadedPhotoId, updatePayload);
          } catch (updateError) {
            console.error(`Error updating uploaded photo ${update.uploadedPhotoId}:`, updateError);
          }
        }
      }

      
      // Fetch the updated report to return fresh data
      const userId = request.user?.id;
      const freshReport = await this.reportService.findById(id, userId, request);
      
      if (!freshReport) {
        throw new Error('Failed to retrieve updated report');
      }
      
      return freshReport;
    } catch (error) {
      console.error('=== EDIT REPORT ERROR ===');
      console.error('Error occurred:', error);
      throw error;
    }
  }

  @Delete(':id')
  @ApiParam({
    name: 'id',
    type: Number,
    required: true,
  })
  remove(@Param('id') id: number) {
    return this.reportService.remove(id);
  }

  @Patch(':id/close')
  @ApiParam({
    name: 'id',
    type: Number,
    required: true,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Status to set (will be mapped based on user type)',
        },
      },
      required: ['status'],
    },
  })
  async closeReport(
    @Param('id') id: number,
    @Request() request: any,
  ): Promise<Report> {
    const userId = request.user?.id;
    const userType = request.user?.userType;

    // First, check if the report is already closed
    const existingReport = await this.reportService.findById(id);
    if (!existingReport) {
      throw new Error('Report not found');
    }

    // Security check: If user is a merchandiser, ensure they are assigned to this report
    if (userType === 'merchandiser') {
      const merchandiser = await this.merchandiserService.findByUserIdNumber(Number(userId));
      
      if (!merchandiser) {
        throw new ForbiddenException('Merchandiser not found');
      }

      // Check if the report is assigned to this merchandiser
      if (!existingReport.merchandiser || existingReport.merchandiser.id !== merchandiser.id) {
        throw new ForbiddenException('You do not have permission to close this report');
      }
    }

    // Check if report is already in a closed state based on user type
    let closedStatusIds: number[] = [];
    
    switch (userType) {
      case 'merchandiser':
        // Merchandiser considers FINISHED, OPENED_BY_CLIENT, or VALID as closed
        closedStatusIds = [
          ReportStatusEnum.FINISHED,        // 7 - Akzente closed
          ReportStatusEnum.OPENED_BY_CLIENT, // 8 - Merchandiser closed  
          ReportStatusEnum.VALID            // 9 - Client closed
        ];
        break;
      case 'akzente':
        // Akzente considers OPENED_BY_CLIENT or VALID as closed
        closedStatusIds = [
          ReportStatusEnum.OPENED_BY_CLIENT, // 8 - Merchandiser closed  
          ReportStatusEnum.VALID            // 9 - Client closed
        ];
        break;
      case 'client':
        // Client only considers VALID as closed
        closedStatusIds = [
          ReportStatusEnum.VALID            // 9 - Client closed
        ];
        break;
      default:
        throw new Error(`Unknown user type: ${userType}`);
    }

    if (existingReport.status && closedStatusIds.includes(existingReport.status.id)) {
      throw new Error('Report is already closed and cannot be modified');
    }

    // Sequential approval logic: Each user type can only move to the next stage
    let newStatusId: number;
    const currentStatusId = existingReport.status?.id;

    switch (userType) {
      case 'merchandiser':
          newStatusId = ReportStatusEnum.FINISHED; // 7 - Move to Akzente review
        break;
      case 'akzente':
          newStatusId = ReportStatusEnum.OPENED_BY_CLIENT; // 8 - Move to Client review
        break;
      case 'client':
        // Client can only close if status is ACCEPTED_BY_CLIENT (8)
        if (currentStatusId === ReportStatusEnum.OPENED_BY_CLIENT) {
          newStatusId = ReportStatusEnum.VALID; // 9 - Final approval
        } else {
          throw new Error('Client can only close reports that are validadet by akzente');
        }
        break;
      default:
        throw new Error(`Unknown user type: ${userType}`);
    }

    // Update the report with the new status
    const updateDto: UpdateReportDto = {
      status: { id: newStatusId }
    };

    const updatedReport = await this.reportService.update(id, updateDto);
    if (!updatedReport) {
      throw new Error('Failed to update report status');
    }

    // Return the report in the same format as the individual report endpoint
    const reportWithDetails = await this.reportService.findById(id, userId, request);
    if (!reportWithDetails) {
      throw new Error('Failed to retrieve updated report details');
    }
    return reportWithDetails;
  }

  @Post(':id/accept-reject')
  @ApiParam({
    name: 'id',
    type: Number,
    required: true,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        accept: {
          type: 'boolean',
          description: 'True to accept the report, false to reject it',
        },
      },
      required: ['accept'],
    },
  })
  async acceptRejectReport(
    @Param('id') id: number,
    @Body('accept') accept: boolean,
    @Request() request: any,
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Verify user is a merchandiser
    const merchandiser = await this.merchandiserService.findByUserIdNumber(userId);
    if (!merchandiser) {
      throw new Error('Only merchandisers can accept/reject reports');
    }

    // Get the report
    const report = await this.reportService.findById(id);
    if (!report) {
      throw new Error('Report not found');
    }

    // Verify this report is assigned to this merchandiser
    if (!report.merchandiser || report.merchandiser.id !== merchandiser.id) {
      throw new Error('This report is not assigned to you');
    }

    // Accept or reject the report
    const updatedReport = await this.reportService.acceptRejectReport(id, accept, merchandiser.id);
    return updatedReport;
  }

  @Post(':id/send-message')
  @ApiParam({
    name: 'id',
    type: Number,
    required: true,
  })
  @ApiCreatedResponse({
    description: 'Message sent successfully',
  })
  async sendMessage(
    @Param('id') reportId: number,
    @Body() sendMessageDto: SendMessageDto,
    @Request() request: any,
  ) {
    console.log(`[SEND MESSAGE] Starting sendMessage for reportId: ${reportId}`);
    const totalStartTime = Date.now();

    try {
      // Get the current user (sender)
      const senderStartTime = Date.now();
      const sender = request.user;
      if (!sender || !sender.id) {
        throw new Error('User not authenticated');
      }
      console.log(`[SEND MESSAGE] Got sender (${Date.now() - senderStartTime}ms)`);

      // Get the report with minimal relations for performance (only what we need initially)
      const reportStartTime = Date.now();
      const report = await this.reportService.findByIdForUpdate(reportId);
      console.log(`[SEND MESSAGE] Loaded report (${Date.now() - reportStartTime}ms)`);
      if (!report) {
        throw new Error('Report not found');
      }

      // Fetch conversation ID separately (we already have it from findByIdForUpdate)
      if (!report.conversation || !report.conversation.id) {
        throw new Error('Report has no conversation');
      }
      const conversationId = report.conversation.id;

      if (!report.merchandiser) {
        throw new Error('Report has no assigned merchandiser');
      }

      // Security check: If user is a merchandiser, ensure they are assigned to this report
      // userType can be either sender.userType (string) or sender.type.name (from entity)
      const securityCheckStartTime = Date.now();
      const userType = sender.userType || sender.type?.name;
      if (userType === 'merchandiser') {
        const merchandiser = await this.merchandiserService.findByUserIdNumber(Number(sender.id));
        
        if (!merchandiser) {
          throw new ForbiddenException('Merchandiser not found');
        }

        // Check if the report is assigned to this merchandiser
        if (report.merchandiser.id !== merchandiser.id) {
          throw new ForbiddenException('You do not have permission to send messages for this report');
        }
      }
      console.log(`[SEND MESSAGE] Security check completed (${Date.now() - securityCheckStartTime}ms)`);

      // Determine sender and receiver types
      const receiverResolveStartTime = Date.now();
      const senderType = sender.type?.name || sender.userType || 'akzente'; // Default to akzente for now
      const receiverType = sendMessageDto.receiverType;

      // Determine receiver based on receiver type
      let receiverId: number;
      let receiverName: string;
      switch (receiverType) {
        case 'merchandiser':
          if (!report.merchandiser) {
            throw new Error('Report has no assigned merchandiser');
          }
          // Defensive: check if merchandiser has a user property
          const merchUser = (report.merchandiser as any).user;
          if (!merchUser || !merchUser.id) {
            throw new Error('Merchandiser has no associated user or user id');
          }
          receiverId = Number(merchUser.id);
          receiverName = `${merchUser.firstName ?? ''} ${merchUser.lastName ?? ''}`.trim();
          break;
        case 'client':
          if (!report.clientCompany) {
            throw new Error('Report has no associated client company');
          }
          
          // Find client assignments for this client company
          const clientAssignStartTime = Date.now();
          const clientAssignments = await this.clientCompanyAssignedClientService.findByClientCompanyId(report.clientCompany.id);
          console.log(`[SEND MESSAGE] Found client assignments (${Date.now() - clientAssignStartTime}ms)`);
          
          if (clientAssignments.length === 0) {
            throw new Error('No client assignments found for this client company');
          }
          
          // Get the first client assignment (you might want to implement more sophisticated logic)
          const clientAssignment = clientAssignments[0];
          
          if (!clientAssignment.client) {
            throw new Error('Client assignment has no associated client');
          }
          
          receiverId = Number(clientAssignment.client.user.id);
          receiverName = `${clientAssignment.client.user.firstName} ${clientAssignment.client.user.lastName}`;
          break;
        
        case 'akzente':
          // Find akzente users
          const akzenteUsersStartTime = Date.now();
          const akzenteUsers = await this.usersService.findAkzenteUsers({
            filterOptions: null,
            paginationOptions: { page: 1, limit: 10 },
            sortOptions: null
          });
          console.log(`[SEND MESSAGE] Found akzente users (${Date.now() - akzenteUsersStartTime}ms)`);
          
          if (akzenteUsers.data.length === 0) {
            throw new Error('No akzente users found');
          }
          
          // Pick the first actual akzente user
          const akzenteUser = akzenteUsers.data.find((u: any) => u?.type?.name?.toLowerCase() === 'akzente') || akzenteUsers.data[0];
          receiverId = Number(akzenteUser.id);
          receiverName = `${akzenteUser.firstName ?? ''} ${akzenteUser.lastName ?? ''}`.trim();
          break;
        
        default:
          throw new Error(`Invalid receiver type: ${receiverType}`);
      }
      console.log(`[SEND MESSAGE] Receiver resolved: ${receiverName} (${Date.now() - receiverResolveStartTime}ms)`);
      
      const messageCreateStartTime = Date.now();
      const message = await this.messageService.create({
        conversationId: conversationId,
        senderId: sender.id,
        receiverId: receiverId,
        content: sendMessageDto.content,
        receiverType: receiverType,
      });
      console.log(`[SEND MESSAGE] Message created (${Date.now() - messageCreateStartTime}ms)`);

      
      // Create notifications for all relevant users
      const notificationStartTime = Date.now();
      try {
        const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Ein Benutzer';
        const projectName = report.project?.name || 'Unbekanntes Projekt';
        
        // Collect all user IDs who should receive notifications with their user type
        const notificationReceivers = new Map<number, string>(); // userId -> userType
        
        // Add the direct message receiver (to ensure they get it)
        notificationReceivers.set(receiverId, receiverType);
        
        // If sender is not client, notify ALL clients assigned to this client company
        if (senderType !== 'client' && report.clientCompany) {
          const clientNotifyStartTime = Date.now();
          const clientAssignments = await this.clientCompanyAssignedClientService.findByClientCompanyId(report.clientCompany.id);
          console.log(`[SEND MESSAGE] Found client assignments for notifications (${Date.now() - clientNotifyStartTime}ms)`);
          for (const assignment of clientAssignments) {
            if (assignment.client?.user?.id) {
              const clientUserId = Number(assignment.client.user.id);
              // Don't send notification to the sender themselves
              if (clientUserId !== sender.id) {
                notificationReceivers.set(clientUserId, 'client');
              }
            }
          }
        }
        
        // If sender is client, notify ALL Akzente admins
        if (senderType === 'client') {
          const akzenteNotifyStartTime = Date.now();
          const akzenteUsers = await this.usersService.findAkzenteUsers({
            filterOptions: null,
            paginationOptions: { page: 1, limit: 100 }, // Get all akzente users
            sortOptions: null
          });
          console.log(`[SEND MESSAGE] Found akzente users for notifications (${Date.now() - akzenteNotifyStartTime}ms)`);
          
          for (const akzenteUser of akzenteUsers.data) {
            if (akzenteUser?.id) {
              const akzenteUserId = Number(akzenteUser.id);
              // Don't send notification to the sender themselves
              if (akzenteUserId !== sender.id) {
                notificationReceivers.set(akzenteUserId, 'akzente');
              }
            }
          }
        }
        console.log(`[SEND MESSAGE] Notification receivers collected: ${notificationReceivers.size} users`);
        
        // Create notifications for all receivers with appropriate links
        const notificationCreateStartTime = Date.now();
        const notificationPromises = Array.from(notificationReceivers.entries()).map(async ([userId, userType], index) => {
          const singleNotifyStartTime = Date.now();
          try {
            // Generate link based on recipient type with openDialog query parameter
            let link: string;
            if (userType === 'client') {
              // Client link format: /projects/{projectId}/reports/{reportId}?openDialog=true
              link = `/projects/${report.project?.id}/reports/${reportId}?openDialog=true`;
            } else {
              // Admin/Akzente link format: /clients/{clientCompanyId}/projects/{projectId}/reports/{reportId}?openDialog=true
              link = `/clients/${report.clientCompany?.id}/projects/${report.project?.id}/reports/${reportId}?openDialog=true`;
            }
            
            await this.notificationsService.createMessageNotification({
              receiverId: userId,
              senderName: senderName,
              projectName: projectName,
              reportId: reportId,
              conversationId: conversationId,
              link: link,
            });
            console.log(`[SEND MESSAGE] Notification ${index + 1}/${notificationReceivers.size} created for user ${userId} (${Date.now() - singleNotifyStartTime}ms)`);
          } catch (error) {
            console.error(`[SEND MESSAGE] Failed to create notification ${index + 1}/${notificationReceivers.size} for user ${userId} (${Date.now() - singleNotifyStartTime}ms):`, error);
          }
        });
        
        await Promise.all(notificationPromises);
        console.log(`[SEND MESSAGE] All notifications created (${Date.now() - notificationCreateStartTime}ms)`);
        
      } catch (notificationError) {
        console.error(`[SEND MESSAGE] Notification creation error (${Date.now() - notificationStartTime}ms):`, notificationError);
        // Don't throw here - message was sent successfully, notification is optional
      }
      console.log(`[SEND MESSAGE] Notification phase completed (${Date.now() - notificationStartTime}ms)`);
      
      // Load all messages for the conversation with relations (filtered by user role) instead of the entire report
      // This is much faster than loading the full report with all its relations
      const returnStartTime = Date.now();
      // Use sender.id as fallback since it's guaranteed to exist (we check it earlier)
      const userId = request.user?.id || sender.id;
      
      if (!userId) {
        console.error('[SEND MESSAGE] Missing user ID - request.user:', request.user, 'sender:', sender);
        throw new Error('User ID is required for message filtering');
      }
      
      // Ensure userType is set (use sender's type or userType as fallback)
      const finalUserType = userType || sender.type?.name || sender.userType || 'akzente';
      console.log(`[SEND MESSAGE] Using userId: ${userId}, userType: ${finalUserType}`);
      
      // Use message service to load messages with relations
      // We need messages with sender/receiver relations for proper filtering
      const messageRepository = this.messageService['messageRepository'] as any;
      const messageEntityRepo = messageRepository.messageRepository;
      
      // Load messages with all relations needed for filtering and display
      const messageEntities = await messageEntityRepo
        .createQueryBuilder('messages')
        .leftJoinAndSelect('messages.sender', 'sender')
        .leftJoinAndSelect('sender.photo', 'sender_photo')
        .leftJoinAndSelect('sender.type', 'sender_type')
        .leftJoinAndSelect('messages.receiver', 'receiver')
        .leftJoinAndSelect('receiver.photo', 'receiver_photo')
        .leftJoinAndSelect('receiver.type', 'receiver_type')
        .where('messages.conversation = :cid', { cid: conversationId })
        .orderBy('messages.createdAt', 'ASC')
        .getMany();
      
      // Map to domain entities
      const allMessages = messageEntities.map((entity: any) => MessageMapper.toDomain(entity));
      console.log(`[SEND MESSAGE] Loaded all messages with relations (${allMessages.length} messages) (${Date.now() - returnStartTime}ms)`);
      
      // Filter messages based on user role (similar to findByIdWithFilteredConversation logic)
      const filterStartTime = Date.now();
      let filteredMessages = allMessages;
      const numericUserId = Number(userId);
      
      if (finalUserType === 'client' && report.clientCompany) {
        // Filter for client messages
        const clientAssignments = await this.clientCompanyAssignedClientService.findByClientCompanyId(report.clientCompany.id);
        const clientUserIds = clientAssignments
          .map(a => a.client?.user?.id)
          .filter(id => id !== null && id !== undefined)
          .map(id => Number(id));
        
        if (!clientUserIds.includes(numericUserId)) {
          clientUserIds.push(numericUserId);
        }
        
        filteredMessages = allMessages.filter(msg => {
          const msgSenderType = (msg.senderType as any)?.name || '';
          const msgReceiverType = (msg.receiverType as any)?.name || '';
          const isAkzenteToClient = msgSenderType.toLowerCase() === 'akzente' && clientUserIds.includes(Number(msg.receiverId));
          const isClientToAkzente = clientUserIds.includes(Number(msg.senderId)) && (msgReceiverType.toLowerCase() === 'akzente' || (msg as any).receiverTypeString === 'akzente');
          return isAkzenteToClient || isClientToAkzente;
        });
      } else if (finalUserType === 'merchandiser') {
        filteredMessages = allMessages.filter(msg => {
          const msgSenderType = (msg.senderType as any)?.name || '';
          const msgReceiverType = (msg.receiverType as any)?.name || '';
          const isAkzenteToMerch = msgSenderType.toLowerCase() === 'akzente' && Number(msg.receiverId) === numericUserId;
          const isMerchToAkzente = Number(msg.senderId) === numericUserId && (msgReceiverType.toLowerCase() === 'akzente' || (msg as any).receiverTypeString === 'akzente');
          return isAkzenteToMerch || isMerchToAkzente;
        });
      }
      // For akzente users, return all messages (no filtering)
      
      // Messages are already sorted by createdAt from the query
      console.log(`[SEND MESSAGE] Filtered messages (${filteredMessages.length} messages) (${Date.now() - filterStartTime}ms)`);
      
      console.log(`[SEND MESSAGE] Total time: ${Date.now() - totalStartTime}ms`);
      return { 
        conversation: { 
          id: conversationId, 
          messages: filteredMessages 
        } 
      };
    } catch (error) {
      console.error('=== SEND MESSAGE ERROR ===');
      console.error('Error occurred:', error);
      throw error;
    }
  }

  @Post(':id/toggle-favorite')
  @ApiParam({ name: 'id', type: Number, required: true })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        isFavorite: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async toggleFavorite(
    @Param('id') reportId: number,
    @Request() request: any,
  ) {
    const userId = request.user?.id;
    if (!userId) throw new Error('User not authenticated');
    const numericReportId = Number(reportId);

    // Check if user is Akzente, Client, or Merchandiser
    const akzenteEntity = await this.akzenteService.findByUserId(userId);
    const clientEntity = await this.clientService.findByUserId(userId);
    const merchandiserEntity = await this.merchandiserService.findByUserIdNumber(userId);

      if (akzenteEntity) {
      // Akzente logic (existing)
      const existing = await this.akzenteFavoriteReportsService.findOne({ 
        akzenteId: akzenteEntity.id, 
        reportId: numericReportId 
      });
      
      if (existing) {
        await this.akzenteFavoriteReportsService.remove(existing.id);
        return { isFavorite: false, message: 'Mission removed from favorites' };
      } else {
          await this.akzenteFavoriteReportsService.create({ 
            // Service expects userId in akzente.id (it calls findByUserId)
            akzente: { id: userId },
          report: { id: numericReportId } 
        });
        return { isFavorite: true, message: 'Mission added to favorites' };
      }
    } else if (clientEntity) {
      // Client logic
      const existing = await this.clientFavoriteReportsService.findOne({ 
        clientId: clientEntity.id, 
        reportId: numericReportId 
      });
      
      if (existing) {
        await this.clientFavoriteReportsService.remove(existing.id);
        return { isFavorite: false, message: 'Mission removed from favorites' };
      } else {
        await this.clientFavoriteReportsService.create({ 
          client: { id: userId }, // Pass userId, not clientEntity.id
          report: { id: numericReportId } 
        });
        return { isFavorite: true, message: 'Mission added to favorites' };
      }
    } else if (merchandiserEntity) {
      // Merchandiser logic
      
      // Security check: Ensure the report is assigned to this merchandiser
      const report = await this.reportService.findById(numericReportId);
      if (!report) {
        throw new NotFoundException('Report not found');
      }
      
      if (!report.merchandiser || report.merchandiser.id !== merchandiserEntity.id) {
        throw new ForbiddenException('You do not have permission to favorite this report');
      }
      
      const existing = await this.merchandiserFavoriteReportsService.findOne({ 
        merchandiserId: merchandiserEntity.id, 
        reportId: numericReportId 
      });
      
      if (existing) {
        await this.merchandiserFavoriteReportsService.remove(existing.id);
        return { isFavorite: false, message: 'Mission removed from favorites' };
      } else {
        await this.merchandiserFavoriteReportsService.create({ 
          merchandiser: { id: merchandiserEntity.id }, // Pass merchandiser ID, not user ID
          report: { id: numericReportId } 
        });
        return { isFavorite: true, message: 'Mission added to favorites' };
      }
    } else {
      throw new Error('User not found as Akzente, Client, or Merchandiser');
    }
  }

  @Post('status-update/trigger')
  @ApiOkResponse({
    description: 'Manually trigger report status update job',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        updatedCount: { type: 'number' },
      },
    },
  })
  async triggerStatusUpdate(): Promise<{ message: string; updatedCount: number }> {
    return this.reportStatusSchedulerService.triggerStatusUpdate();
  }
}
