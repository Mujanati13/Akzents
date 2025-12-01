import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ReportEntity } from '../entities/report.entity';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { Report } from '../../../../domain/report';
import { ReportRepository } from '../../report.repository';
import { ReportMapper } from '../mappers/report.mapper';
import { IPaginationOptions } from '../../../../../utils/types/pagination-options';
import { ConversationEntity } from '../../../../../conversation/infrastructure/persistence/relational/entities/conversation.entity';
import { MessageEntity } from '../../../../../message/infrastructure/persistence/relational/entities/message.entity';
import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';
import { ClientCompanyAssignedClientEntity } from '../../../../../client-company-assigned-client/infrastructure/persistence/relational/entities/client-company-assigned-client.entity';

@Injectable()
export class ReportRelationalRepository implements ReportRepository {
  constructor(
    @InjectRepository(ReportEntity)
    private readonly reportRepository: Repository<ReportEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepository: Repository<MessageEntity>,
  ) {}

  async create(data: Report): Promise<Report> {
    const persistenceModel = ReportMapper.toPersistence(data);
    // Explicitly exclude ID when creating new reports to prevent duplicate key errors
    // Use object destructuring to omit the id property
    const { id, ...modelWithoutId } = persistenceModel;
    const newEntity = await this.reportRepository.save(
      this.reportRepository.create(modelWithoutId as ReportEntity),
    );
    return ReportMapper.toDomain(newEntity);
  }

  async findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }): Promise<{ data: Report[]; totalCount: number }> {
    const [entities, totalCount] = await this.reportRepository.findAndCount({
      skip: (paginationOptions.page - 1) * paginationOptions.limit,
      take: paginationOptions.limit,
      order: {
        createdAt: 'DESC', // Default order by creation date descending (newest first)
      },
    });

    return {
      data: entities.map((entity) => ReportMapper.toDomain(entity)),
      totalCount,
    };
  }

  async findByIdForUpdate(id: Report['id']): Promise<NullableType<Report>> {
    const entity = await this.reportRepository.findOne({
      where: { id },
      relations: [
        'project',
        'status',
        'clientCompany',
        'merchandiser',
        'branch',
      ],
    });

    return entity ? ReportMapper.toDomain(entity) : null;
  }

  async findById(id: Report['id']): Promise<NullableType<Report>> {
    const entity = await this.reportRepository.findOne({
      where: { id },
      relations: [
        'project',
        'project.questions',
        'project.questions.answerType',
        'project.questions.options',
        'project.photos',
        'project.advancedPhotos',
        'status',
        'clientCompany',
        'branch',
        'branch.city',
        'merchandiser',
        'answers',
        'answers.question',
        'answers.question.options',
        'answers.selectedOption',
        'conversation',
        'conversation.messages',
        'conversation.messages.sender',
        'conversation.messages.sender.photo',
        'conversation.messages.sender.type',
        'conversation.messages.receiver',
        'conversation.messages.receiver.photo',
        'conversation.messages.receiver.type',
        'uploadedAdvancedPhotos',
        'uploadedAdvancedPhotos.advancedPhoto',
        'uploadedAdvancedPhotos.file',
      ],
      order: {
        uploadedAdvancedPhotos: {
          order: 'ASC',
        },
      },
    });

    return entity ? ReportMapper.toDomain(entity) : null;
  }

  async findByIdWithFilteredConversation(
    id: Report['id'],
    viewer: { role: 'akzente' | 'client' | 'merchandiser'; userId: number },
  ): Promise<NullableType<Report>> {
    // 1) Load report and required relations, but NOT messages to avoid join explosion
    const reportEntity = await this.reportRepository.findOne({
      where: { id },
      relations: [
        'project',
        'project.questions',
        'project.questions.answerType',
        'project.questions.options',
        'project.photos',
        'project.advancedPhotos',
        'status',
        'clientCompany',
        'branch',
        'branch.city',
        'merchandiser',
        'answers',
        'answers.question',
        'answers.selectedOption',
        'conversation',
        'uploadedAdvancedPhotos',
        'uploadedAdvancedPhotos.advancedPhoto',
        'uploadedAdvancedPhotos.file',
      ],
      order: {
        uploadedAdvancedPhotos: {
          order: 'ASC',
        },
      },
    });
    if (!reportEntity) return null;

    // 2) If there is a conversation, fetch messages (filtered for non-akzente)
    if (reportEntity.conversation) {
      const qb = this.messageRepository.createQueryBuilder('messages')
        .leftJoinAndSelect('messages.sender', 'sender')
        .leftJoinAndSelect('sender.photo', 'sender_photo')
        .leftJoinAndSelect('sender.type', 'sender_type')
        .leftJoinAndSelect('messages.receiver', 'receiver')
        .leftJoinAndSelect('receiver.photo', 'receiver_photo')
        .leftJoinAndSelect('receiver.type', 'receiver_type')
        .where('messages.conversation = :cid', { cid: reportEntity.conversation.id })
        .orderBy('messages.createdAt', 'ASC');

      if (viewer.role === 'client') {
        // Collect all client user IDs assigned to this report's client company
        const rawIds = await this.reportRepository.manager
          .createQueryBuilder(ClientCompanyAssignedClientEntity, 'ccac')
          .leftJoin('ccac.client', 'client')
          .leftJoin('client.user', 'client_user')
          .select('client_user.id', 'id')
          .where('ccac.clientCompany = :ccId', { ccId: reportEntity.clientCompany.id })
          .getRawMany();
        const clientUserIds = rawIds.map((r: any) => Number(r.id)).filter((n) => !!n);
        // Ensure current viewer is included even if not (yet) assigned
        if (!clientUserIds.includes(viewer.userId)) {
          clientUserIds.push(viewer.userId);
        }

        if (clientUserIds.length === 0) {
          (reportEntity.conversation as any).messages = [] as any;
          return ReportMapper.toDomain(reportEntity);
        }

        qb.andWhere(
          `(
            (LOWER(sender_type.name) = :akzente AND receiver.id IN (:...clientIds))
            OR (LOWER(receiver_type.name) = :akzente AND sender.id IN (:...clientIds))
            OR (messages.receiverType = :rAkzente AND sender.id IN (:...clientIds))
            OR (messages.receiverType = :rClient AND receiver.id IN (:...clientIds))
          )`,
          { akzente: 'akzente', rAkzente: 'akzente', rClient: 'client', clientIds: clientUserIds },
        );
      } else if (viewer.role === 'merchandiser') {
        qb.andWhere(
          '((LOWER(sender_type.name) = :akzente AND receiver.id = :viewerId) OR (LOWER(receiver_type.name) = :akzente AND sender.id = :viewerId))',
          { akzente: 'akzente', viewerId: viewer.userId },
        );
      }

      const filteredMessages = await qb.getMany();
      (reportEntity.conversation as any).messages = filteredMessages as any;
    }

    return ReportMapper.toDomain(reportEntity);
  }

  async findByIds(ids: Report['id'][]): Promise<Report[]> {
    const entities = await this.reportRepository.find({
      where: { id: In(ids) },
    });
    return entities.map((entity) => ReportMapper.toDomain(entity));
  }

  async update(
    id: Report['id'],
    payload: Partial<Report>,
  ): Promise<Report | null> {
    const entity = await this.reportRepository.findOne({
      where: { id },
    });

    if (!entity) {
      return null;
    }

    const updatedEntity = await this.reportRepository.save(
      this.reportRepository.create(
        ReportMapper.toPersistence({
          ...ReportMapper.toDomain(entity),
          ...payload,
        }),
      ),
    );

    return ReportMapper.toDomain(updatedEntity);
  }

  async remove(id: Report['id']): Promise<void> {
    await this.reportRepository.delete(id);
  }

  async findBranchesByProjectId(projectId: number): Promise<{ branchId: number }[]> {
    const qb = this.reportRepository.createQueryBuilder('report')
      .select('DISTINCT report.branch', 'branchId')
      .where('report.project = :projectId', { projectId });
    return qb.getRawMany();
  }

  async findByProjectId(projectId: number): Promise<Report[]> {
    // Use query builder for better performance - only load essential relations for table view
    // Don't load heavy relations like answers, questions, photos, files - these cause N+1 queries
    const queryBuilder = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.project', 'project')
      .leftJoinAndSelect('report.status', 'status')
      .leftJoinAndSelect('report.clientCompany', 'clientCompany')
      .leftJoinAndSelect('report.branch', 'branch')
      .leftJoinAndSelect('report.merchandiser', 'merchandiser')
      .leftJoinAndSelect('merchandiser.user', 'merchandiserUser')
      // Don't load conversation, answers, questions, photos, files for table view - these are heavy
      // These will be loaded on-demand when viewing individual reports
      .where('report.project_id = :projectId', { projectId })
      .orderBy('report.createdAt', 'DESC');

    const entities = await queryBuilder.getMany();

    return entities.map((entity) => ReportMapper.toDomain(entity));
  }

  async findByProjectIdsAndStatus(projectIds: number[], status: number): Promise<Report[]> {

    const entities = await this.reportRepository.find({
      where: { 
        project: { id: In(projectIds) },
        status: { id: status }
      },
      relations: ['project', 'status', 'clientCompany', 'branch', 'merchandiser'],
    });

    return entities.map((entity) => ReportMapper.toDomain(entity));
  }

  async findByProjectIds(projectIds: number[]): Promise<Report[]> {
    if (!projectIds || projectIds.length === 0) {
      return [];
    }

    const entities = await this.reportRepository.find({
      where: { 
        project: { id: In(projectIds) }
      },
      relations: ['project', 'status', 'clientCompany', 'branch', 'merchandiser'],
    });

    return entities.map((entity) => ReportMapper.toDomain(entity));
  }

  async findByBranchId(branchId: number): Promise<Report[]> {
    const entities = await this.reportRepository.find({
      where: { branch: { id: branchId } },
      relations: [
        'project', 
        'status', 
        'clientCompany', 
        'branch', 
        'merchandiser',
        'merchandiser.user',
        'answers',
        'answers.question',
        'answers.selectedOption',
        'uploadedAdvancedPhotos',
        'uploadedAdvancedPhotos.advancedPhoto',
        'uploadedAdvancedPhotos.file'
      ],
      order: {
        uploadedAdvancedPhotos: {
          order: 'ASC',
        },
      },
    });

    return entities.map((entity) => ReportMapper.toDomain(entity));
  }

  async findByMerchandiserId(merchandiserId: number): Promise<Report[]> {
    const entities = await this.reportRepository.find({
      where: { 
        merchandiser: { id: merchandiserId }
      },
      relations: [
        'project',
        'project.clientCompany',
        'project.clientCompany.logo',
        'status', 
        'clientCompany', 
        'branch', 
        'merchandiser', 
        'merchandiser.user',
        'answers',
        'answers.question',
        'answers.selectedOption',
        'uploadedAdvancedPhotos',
        'uploadedAdvancedPhotos.advancedPhoto',
        'uploadedAdvancedPhotos.file'
      ],
      order: {
        uploadedAdvancedPhotos: {
          order: 'ASC',
        },
      },
    });

    return entities.map((entity) => ReportMapper.toDomain(entity));
  }

  /**
   * Optimized query for dashboard - only loads essential fields
   */
  async findDashboardReportsByMerchandiserId(merchandiserId: number): Promise<Report[]> {
    const entities = await this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.project', 'project')
      .leftJoinAndSelect('project.clientCompany', 'clientCompany')
      .leftJoinAndSelect('report.status', 'status')
      .leftJoinAndSelect('report.branch', 'branch')
      .leftJoinAndSelect('branch.client', 'branchClient')
      .where('report.merchandiser.id = :merchandiserId', { merchandiserId })
      .select([
        'report.id',
        'report.plannedOn',
        'report.createdAt',
        'report.street',
        'report.zipCode',
        'report.note',
        'report.feedback',
        'report.isSpecCompliant',
        'project.id',
        'project.name',
        'clientCompany.id',
        'clientCompany.name',
        'status.id',
        'status.name',
        'status.merchandiserName',
        'status.merchandiserColor',
        'branch.id',
        'branch.name',
        'branchClient.id',
        'branchClient.name',
      ])
      .orderBy('report.createdAt', 'DESC')
      .getMany();

    return entities.map((entity) => ReportMapper.toDomain(entity));
  }
}
