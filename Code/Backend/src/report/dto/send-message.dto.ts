import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'The content of the message to send',
    example: 'Hello, I have a question about this report.',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'The type of user to send the message to',
    enum: ['akzente', 'merchandiser', 'client'],
    example: 'merchandiser',
  })
  @IsEnum(['akzente', 'merchandiser', 'client'])
  @IsNotEmpty()
  receiverType: 'akzente' | 'merchandiser' | 'client';
} 