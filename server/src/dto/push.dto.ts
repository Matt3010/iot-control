import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/** I servizi che consegnano gli avvisi: Google, Mozilla, Apple, Microsoft. */
const CONSEGNA = [
  /^(fcm|android)\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

const trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Un telefono che si iscrive agli avvisi.
 *
 * Tutto questo lo scrive il browser, non la persona: l'indirizzo di consegna
 * e le due chiavi con cui si cifra il contenuto. Si controlla comunque — è
 * roba che arriva dalla rete, e roba che arriva dalla rete si guarda in
 * faccia prima di metterla in casa.
 */
export class SubscribeDto {
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  /*
   * Solo i servizi di consegna dei browser. L'indirizzo lo scrive il browser,
   * ma arriva dalla rete, e il server poi ci fa una richiesta: un indirizzo
   * qualunque lo farebbe bussare dove vuole chi l'ha scritto, anche dentro
   * la rete di casa.
   */
  @IsUrl(
    { protocols: ['https'], require_protocol: true, host_whitelist: CONSEGNA },
    { message: 'questo indirizzo non è di un servizio di consegna degli avvisi' },
  )
  endpoint!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  auth!: string;

  /** Che macchina è: serve a chi vuole spegnerne una sola, non tutte. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  agent?: string;
}

/** Spegnerle su questa macchina: basta l'indirizzo, che è la sua chiave. */
export class UnsubscribeDto {
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  endpoint!: string;
}
