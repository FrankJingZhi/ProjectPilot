import { IsString, Length } from 'class-validator';

export class ReplyDto {
  @IsString()
  @Length(1, 10000)
  answers!: string;
}
