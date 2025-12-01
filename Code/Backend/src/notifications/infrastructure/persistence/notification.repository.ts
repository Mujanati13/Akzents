import { DeepPartial } from '../../../utils/types/deep-partial.type';
import { NullableType } from '../../../utils/types/nullable.type';
import { IPaginationOptions } from '../../../utils/types/pagination-options';
import { Notification } from '../../domain/notification';
import { FilterNotificationDto, SortNotificationDto } from '../../dto/query-notification.dto';
import { User } from '../../../users/domain/user';

export abstract class NotificationRepository {
  abstract create(
    data: Omit<Notification, 'id' | 'createdAt' | 'deletedAt' | 'updatedAt'>,
  ): Promise<Notification>;

  abstract findManyWithPagination({
    filterOptions,
    sortOptions,
    paginationOptions,
  }: {
    filterOptions?: FilterNotificationDto | null;
    sortOptions?: SortNotificationDto[] | null;
    paginationOptions: IPaginationOptions;
  }): Promise<Notification[]>;

  abstract findById(id: Notification['id']): Promise<NullableType<Notification>>;
  
  abstract findByUserId(userId: User['id']): Promise<Notification[]>;
  
  abstract findUnseenByUserId(userId: User['id']): Promise<Notification[]>;

  abstract update(
    id: Notification['id'],
    payload: DeepPartial<Notification>,
  ): Promise<Notification | null>;

  abstract markAsSeen(id: Notification['id']): Promise<Notification | null>;
  
  abstract markAllAsSeenByUserId(userId: User['id']): Promise<void>;

  abstract markAllAsSeenByConversationId(conversationId: number, userId: User['id']): Promise<void>;

  abstract markAllAsUnseenByConversationId(conversationId: number, userId: User['id']): Promise<void>;

  abstract findByConversationAndUser(conversationId: number, userId: User['id']): Promise<Notification | null>;

  abstract toggleSeen(id: Notification['id']): Promise<Notification | null>;

  abstract removeByConversationAndUser(conversationId: number, userId: User['id']): Promise<void>;

  abstract remove(id: Notification['id']): Promise<void>;
}