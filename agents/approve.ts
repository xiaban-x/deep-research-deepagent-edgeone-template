/**
 * HITL Approval Endpoint — Receives user-approved sub-questions.
 *
 * After the orchestrator emits a hitl_request event, the frontend shows
 * an approval UI. When the user approves (with optional edits), this endpoint
 * stores the approval and the frontend re-calls /research with { approved: true, subQuestions }.
 */
import { createLogger } from './_shared';

const logger = createLogger('approve');

export async function onRequest(context: any) {
    const { request, store, conversation_id } = context;
    const { subQuestions, originalQuestion } = request?.body ?? {};

    if (!subQuestions || !Array.isArray(subQuestions)) {
        return new Response(JSON.stringify({ error: 'Missing subQuestions array' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    logger.log(`Approved ${subQuestions.length} sub-questions for conversation: ${conversation_id}`);

    // Save approval to Memory for audit trail
    if (store) {
        try {
            await store.appendMessage({
                conversationId: conversation_id,
                role: 'user',
                content: JSON.stringify({ action: 'approve_sub_questions', subQuestions }),
                metadata: { type: 'hitl_approval', originalQuestion },
            });
        } catch (e) { logger.log('Memory save skipped:', (e as Error).message); }
    }

    return new Response(JSON.stringify({ success: true, subQuestions }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
