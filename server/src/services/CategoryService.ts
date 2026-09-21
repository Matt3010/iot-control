import type { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import type { CategoryView } from '../dto/views.js';
import { toCategoryView } from '../dto/views.js';
import { categoryManager } from '../managers/CategoryManager.js';

/**
 * Use cases for categories. The manager owns the rules and the transaction;
 * this layer decides what a caller gets back, in view shape.
 */
export class CategoryService {
  async list(ownerId: string): Promise<CategoryView[]> {
    return (await categoryManager.list(ownerId)).map(toCategoryView);
  }

  async create(ownerId: string, dto: CreateCategoryDto): Promise<CategoryView> {
    return toCategoryView(await categoryManager.create(ownerId, dto));
  }

  async update(ownerId: string, id: string, dto: UpdateCategoryDto): Promise<CategoryView> {
    return toCategoryView(await categoryManager.update(ownerId, id, dto));
  }

  async remove(ownerId: string, id: string): Promise<{ removedPlaces: number }> {
    return categoryManager.remove(ownerId, id);
  }
}

export const categoryService = new CategoryService();
