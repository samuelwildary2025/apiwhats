import { Hono } from 'hono';
import { z } from 'zod';
import { waManager } from '../../lib/whatsapp.js';
import { instanceTokenMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';

const messages = new Hono();

// All message routes use instance token authentication
messages.use('*', instanceTokenMiddleware);

// ================================
// Schemas
// ================================

const textMessageSchema = z.object({
    to: z.string().min(1),
    text: z.string().min(1),
});

const mediaMessageSchema = z.object({
    to: z.string().min(1),
    mediaUrl: z.string().url().optional(),
    base64: z.string().optional(),
    mimetype: z.string().optional(),
    caption: z.string().optional(),
    filename: z.string().optional(),
}).refine(
    (data) => data.mediaUrl || (data.base64 && data.mimetype),
    'Either mediaUrl or base64+mimetype must be provided'
);

const locationMessageSchema = z.object({
    to: z.string().min(1),
    latitude: z.number(),
    longitude: z.number(),
    description: z.string().optional(),
});

const contactMessageSchema = z.object({
    to: z.string().min(1),
    contactId: z.string().min(1),
});

const reactionSchema = z.object({
    messageId: z.string().min(1),
    reaction: z.string().min(1),
});

const deleteMessageSchema = z.object({
    messageId: z.string().min(1),
    forEveryone: z.boolean().default(true),
});

const searchMessagesSchema = z.object({
    chatId: z.string().min(1),
    limit: z.number().min(1).max(500).default(50),
});

// ================================
// Send Message Routes
// ================================

/**
 * POST /message/text
 * Send a text message
 */
messages.post('/text', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = textMessageSchema.parse(body);

    try {
        const result = await waManager.sendText(instanceId, data.to, data.text);

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to send message',
        });
    }
});

/**
 * POST /message/media
 * Send media (image, video, audio, document)
 */
messages.post('/media', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = mediaMessageSchema.parse(body);

    try {
        let result;

        if (data.mediaUrl) {
            result = await waManager.sendMedia(instanceId, data.to, data.mediaUrl, {
                caption: data.caption,
                filename: data.filename,
            });
        } else if (data.base64 && data.mimetype) {
            result = await waManager.sendMediaBase64(
                instanceId,
                data.to,
                data.base64,
                data.mimetype,
                {
                    caption: data.caption,
                    filename: data.filename,
                }
            );
        } else {
            throw new Error('Invalid media data');
        }

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to send media',
        });
    }
});

/**
 * POST /message/location
 * Send a location
 */
messages.post('/location', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = locationMessageSchema.parse(body);

    try {
        const result = await waManager.sendLocation(
            instanceId,
            data.to,
            data.latitude,
            data.longitude,
            data.description
        );

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to send location',
        });
    }
});

/**
 * POST /message/contact
 * Send a contact card (vCard)
 */
messages.post('/contact', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = contactMessageSchema.parse(body);

    try {
        const result = await waManager.sendContact(instanceId, data.to, data.contactId);

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to send contact',
        });
    }
});

// ================================
// Message Actions
// ================================

/**
 * POST /message/react
 * React to a message
 */
messages.post('/react', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = reactionSchema.parse(body);

    try {
        await waManager.reactToMessage(instanceId, data.messageId, data.reaction);

        return c.json({
            success: true,
            message: 'Reaction sent successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to send reaction',
        });
    }
});

/**
 * POST /message/delete
 * Delete a message
 */
messages.post('/delete', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = deleteMessageSchema.parse(body);

    try {
        await waManager.deleteMessage(instanceId, data.messageId, data.forEveryone);

        return c.json({
            success: true,
            message: 'Message deleted successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to delete message',
        });
    }
});

/**
 * POST /message/search
 * Search messages in a chat
 */
messages.post('/search', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = searchMessagesSchema.parse(body);

    try {
        const messages = await waManager.getChatMessages(instanceId, data.chatId, data.limit);

        return c.json({
            success: true,
            data: messages,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to search messages',
        });
    }
});

/**
 * POST /message/read
 * Mark chat as read
 */
messages.post('/read', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = z.object({ chatId: z.string().min(1) }).parse(body);

    try {
        await waManager.markChatAsRead(instanceId, chatId);

        return c.json({
            success: true,
            message: 'Chat marked as read',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to mark as read',
        });
    }
});

export { messages as messagesRoutes };
