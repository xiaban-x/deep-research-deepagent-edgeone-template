/**
 * Research Project Management — CRUD for persistent research projects with versioning.
 *
 * POST /project
 * Actions: create, list, get, delete, get_version, diff,
 *          save_version, save_chat, get_chat
 *
 * Storage: context.store (injected by Makers runtime — no env vars needed)
 *
 * Key convention (conversationId):
 *   projects-index          → manifest: [{ id, name, createdAt, versionCount }]
 *   project-{id}-meta       → { id, name, createdAt, updatedAt, versionCount }
 *   project-{id}-v{N}       → Full version data (report + sources)
 *   project-{id}-chat       → { messages, updatedAt }
 */
import { createLogger } from './_shared';

const logger = createLogger('project');

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function storeGet(store: any, key: string): Promise<any> {
  const messages = await store.getMessages({ conversationId: key, limit: 1, order: 'desc' });
  if (messages.length > 0 && messages[0].content) {
    const content = messages[0].content;
    return typeof content === 'string' ? JSON.parse(content) : content;
  }
  return null;
}

async function storeSet(store: any, key: string, data: unknown, metadataType?: string): Promise<void> {
  try { await store.clearMessages({ conversationId: key }); } catch {}
  await store.appendMessage({
    conversationId: key,
    role: 'system',
    content: JSON.stringify(data),
    ...(metadataType ? { metadata: { type: metadataType } } : {}),
  });
}

async function storeDel(store: any, key: string): Promise<void> {
  try { await store.clearMessages({ conversationId: key }); } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  });
}

function generateId(): string {
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
}

interface ProjectIndex {
  projects: Array<{ id: string; name: string; createdAt: string; versionCount: number }>;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function onRequest(context: any) {
  const { request, store } = context;
  const body = request?.body ?? {};
  const { action } = body;

  if (!store) {
    return json({ error: 'Storage not available (deploy to EdgeOne Makers)' }, 503);
  }

  try {
    switch (action) {
      // ─── Create Project ──────────────────────────────────────────────
      case 'create': {
        const { name } = body;
        if (!name || typeof name !== 'string') {
          return json({ error: 'Project name is required' }, 400);
        }

        const id = generateId();
        const now = new Date().toISOString();
        const meta: ProjectMeta = { id, name: name.trim(), createdAt: now, updatedAt: now, versionCount: 0 };

        await storeSet(store, `project-${id}-meta`, meta, 'project-meta');

        const index: ProjectIndex = (await storeGet(store, 'projects-index')) || { projects: [] };
        index.projects.unshift({ id, name: meta.name, createdAt: now, versionCount: 0 });
        await storeSet(store, 'projects-index', index, 'projects-index');

        logger.log(`Created project: ${id} "${name}"`);
        return json({ project: meta });
      }

      // ─── List Projects ───────────────────────────────────────────────
      case 'list': {
        const index: ProjectIndex = (await storeGet(store, 'projects-index')) || { projects: [] };
        return json({ projects: index.projects });
      }

      // ─── Get Project (meta + version summaries) ──────────────────────
      case 'get': {
        const { id } = body;
        if (!id) return json({ error: 'Missing project id' }, 400);

        const meta = await storeGet(store, `project-${id}-meta`) as ProjectMeta | null;
        if (!meta) return json({ error: 'Project not found' }, 404);

        const versions: Array<{ version: number; question: string; trigger: string; createdAt: string }> = [];
        for (let i = 1; i <= meta.versionCount; i++) {
          const v = await storeGet(store, `project-${id}-v${i}`);
          if (v) {
            versions.push({
              version: i,
              question: v.question || '',
              trigger: v.trigger || 'initial',
              createdAt: v.createdAt || '',
            });
          }
        }

        return json({ project: meta, versions });
      }

      // ─── Get Specific Version (full data) ────────────────────────────
      case 'get_version': {
        const { id, version } = body;
        if (!id || !version) return json({ error: 'Missing id or version' }, 400);

        const data = await storeGet(store, `project-${id}-v${version}`);
        if (!data) return json({ error: 'Version not found' }, 404);

        return json({ version: data });
      }

      // ─── Diff (return two versions for client-side diff) ─────────────
      case 'diff': {
        const { id, v1, v2 } = body;
        if (!id || !v1 || !v2) return json({ error: 'Missing id, v1, or v2' }, 400);

        const version1 = await storeGet(store, `project-${id}-v${v1}`);
        const version2 = await storeGet(store, `project-${id}-v${v2}`);
        if (!version1 || !version2) return json({ error: 'One or both versions not found' }, 404);

        return json({
          v1: { version: v1, report: version1.report, createdAt: version1.createdAt, question: version1.question },
          v2: { version: v2, report: version2.report, createdAt: version2.createdAt, question: version2.question },
        });
      }

      // ─── Delete Project ──────────────────────────────────────────────
      case 'delete': {
        const { id } = body;
        if (!id) return json({ error: 'Missing project id' }, 400);

        const meta = await storeGet(store, `project-${id}-meta`) as ProjectMeta | null;
        if (!meta) return json({ error: 'Project not found' }, 404);

        for (let i = 1; i <= meta.versionCount; i++) {
          await storeDel(store, `project-${id}-v${i}`);
        }
        await storeDel(store, `project-${id}-meta`);
        await storeDel(store, `project-${id}-chat`);

        const index = await storeGet(store, 'projects-index') as ProjectIndex | null;
        if (index?.projects) {
          index.projects = index.projects.filter(p => p.id !== id);
          await storeSet(store, 'projects-index', index, 'projects-index');
        }

        logger.log(`Deleted project: ${id}`);
        return json({ success: true });
      }

      // ─── Save Version (called internally by research.ts) ─────────────
      case 'save_version': {
        const { id, versionData } = body;
        if (!id || !versionData) return json({ error: 'Missing id or versionData' }, 400);

        const meta = await storeGet(store, `project-${id}-meta`) as ProjectMeta | null;
        if (!meta) return json({ error: 'Project not found' }, 404);

        const newVersion = meta.versionCount + 1;
        const now = new Date().toISOString();

        await storeSet(store, `project-${id}-v${newVersion}`, {
          ...versionData,
          version: newVersion,
          createdAt: now,
        }, 'project-version');

        meta.versionCount = newVersion;
        meta.updatedAt = now;
        await storeSet(store, `project-${id}-meta`, meta, 'project-meta');

        const index = await storeGet(store, 'projects-index') as ProjectIndex | null;
        if (index?.projects) {
          const proj = index.projects.find(p => p.id === id);
          if (proj) proj.versionCount = newVersion;
          await storeSet(store, 'projects-index', index, 'projects-index');
        }

        logger.log(`Saved version ${newVersion} for project ${id}`);
        return json({ success: true, version: newVersion });
      }

      // ─── Save Chat History ────────────────────────────────────────────
      case 'save_chat': {
        const { id, messages } = body;
        if (!id || !Array.isArray(messages)) return json({ error: 'Missing id or messages' }, 400);
        await storeSet(store, `project-${id}-chat`, { messages, updatedAt: new Date().toISOString() }, 'project-chat');
        return json({ success: true });
      }

      // ─── Get Chat History ─────────────────────────────────────────────
      case 'get_chat': {
        const { id } = body;
        if (!id) return json({ error: 'Missing id' }, 400);
        const chatData = await storeGet(store, `project-${id}-chat`);
        return json({ messages: chatData?.messages || [] });
      }

      default:
        return json({ error: 'Unknown action. Use: create, list, get, get_version, diff, delete, save_version, save_chat, get_chat' }, 400);
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    const isStorageError =
      e?.code === 'CREDENTIAL_ERROR' ||
      msg.includes('credential') ||
      msg.includes('Invalid project') ||
      msg.includes('Memory storage operation failed');
    if (isStorageError) {
      return json({ error: 'Storage not available (deploy to EdgeOne Makers)' }, 503);
    }
    logger.error(msg);
    return json({ error: msg }, 500);
  }
}
