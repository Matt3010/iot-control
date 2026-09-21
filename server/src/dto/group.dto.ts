import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class CreateGroupDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome è obbligatorio' })
  @MaxLength(40)
  name!: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome non può essere vuoto' })
  @MaxLength(40)
  name?: string;
}
