import { ApiProperty } from '@nestjs/swagger';

export class ReportStatus {
  @ApiProperty({
    type: Number,
  })
  id: number;

  @ApiProperty({
    type: String,
  })
  name: string;

  @ApiProperty({
    type: String,
  })
  akzenteName?: string | null;

  @ApiProperty({
    type: String,
  })
  clientName?: string | null;

  @ApiProperty({
    type: String,
  })
  merchandiserName?: string | null;

  @ApiProperty({
    type: String,
  })
  akzenteColor?: string | null;

  @ApiProperty({
    type: String,
  })
  clientColor?: string | null;

  @ApiProperty({
    type: String,
  })
  merchandiserColor?: string | null;
}
