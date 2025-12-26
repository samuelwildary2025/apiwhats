import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

export interface WAInstance {
    client: Client;
    id: string;
    status: 'disconnected' | 'connecting' | 'connected' | 'qr';
    qrCode?: string;
    qrCodeBase64?: string;
}

export type WAEvent =
    | 'qr'
    | 'ready'
    | 'authenticated'
    | 'auth_failure'
    | 'disconnected'
    | 'message'
    | 'message_create'
    | 'message_ack'
    | 'message_revoke_everyone'
    | 'group_join'
    | 'group_leave'
    | 'group_update'
    | 'call';

class WhatsAppManager extends EventEmitter {
    private instances: Map<string, WAInstance> = new Map();

    constructor() {
        super();
        this.ensureSessionDir();
    }

    private ensureSessionDir() {
        if (!fs.existsSync(env.waSessionPath)) {
            fs.mkdirSync(env.waSessionPath, { recursive: true });
        }
    }

    async createInstance(instanceId: string): Promise<WAInstance> {
        if (this.instances.has(instanceId)) {
            throw new Error(`Instance ${instanceId} already exists`);
        }

        const sessionPath = path.join(env.waSessionPath, instanceId);

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: instanceId,
                dataPath: sessionPath,
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                ],
            },
        });

        const instance: WAInstance = {
            client,
            id: instanceId,
            status: 'disconnected',
        };

        this.setupEventHandlers(instance);
        this.instances.set(instanceId, instance);

        return instance;
    }

    private setupEventHandlers(instance: WAInstance) {
        const { client, id } = instance;

        client.on('qr', async (qr) => {
            instance.status = 'qr';
            instance.qrCode = qr;
            instance.qrCodeBase64 = await QRCode.toDataURL(qr);

            logger.info({ instanceId: id }, 'QR Code generated');
            this.emit('qr', { instanceId: id, qr, qrBase64: instance.qrCodeBase64 });

            await this.updateInstanceStatus(id, 'CONNECTING');
        });

        client.on('ready', async () => {
            instance.status = 'connected';
            instance.qrCode = undefined;
            instance.qrCodeBase64 = undefined;

            const info = client.info;
            logger.info({ instanceId: id, number: info.wid.user }, 'WhatsApp connected');

            await prisma.instance.update({
                where: { id },
                data: {
                    status: 'CONNECTED',
                    waNumber: info.wid.user,
                    waName: info.pushname,
                },
            });

            this.emit('ready', { instanceId: id, info });
        });

        client.on('authenticated', () => {
            logger.info({ instanceId: id }, 'WhatsApp authenticated');
            this.emit('authenticated', { instanceId: id });
        });

        client.on('auth_failure', async (msg) => {
            instance.status = 'disconnected';
            logger.error({ instanceId: id, error: msg }, 'Auth failure');

            await this.updateInstanceStatus(id, 'DISCONNECTED');
            this.emit('auth_failure', { instanceId: id, error: msg });
        });

        client.on('disconnected', async (reason) => {
            instance.status = 'disconnected';
            logger.warn({ instanceId: id, reason }, 'WhatsApp disconnected');

            await this.updateInstanceStatus(id, 'DISCONNECTED');
            this.emit('disconnected', { instanceId: id, reason });
        });

        client.on('message', (msg) => {
            this.emit('message', { instanceId: id, message: this.formatMessage(msg) });
        });

        client.on('message_create', (msg) => {
            this.emit('message_create', { instanceId: id, message: this.formatMessage(msg) });
        });

        client.on('message_ack', (msg, ack) => {
            this.emit('message_ack', { instanceId: id, messageId: msg.id._serialized, ack });
        });

        client.on('message_revoke_everyone', (msg, revokedMsg) => {
            this.emit('message_revoke_everyone', {
                instanceId: id,
                message: this.formatMessage(msg),
                revokedMessage: revokedMsg ? this.formatMessage(revokedMsg) : null
            });
        });

        client.on('group_join', (notification) => {
            this.emit('group_join', { instanceId: id, notification });
        });

        client.on('group_leave', (notification) => {
            this.emit('group_leave', { instanceId: id, notification });
        });

        client.on('group_update', (notification) => {
            this.emit('group_update', { instanceId: id, notification });
        });

        client.on('call', (call) => {
            this.emit('call', { instanceId: id, call });
        });
    }

    private formatMessage(msg: Message) {
        return {
            id: msg.id._serialized,
            from: msg.from,
            to: msg.to,
            body: msg.body,
            type: msg.type,
            timestamp: msg.timestamp,
            isForwarded: msg.isForwarded,
            isStatus: msg.isStatus,
            isStarred: msg.isStarred,
            fromMe: msg.fromMe,
            hasMedia: msg.hasMedia,
            hasQuotedMsg: msg.hasQuotedMsg,
        };
    }

    private async updateInstanceStatus(instanceId: string, status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED') {
        try {
            await prisma.instance.update({
                where: { id: instanceId },
                data: { status },
            });
        } catch (error) {
            logger.error({ instanceId, error }, 'Failed to update instance status');
        }
    }

    async connect(instanceId: string): Promise<WAInstance> {
        let instance = this.instances.get(instanceId);

        if (!instance) {
            instance = await this.createInstance(instanceId);
        }

        if (instance.status === 'connected') {
            return instance;
        }

        instance.status = 'connecting';
        await instance.client.initialize();

        return instance;
    }

    async disconnect(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`Instance ${instanceId} not found`);
        }

        await instance.client.destroy();
        instance.status = 'disconnected';

        await this.updateInstanceStatus(instanceId, 'DISCONNECTED');
    }

    async logout(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`Instance ${instanceId} not found`);
        }

        await instance.client.logout();
        await instance.client.destroy();
        instance.status = 'disconnected';

        // Remove session files
        const sessionPath = path.join(env.waSessionPath, instanceId);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true });
        }

        this.instances.delete(instanceId);
        await this.updateInstanceStatus(instanceId, 'DISCONNECTED');
    }

    async deleteInstance(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);

        if (instance) {
            try {
                await instance.client.destroy();
            } catch (error) {
                // Ignore destroy errors
            }
        }

        // Remove session files
        const sessionPath = path.join(env.waSessionPath, instanceId);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true });
        }

        this.instances.delete(instanceId);
    }

    getInstance(instanceId: string): WAInstance | undefined {
        return this.instances.get(instanceId);
    }

    getClient(instanceId: string): Client | undefined {
        return this.instances.get(instanceId)?.client;
    }

    getStatus(instanceId: string): WAInstance['status'] | 'not_found' {
        const instance = this.instances.get(instanceId);
        return instance?.status ?? 'not_found';
    }

    getQRCode(instanceId: string): { qr?: string; qrBase64?: string } {
        const instance = this.instances.get(instanceId);
        return {
            qr: instance?.qrCode,
            qrBase64: instance?.qrCodeBase64,
        };
    }

    getAllInstances(): string[] {
        return Array.from(this.instances.keys());
    }

    // ================================
    // Message Methods
    // ================================

    async sendText(instanceId: string, to: string, text: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = this.formatNumber(to);
        const result = await client.sendMessage(chatId, text);
        return this.formatMessage(result);
    }

    async sendMedia(
        instanceId: string,
        to: string,
        mediaUrl: string,
        options?: { caption?: string; filename?: string }
    ) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = this.formatNumber(to);
        const media = await MessageMedia.fromUrl(mediaUrl);

        const result = await client.sendMessage(chatId, media, {
            caption: options?.caption,
        });

        return this.formatMessage(result);
    }

    async sendMediaBase64(
        instanceId: string,
        to: string,
        base64: string,
        mimetype: string,
        options?: { caption?: string; filename?: string }
    ) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = this.formatNumber(to);
        const media = new MessageMedia(mimetype, base64, options?.filename);

        const result = await client.sendMessage(chatId, media, {
            caption: options?.caption,
        });

        return this.formatMessage(result);
    }

    async sendLocation(instanceId: string, to: string, latitude: number, longitude: number, description?: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = this.formatNumber(to);
        const { Location } = await import('whatsapp-web.js');
        const location = new Location(latitude, longitude, { name: description });

        const result = await client.sendMessage(chatId, location);
        return this.formatMessage(result);
    }

    async sendContact(instanceId: string, to: string, contactId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = this.formatNumber(to);
        const contact = await client.getContactById(this.formatNumber(contactId));

        const result = await client.sendMessage(chatId, contact);
        return this.formatMessage(result);
    }

    async reactToMessage(instanceId: string, messageId: string, reaction: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const msg = await client.getMessageById(messageId);
        if (!msg) throw new Error('Message not found');

        await msg.react(reaction);
    }

    async deleteMessage(instanceId: string, messageId: string, forEveryone: boolean = true) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const msg = await client.getMessageById(messageId);
        if (!msg) throw new Error('Message not found');

        if (forEveryone) {
            await msg.delete(true);
        } else {
            await msg.delete(false);
        }
    }

    // ================================
    // Contact Methods
    // ================================

    async getContacts(instanceId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const contacts = await client.getContacts();
        return contacts.map(c => ({
            id: c.id._serialized,
            number: c.number,
            name: c.name,
            pushname: c.pushname,
            isUser: c.isUser,
            isGroup: c.isGroup,
            isMyContact: c.isMyContact,
            isBlocked: c.isBlocked,
        }));
    }

    async getContactById(instanceId: string, contactId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const contact = await client.getContactById(this.formatNumber(contactId));
        return {
            id: contact.id._serialized,
            number: contact.number,
            name: contact.name,
            pushname: contact.pushname,
            isUser: contact.isUser,
            isGroup: contact.isGroup,
            isMyContact: contact.isMyContact,
            isBlocked: contact.isBlocked,
        };
    }

    async isRegisteredUser(instanceId: string, number: string): Promise<boolean> {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const numberId = await client.getNumberId(number);
        return numberId !== null;
    }

    async blockContact(instanceId: string, contactId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const contact = await client.getContactById(this.formatNumber(contactId));
        await contact.block();
    }

    async unblockContact(instanceId: string, contactId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const contact = await client.getContactById(this.formatNumber(contactId));
        await contact.unblock();
    }

    async getBlockedContacts(instanceId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const contacts = await client.getBlockedContacts();
        return contacts.map(c => ({
            id: c.id._serialized,
            number: c.number,
            name: c.name,
            pushname: c.pushname,
        }));
    }

    // ================================
    // Chat Methods
    // ================================

    async getChats(instanceId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chats = await client.getChats();
        return chats.map(c => ({
            id: c.id._serialized,
            name: c.name,
            isGroup: c.isGroup,
            unreadCount: c.unreadCount,
            timestamp: c.timestamp,
            archived: c.archived,
            pinned: c.pinned,
            isMuted: c.isMuted,
        }));
    }

    async getChatById(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        return {
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp,
            archived: chat.archived,
            pinned: chat.pinned,
            isMuted: chat.isMuted,
        };
    }

    async archiveChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.archive();
    }

    async unarchiveChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.unarchive();
    }

    async pinChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.pin();
    }

    async unpinChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.unpin();
    }

    async muteChat(instanceId: string, chatId: string, unmuteDate: Date) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.mute(unmuteDate);
    }

    async unmuteChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.unmute();
    }

    async markChatAsRead(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.sendSeen();
    }

    async deleteChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.delete();
    }

    async getChatMessages(instanceId: string, chatId: string, limit: number = 50) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        const messages = await chat.fetchMessages({ limit });
        return messages.map(m => this.formatMessage(m));
    }

    // ================================
    // Group Methods
    // ================================

    async createGroup(instanceId: string, name: string, participants: string[]) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const formattedParticipants = participants.map(p => this.formatNumber(p));
        const result = await client.createGroup(name, formattedParticipants);

        if (typeof result === 'string') {
            return { gid: result, missingParticipants: [] };
        }

        return {
            gid: (result as any).gid?._serialized || result,
            missingParticipants: (result as any).missingParticipants || [],
        };
    }

    async getGroupInfo(instanceId: string, groupId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        const groupChat = chat as any; // Type assertion for group-specific properties
        return {
            id: chat.id._serialized,
            name: chat.name,
            description: groupChat.description,
            participants: groupChat.participants?.map((p: any) => ({
                id: p.id._serialized,
                isAdmin: p.isAdmin,
                isSuperAdmin: p.isSuperAdmin,
            })),
            createdAt: groupChat.createdAt,
        };
    }

    async addParticipants(instanceId: string, groupId: string, participants: string[]) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        const formattedParticipants = participants.map(p => this.formatNumber(p));
        await (chat as any).addParticipants(formattedParticipants);
    }

    async removeParticipants(instanceId: string, groupId: string, participants: string[]) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        const formattedParticipants = participants.map(p => this.formatNumber(p));
        await (chat as any).removeParticipants(formattedParticipants);
    }

    async promoteParticipants(instanceId: string, groupId: string, participants: string[]) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        const formattedParticipants = participants.map(p => this.formatNumber(p));
        await (chat as any).promoteParticipants(formattedParticipants);
    }

    async demoteParticipants(instanceId: string, groupId: string, participants: string[]) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        const formattedParticipants = participants.map(p => this.formatNumber(p));
        await (chat as any).demoteParticipants(formattedParticipants);
    }

    async setGroupSubject(instanceId: string, groupId: string, subject: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        await (chat as any).setSubject(subject);
    }

    async setGroupDescription(instanceId: string, groupId: string, description: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        await (chat as any).setDescription(description);
    }

    async leaveGroup(instanceId: string, groupId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        await (chat as any).leave();
    }

    async getInviteCode(instanceId: string, groupId: string): Promise<string> {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        return await (chat as any).getInviteCode();
    }

    async revokeInviteCode(instanceId: string, groupId: string): Promise<string> {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        return await (chat as any).revokeInvite();
    }

    async joinGroupByInviteCode(instanceId: string, inviteCode: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const groupId = await client.acceptInvite(inviteCode);
        return groupId;
    }

    // ================================
    // Profile Methods
    // ================================

    async setProfileName(instanceId: string, name: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        await client.setDisplayName(name);
    }

    async setProfilePicture(instanceId: string, imageUrl: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const media = await MessageMedia.fromUrl(imageUrl);
        await client.setProfilePicture(media);
    }

    async setStatus(instanceId: string, status: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        await client.setStatus(status);
    }

    // ================================
    // Utility Methods
    // ================================

    private formatNumber(number: string): string {
        // Remove all non-numeric characters
        let cleaned = number.replace(/\D/g, '');

        // Add @c.us suffix if not present
        if (!cleaned.includes('@')) {
            // Check if it's a group ID
            if (cleaned.includes('-')) {
                return `${cleaned}@g.us`;
            }
            return `${cleaned}@c.us`;
        }

        return cleaned;
    }
}

// Singleton instance
export const waManager = new WhatsAppManager();
