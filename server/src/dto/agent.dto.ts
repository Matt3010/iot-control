import type { Handler } from '../../../shared/protocol.js';
import { Transform } from 'class-transformer';
import { Allow, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Una battuta della conversazione per collegare un account a un agente. */
export class PairDto {
  @IsIn(['start', 'submit', 'cancel', 'list', 'unlink'], { message: 'azione sconosciuta' })
  action!: 'start' | 'submit' | 'cancel' | 'list' | 'unlink';

  /**
   * Quale account. Qui passa e basta: quali si sanno collegare lo sa
   * l'agente, che rifiuta quelli che non conosce e lo dice.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  handler?: Handler;

  /** La conversazione in corso, dal passo prima. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  flowId?: string;

  /** Quello che la persona ha scritto nei campi del passo prima. */
  @Allow()
  input?: Record<string, string | boolean>;

  /** Quale collegamento staccare. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entryId?: string;
}

/** Un agente ha solo un nome: tutto il resto lo racconta lui quando si collega. */
export class AgentDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome è obbligatorio' })
  @MaxLength(40)
  name!: string;
}
