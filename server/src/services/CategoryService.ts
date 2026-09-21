import type { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import type { CategoryView } from '../dto/views.js';
import { toCategoryView } from '../dto/views.js';
import { categoryManager } from '../managers/CategoryManager.js';

/**
 * Use cases for categories. The manager owns the rules and the transaction;
 * this layer decides what a caller gets back, in view shape.
 */
export class CategoryService {
  async list(): Promise<CategoryView[]> {
    return (await categoryManager.list()).map(toCategoryView);
  }

  async create(dto: CreateCategoryDto): Promise<CategoryView> {
    return toCategoryView(await categoryManager.create(dto));
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryView> {
    return toCategoryView(await categoryManager.update(id, dto));
  }

  async remove(id: string): Promise<{ removedPlaces: number }> {
    return categoryManager.remove(id);
  }
}

export const categoryService = new CategoryService();
