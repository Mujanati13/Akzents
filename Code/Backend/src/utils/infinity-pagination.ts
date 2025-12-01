import { IPaginationOptions } from './types/pagination-options';
import { InfinityPaginationResponseDto } from './dto/infinity-pagination-response.dto';

export const infinityPagination = <T>(
  data: T[],
  options: IPaginationOptions,
  totalCount?: number,
): InfinityPaginationResponseDto<T> => {
  // If limit is 0, we're fetching all records, so there's no next page
  if (options.limit === 0) {
    return {
      data,
      hasNextPage: false,
      totalCount: totalCount ?? data.length,
    };
  }
  
  return {
    data,
    hasNextPage: data.length === options.limit,
    totalCount,
  };
};
