import { Transform } from 'class-transformer';
import { Allow, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Una battuta della conversazione per collegare un account a un agente. */
export class PairDto {
  @IsIn(['start', 'submit', 'cancel'], { message: 'azione sconosciuta' })
  action!: 'start' | 'submit' | 'cancel';

  /** Quale account: `tuya`, e domani altri. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  handler?: string;

  /** La conversazione in corso, dal passo prima. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  flowId?: string;

  /** Quello che la persona ha scritto nei campi del passo prima. */
  @Allow()
  input?: Record<string, string>;
}

/** Un agente ha solo un nome: tutto il resto lo racconta lui quando si collega. */
export class AgentDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome è obbligatorio' })
  @MaxLength(40)
  name!: string;
}
