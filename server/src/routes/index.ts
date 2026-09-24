import { Router } from 'express';
import { resolveActing } from '../auth/acting.js';
import { requireUser } from '../auth/strategy.js';
import { agentController } from '../controllers/AgentController.js';
import { alertController } from '../controllers/AlertController.js';
import { AlertDto, AlertOffDto } from '../dto/alert.dto.js';
import { authController } from '../controllers/AuthController.js';
import { deviceController } from '../controllers/DeviceController.js';
import { mapController } from '../controllers/MapController.js';
import { categoryController } from '../controllers/CategoryController.js';
import { groupController } from '../controllers/GroupController.js';
import { placeController } from '../controllers/PlaceController.js';
import { sceneController } from '../controllers/SceneController.js';
import { stateController } from '../controllers/StateController.js';
import { AgentDto, PairDto } from '../dto/agent.dto.js';
import { AccountDto, ActDto, CredentialsDto, PasswordDto, RegisterDto } from '../dto/auth.dto.js';
import { CommandDto, WatchDto } from '../dto/device.dto.js';
import { SceneDto } from '../dto/scene.dto.js';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import { EditorDto, InviteDto, MapDto } from '../dto/map.dto.js';
import { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import { pushController } from '../controllers/PushController.js';
import { SubscribeDto, UnsubscribeDto } from '../dto/push.dto.js';
import { validateBody } from '../middleware/validateBody.js';

export const apiRouter = Router();

// --- quel poco che si può fare da fuori ------------------------------------
apiRouter.get('/auth/state', authController.state);
apiRouter.post('/auth/register', validateBody(RegisterDto), authController.register);
apiRouter.post('/auth/login', validateBody(CredentialsDto), authController.login);
apiRouter.post('/auth/logout', authController.logout);

// quello che scarica una macchina appena accesa: non è entrata da
// nessuna parte, e l'unica prova che porta è il token nell'indirizzo — lo
// stesso con cui poi si collegherà.
apiRouter.get('/agents/:id/install', agentController.install);
apiRouter.get('/agents/:id/compose.yml', agentController.compose);

// cosa c'è dietro a un link d'invito: chi lo apre può non essere ancora entrato
apiRouter.get('/invites/:code', mapController.look);

// --- da qui in poi serve essere entrati ------------------------------------
apiRouter.use(requireUser);
/**
 * E si può essere entrati in casa d'altri: da qui in giù `ownerOf` dice di chi
 * è l'indice su cui si sta lavorando, e nessun altro se ne accorge.
 */
apiRouter.use(resolveActing);

apiRouter.get('/auth/me', authController.me);
/** Il proprio account: nome e fuso orario, e la password. */
apiRouter.patch('/auth/me', validateBody(AccountDto), authController.update);
apiRouter.put('/auth/password', validateBody(PasswordDto), authController.password);

/** Entrare in casa di qualcuno, e tornarsene a casa propria. */
apiRouter.post('/auth/act', validateBody(ActDto), authController.enter);
apiRouter.delete('/auth/act', authController.leave);
/** Aprire un link d'invito da entrati: si diventa editor di quella mappa e ci si entra. */
apiRouter.post('/invites/:code', authController.accept);
apiRouter.get('/state', stateController.snapshot);
/**
 * Il filo aperto: da qui scende tutto quello che cambia mentre guardi — gli
 * interruttori, e anche i luoghi che qualcun altro sposta da un'altra scheda.
 */
apiRouter.get('/state/stream', stateController.stream);

apiRouter.route('/maps').get(mapController.list).post(validateBody(MapDto), mapController.create);

apiRouter
  .route('/maps/:id')
  .put(validateBody(MapDto), mapController.update)
  .delete(mapController.remove);

/**
 * Chi può modificare una mappa: si entra con un link d'invito, che vale una
 * volta, e il padrone può revocarlo, restringere un editor a certi luoghi o
 * toglierlo.
 */
apiRouter.post('/maps/:id/invites', validateBody(InviteDto), mapController.invite);
apiRouter.delete('/maps/:id/invites/:inviteId', mapController.revoke);
apiRouter
  .route('/maps/:id/editors/:userId')
  .put(validateBody(EditorDto), mapController.restrict)
  .delete(mapController.dropEditor);

apiRouter
  .route('/categories')
  .get(categoryController.list)
  .post(validateBody(CreateCategoryDto), categoryController.create);

apiRouter
  .route('/categories/:id')
  .put(validateBody(UpdateCategoryDto), categoryController.update)
  .delete(categoryController.remove);

/*
 * Gli avvisi sul telefono. Stanno sulla persona e non sul proprietario di
 * turno: entrando in casa di qualcun altro, le notifiche restano le tue.
 */
// quello che e' successo mentre non guardavi
apiRouter.get('/alerts', alertController.list);

// le regole scritte sui dispositivi: «quando questa cosa diventa cosi'»
apiRouter
  .route('/alerts/rules')
  .get(alertController.rules)
  .post(validateBody(AlertDto), alertController.add);

apiRouter
  .route('/alerts/rules/:id')
  .put(validateBody(AlertOffDto), alertController.flip)
  .delete(alertController.remove);

apiRouter.get('/push/key', pushController.key);
apiRouter.get('/push/mine', pushController.mine);
apiRouter.post('/push/subscribe', validateBody(SubscribeDto), pushController.subscribe);
apiRouter.post('/push/unsubscribe', validateBody(UnsubscribeDto), pushController.unsubscribe);
apiRouter.post('/push/test', pushController.test);

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

apiRouter
  .route('/agents')
  .get(agentController.list)
  .post(validateBody(AgentDto), agentController.create);

apiRouter
  .route('/agents/:id')
  .put(validateBody(AgentDto), agentController.rename)
  .delete(agentController.remove);

/**
 * Le ultime ventiquattr'ore di un agente: quando si è collegato, cosa ha
 * mosso, chi ha premuto, e cosa ha smesso di rispondere.
 */
apiRouter.get('/agents/:id/log', agentController.log);

/** Rigenera il token: quello di prima smette di funzionare all'istante. */
apiRouter.post('/agents/:id/token', agentController.rotate);

/**
 * Collegare un account a quell'agente, una battuta per volta. Il QR non lo
 * disegna il server: manda la stringa, e i pixel li fa chi ha buon gusto.
 */
apiRouter.post('/agents/:id/pair', validateBody(PairDto), agentController.pair);

/**
 * Le scene: più cose che partono insieme, ognuna con la sua azione. «Sera»
 * chiude le tende e accende l'abat-jour, e si preme una volta.
 */
apiRouter
  .route('/scenes')
  .get(sceneController.list)
  .post(validateBody(SceneDto), sceneController.create);

apiRouter
  .route('/scenes/:id')
  .put(validateBody(SceneDto), sceneController.update)
  .delete(sceneController.remove);

apiRouter.post('/scenes/:id/run', sceneController.run);

apiRouter.get('/devices', deviceController.list);

/** Un fotogramma da una telecamera: si chiede quando qualcuno sta guardando. */
apiRouter.get('/devices/:id/frame', deviceController.frame);
apiRouter.get('/devices/:id/live', deviceController.live);
apiRouter.post('/devices/:id/command', validateBody(CommandDto), deviceController.command);
// «avvisami se questo smette di rispondere», acceso o spento
apiRouter.put('/devices/:id/watch', validateBody(WatchDto), deviceController.watch);
apiRouter.delete('/devices/:id', deviceController.remove);
