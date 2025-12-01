import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectRepository } from './infrastructure/persistence/project.repository';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { Project } from './domain/project';
import { ClientCompany } from '../client-company/domain/client-company';
import { ClientCompanyService } from '../client-company/client-company.service';
import { PhotoService } from '../photo/photo.service';
import { AdvancedPhotoService } from '../advanced-photo/advanced-photo.service';
import { QuestionService } from '../question/question.service';
import { QuestionOptionService } from '../question-option/question-option.service';
import { CreatePhotoDto } from '../photo/dto/create-photo.dto';
import { CreateAdvancedPhotoDto } from '../advanced-photo/dto/create-advanced-photo.dto';
import { CreateQuestionDto } from '../question/dto/create-question.dto';
import { CreateQuestionOptionDto } from '../question-option/dto/create-question-option.dto';
import { ReportRepository } from '../report/infrastructure/persistence/report.repository';
import { ProjectAssignedAkzenteService } from '../project-assigned-akzente/project-assigned-akzente.service';
import { ProjectAssignedClientService } from '../project-assigned-client/project-assigned-client.service';
import { ClientService } from '../client/client.service';
import { AkzenteService } from '../akzente/akzente.service';
import { AkzenteFavoriteProjectService } from '../akzente-favorite-projects/akzente-favorite-project.service';
import { ClientFavoriteProjectService } from '../client-favorite-projects/client-favorite-projects.service';
import { MerchandiserService } from '../merchandiser/merchandiser.service';
import { MerchandiserFavoriteProjectService } from '../merchandiser-favorite-projects/merchandiser-favorite-projects.service';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    @Inject(forwardRef(() => ClientCompanyService))
    private readonly clientCompanyService: ClientCompanyService,
    @Inject(forwardRef(() => PhotoService))
    private readonly photoService: PhotoService,
    @Inject(forwardRef(() => AdvancedPhotoService))
    private readonly advancedPhotoService: AdvancedPhotoService,
    @Inject(forwardRef(() => QuestionService))
    private readonly questionService: QuestionService,
    @Inject(forwardRef(() => QuestionOptionService))
    private readonly questionOptionService: QuestionOptionService,
    @Inject(forwardRef(() => ReportRepository))
    private readonly reportRepository: ReportRepository,
    @Inject(forwardRef(() => ProjectAssignedAkzenteService))
    private readonly projectAssignedAkzenteService: ProjectAssignedAkzenteService,
    @Inject(forwardRef(() => ProjectAssignedClientService))
    private readonly projectAssignedClientService: ProjectAssignedClientService,
    @Inject(forwardRef(() => ClientService))
    private readonly clientService: ClientService,
    @Inject(forwardRef(() => AkzenteService))
    private readonly akzenteService: AkzenteService,
    @Inject(forwardRef(() => AkzenteFavoriteProjectService))
    private readonly akzenteFavoriteProjectService: AkzenteFavoriteProjectService,
    @Inject(forwardRef(() => ClientFavoriteProjectService))
    private readonly clientFavoriteProjectService: ClientFavoriteProjectService,
    @Inject(forwardRef(() => MerchandiserService))
    private readonly merchandiserService: MerchandiserService,
    @Inject(forwardRef(() => MerchandiserFavoriteProjectService))
    private readonly merchandiserFavoriteProjectService: MerchandiserFavoriteProjectService,
  ) {}

  async create(createProjectDto: any): Promise<any> {
    const clientCompany = await this.clientCompanyService.findById(
      createProjectDto.clientCompany.id,
    );
    if (!clientCompany) {
      throw new Error('Client company not found');
    }

    // Create the project
    const project = await this.projectRepository.create({
      name: createProjectDto.name,
      startDate: createProjectDto.startDate
        ? new Date(createProjectDto.startDate)
        : null,
      endDate: createProjectDto.endDate
        ? new Date(createProjectDto.endDate)
        : null,
      clientCompany,
    });

    const createdQuestions: any[] = [];

    // Handle photos
    if (Array.isArray(createProjectDto.photos)) {
      for (const photo of createProjectDto.photos) {
        const photoDto: CreatePhotoDto = {
          ...photo,
          project: { id: project.id },
        };
        await this.photoService.create(photoDto);
      }
    }

    // Handle advancedPhotos
    if (Array.isArray(createProjectDto.advancedPhotos)) {
      for (const advPhoto of createProjectDto.advancedPhotos) {
        const advPhotoDto: CreateAdvancedPhotoDto = {
          ...advPhoto,
          project: { id: project.id },
        };
        await this.advancedPhotoService.create(advPhotoDto);
      }
    }

    // Handle questions and options
    if (Array.isArray(createProjectDto.questions)) {
      for (const question of createProjectDto.questions) {
        const { options, ...questionData } = question;
        const questionDto: CreateQuestionDto = {
          ...questionData,
          project: { id: project.id },
        };
        const createdQuestion = await this.questionService.create(questionDto);
        
        // Fetch the question with its answer type
        const questionWithAnswerType = await this.questionService.findById(createdQuestion.id);
        
        const questionWithOptions: any = {
          ...questionWithAnswerType,
          options: [] as any[]
        };

        if (Array.isArray(options)) {
          for (const option of options) {
            const optionDto: CreateQuestionOptionDto = {
              ...option,
              question: { id: createdQuestion.id },
            };
            const createdOption = await this.questionOptionService.create(optionDto);
            questionWithOptions.options.push(createdOption);
          }
        }

        createdQuestions.push(questionWithOptions);
      }
    }

    // Handle clientContactIds and salesContactIds
    if (Array.isArray(createProjectDto.clientContactIds)) {
      for (const userId of createProjectDto.clientContactIds) {
        // Find the client record for this user ID
        const clientList = await this.clientService.findAllWithPagination({
          paginationOptions: { page: 1, limit: 1000 }
        });
        const client = clientList.data.find(c => c.user.id === userId);
        
        if (client) {
          await this.projectAssignedClientService.create({
            project: { id: project.id },
            client: { id: client.id },
          });
        }
        // Note: It's normal for a user to not have a client entity if they're a different user type
      }
    }

    if (Array.isArray(createProjectDto.salesContactIds)) {
      for (const userId of createProjectDto.salesContactIds) {
        // Find the akzente record for this user ID
        const akzenteList = await this.akzenteService.findAllWithPagination({
          paginationOptions: { page: 1, limit: 1000 }
        });
        const akzente = akzenteList.data.find(a => a.user.id === userId);
        
        if (akzente) {
          await this.projectAssignedAkzenteService.create({
            project: { id: project.id },
            akzente: { id: akzente.id },
          });
        }
        // Note: It's normal for a user to not have an akzente entity if they're a different user type
      }
    }

    return {
      project,
      questions: createdQuestions
    };
  }

  findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }) {
    return this.projectRepository.findAllWithPagination({
      paginationOptions: {
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      },
    });
  }

  findById(id: Project['id']) {
    return this.projectRepository.findById(id);
  }

  findByIds(ids: Project['id'][]) {
    return this.projectRepository.findByIds(ids);
  }

  async update(id: Project['id'], updateProjectDto: UpdateProjectDto) {
    let clientCompany: ClientCompany | undefined = undefined;

    if (updateProjectDto.clientCompany) {
      const foundClientCompany = await this.clientCompanyService.findById(
        updateProjectDto.clientCompany.id,
      );
      if (!foundClientCompany) {
        throw new Error('Client company not found');
      }
      clientCompany = foundClientCompany;
    }

    return this.projectRepository.update(id, {
      name: updateProjectDto.name,
      startDate: updateProjectDto.startDate
        ? new Date(updateProjectDto.startDate)
        : undefined,
      endDate: updateProjectDto.endDate
        ? new Date(updateProjectDto.endDate)
        : undefined,
      clientCompany,
    });
  }

  remove(id: Project['id']) {
    return this.projectRepository.remove(id);
  }

  async findByClientCompanyId(clientCompanyId: number): Promise<Project[]> {
    // Assuming the repository has a method for this, otherwise implement a query here
    return this.projectRepository.findByClientCompanyId(clientCompanyId);
  }

  /**
   * Helper method to add favorite status to projects
   */
  async addFavoriteStatusToProjects(projects: any[], userId?: number): Promise<any[]> {
    if (!userId) {
      // If no user ID, all projects are not favorited
      return projects.map(project => ({ ...project, isFavorite: false }));
    }

    try {
      // Find the user entity for this user (Akzente, Client, or Merchandiser)
      const [akzenteEntity, clientEntity, merchandiserEntity] = await Promise.all([
        this.akzenteService.findByUserId(userId).catch(() => null),
        this.clientService.findByUserId(userId).catch(() => null),
        this.merchandiserService.findByUserIdNumber(userId).catch(() => null),
      ]);

      if (akzenteEntity) {
        // Akzente logic (existing)
        const allFavorites = await this.akzenteFavoriteProjectService.findByAkzenteId(akzenteEntity.id);
        const favoriteProjectIds = allFavorites.map(fav => fav.project.id);
        return projects.map(project => ({
          ...project,
          isFavorite: favoriteProjectIds.includes(project.id)
        }));
      } else if (clientEntity) {
        // Client logic
        const allFavorites = await this.clientFavoriteProjectService.findByClientId(clientEntity.id);
        const favoriteProjectIds = allFavorites.map(fav => fav.project.id);
        return projects.map(project => ({
          ...project,
          isFavorite: favoriteProjectIds.includes(project.id)
        }));
      } else if (merchandiserEntity) {
        // Merchandiser logic
        const allFavorites = await this.merchandiserFavoriteProjectService.findByMerchandiserId(merchandiserEntity.id);
        const favoriteProjectIds = allFavorites.map(fav => fav.project.id);
        return projects.map(project => ({
          ...project,
          isFavorite: favoriteProjectIds.includes(project.id)
        }));
      } else {
        // If no entity found, all projects are not favorited
        return projects.map(project => ({ ...project, isFavorite: false }));
      }
    } catch (error) {
      // If there's an error, assume all projects are not favorited
      console.error('Error adding favorite status to projects:', error);
      return projects.map(project => ({ ...project, isFavorite: false }));
    }
  }

  async getProjectsWithBranchCount(clientCompanyId: number, userId?: number): Promise<any[]> {
    const projects = await this.findByClientCompanyId(clientCompanyId);
    const result: any[] = [];
    for (const project of projects) {
      const branches = await this.reportRepository.findBranchesByProjectId(project.id);
      
      // Calculate reported percentage
      const reports = await this.reportRepository.findByProjectId(project.id);
      const reportedPercentage = this.calculateReportedPercentage(reports);
      
      result.push({ 
        ...project, 
        branchesCount: branches.length,
        reportedPercentage 
      });
    }
    
    // Add favorite status to projects
    return this.addFavoriteStatusToProjects(result, userId);
  }

  /**
   * Calculate the percentage of reported branches for a project
   * Logic: (branches with VALID status) / (total unique branches) * 100
   */
  calculateReportedPercentage(reports: any[]): number {
    if (!reports || reports.length === 0) {
      return 0;
    }

    const branchKeys = new Set<string>();
    const closedBranchKeys = new Set<string>();

    reports.forEach((report) => {
      const key = this.getReportBranchKey(report);
      if (!key) {
        return;
      }
      branchKeys.add(key);

      // Check if status is VALID (which corresponds to "OK" status in frontend)
      const statusName = report.status?.name?.toUpperCase() ?? '';
      if (statusName === 'OK' || statusName === 'VALID' || report.status?.id === 9) {
        closedBranchKeys.add(key);
      }
    });

    if (branchKeys.size === 0) {
      return 0;
    }

    return Math.round((closedBranchKeys.size / branchKeys.size) * 100);
  }

  /**
   * Get a unique key for a report's branch
   * Matches the frontend logic
   */
  private getReportBranchKey(report: any): string | null {
    if (report.branch?.id) {
      return `branch-id-${report.branch.id}`;
    }

    const branchNumber = report.branch?.branchNumber?.toString().trim();
    if (branchNumber) {
      return `branch-number-${branchNumber}`;
    }

    const branchName = report.branch?.name?.toString().trim();
    if (branchName) {
      return `branch-name-${branchName}`;
    }

    if (report.id !== undefined) {
      return `report-${report.id}`;
    }

    return null;
  }
}
