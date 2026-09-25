import type { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import { notFound } from '../errors/HttpError.js';
import { store } from '../persistence/db.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import { EditorRepository } from '../repositories/ShareRepository.js';
import type { Category, Scope } from '../types.js';
import { puoEtichettare, soloPadrone } from './raggio.js';

/**
 * Il segno di una categoria appena nata: la chiave di un disegno, non
 * un'emoji. Quelle di prima restano come sono — il campo è lo stesso, e chi
 * lo legge sa riconoscere le due cose.
 */
const DEFAULT_EMOJI = 'pin';
const DEFAULT_COLOR = '#2274a5';

/** Business rules for categories; every method is one transaction. */
export class CategoryManager {
  list(ownerId: string): Promise<Category[]> {
    return store.transaction((tx) => new CategoryRepository(tx).findAllOf(ownerId));
  }

  /** Una categoria nuova: da ospite solo con una mappa aperta tutta (`puoEtichettare`). */
  create(scope: Scope, dto: CreateCategoryDto): Promise<Category> {
    puoEtichettare(scope, 'Le categorie');
    return store.transaction((tx) =>
      new CategoryRepository(tx).insert(scope.ownerId, {
        name: dto.name,
        emoji: dto.emoji || DEFAULT_EMOJI,
        color: dto.color ?? DEFAULT_COLOR,
      }),
    );
  }

  /**
   * Il nome, il segno e il colore li cambia solo il padrone: una categoria
   * vale su tutte le sue mappe, e cambiarla da ospite cambierebbe anche i
   * luoghi che a quell'ospite non sono aperti.
   */
  update(scope: Scope, id: string, dto: UpdateCategoryDto): Promise<Category> {
    return store.transaction(async (tx) => {
      const categories = new CategoryRepository(tx);
      if (!(await categories.owns(scope.ownerId, id))) throw notFound('categoria inesistente');
      soloPadrone(scope);
      return (await categories.update(id, dto)) as Category;
    });
  }

  /**
   * Una categoria si porta via i suoi luoghi, e lo dice lo schema: o se ne
   * vanno la categoria e i suoi luoghi, o non se ne va niente.
   *
   * E la fa solo chi l'indice ce l'ha, come per le mappe. Una categoria non
   * appartiene a una mappa: vale su tutte, e i suoi luoghi stanno sparsi
   * ovunque. Un ospite che ne cancellava una si portava via anche i luoghi
   * delle mappe che non gli erano mai state date.
   *
   * La riga della categoria si blocca prima di contare i luoghi: chi sta
   * scrivendo un luogo in questa categoria nello stesso istante aspetta, e
   * poi la trova tolta (`PlaceManager`), invece di lasciare un luogo con una
   * categoria che non c'è. I luoghi si contano prima, perché dopo se ne sono
   * già andati, e chi era stato limitato a quei luoghi li perde dal suo
   * elenco.
   */
  remove(scope: Scope, id: string): Promise<{ removedPlaces: number; ristretti: { mapId: string; userId: string }[] }> {
    return store.transaction(async (tx) => {
      const categories = new CategoryRepository(tx);
      if (!(await categories.lock(scope.ownerId, id, 'update'))) throw notFound('categoria inesistente');
      soloPadrone(scope);
      const luoghi = await new PlaceRepository(tx).idsOfCategory(id);
      const ristretti = await new EditorRepository(tx).forgetPlaces(luoghi);
      await categories.delete(id);
      return { removedPlaces: luoghi.length, ristretti };
    });
  }
}

export const categoryManager = new CategoryManager();
