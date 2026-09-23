import type { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import { notFound } from '../errors/HttpError.js';
import { store } from '../persistence/db.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Category } from '../types.js';

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

  create(ownerId: string, dto: CreateCategoryDto): Promise<Category> {
    return store.transaction((tx) =>
      new CategoryRepository(tx).insert(ownerId, {
        name: dto.name,
        emoji: dto.emoji || DEFAULT_EMOJI,
        color: dto.color ?? DEFAULT_COLOR,
      }),
    );
  }

  update(ownerId: string, id: string, dto: UpdateCategoryDto): Promise<Category> {
    return store.transaction(async (tx) => {
      const categories = new CategoryRepository(tx);
      if (!(await categories.owns(ownerId, id))) throw notFound('categoria inesistente');
      return (await categories.update(id, dto)) as Category;
    });
  }

  /**
   * A category owns its places, so both go in the same transaction: either the
   * category and its places are gone, or nothing is.
   */
  remove(ownerId: string, id: string): Promise<{ removedPlaces: number }> {
    return store.transaction(async (tx) => {
      const categories = new CategoryRepository(tx);
      if (!(await categories.owns(ownerId, id))) throw notFound('categoria inesistente');
      const removedPlaces = await new PlaceRepository(tx).deleteByCategory(id);
      await categories.delete(id);
      return { removedPlaces };
    });
  }
}

export const categoryManager = new CategoryManager();
