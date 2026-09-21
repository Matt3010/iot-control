import { Router } from 'express';
import { requireUser } from '../auth/strategy.js';
import { authController } from '../controllers/AuthController.js';
import { mapController } from '../controllers/MapController.js';
import { categoryController } from '../controllers/CategoryController.js';
import { groupController } from '../controllers/GroupController.js';
import { placeController } from '../controllers/PlaceController.js';
import { stateController } from '../controllers/StateController.js';
import { CredentialsDto } from '../dto/auth.dto.js';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import { MapDto } from '../dto/map.dto.js';
import { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import { validateBody } from '../middleware/validateBody.js';

export const apiRouter = Router();

// --- quel poco che si può fare da fuori ------------------------------------
apiRouter.get('/auth/state', authController.state);
apiRouter.post('/auth/register', validateBody(CredentialsDto), authController.register);
apiRouter.post('/auth/login', validateBody(CredentialsDto), authController.login);
apiRouter.post('/auth/logout', authController.logout);

// --- da qui in poi serve essere entrati ------------------------------------
apiRouter.use(requireUser);

apiRouter.get('/auth/me', authController.me);
apiRouter.get('/state', stateController.snapshot);

apiRouter.route('/maps').get(mapController.list).post(validateBody(MapDto), mapController.create);

apiRouter
  .route('/maps/:id')
  .put(validateBody(MapDto), mapController.update)
  .delete(mapController.remove);

apiRouter
  .route('/categories')
  .get(categoryController.list)
  .post(validateBody(CreateCategoryDto), categoryController.create);

apiRouter
  .route('/categories/:id')
  .put(validateBody(UpdateCategoryDto), categoryController.update)
  .delete(categoryController.remove);

apiRouter
  .route('/groups')
  .get(groupController.list)
  .post(validateBody(CreateGroupDto), groupController.create);

apiRouter
  .route('/groups/:id')
  .put(validateBody(UpdateGroupDto), groupController.update)
  .delete(groupController.remove);

apiRouter
  .route('/places')
  .get(placeController.list)
  .post(validateBody(CreatePlaceDto), placeController.create);

apiRouter
  .route('/places/:id')
  .put(validateBody(UpdatePlaceDto), placeController.update)
  .delete(placeController.remove);
