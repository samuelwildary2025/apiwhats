'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
    ArrowLeft,
    Loader2,
    Wifi,
    WifiOff,
    RefreshCw,
    Copy,
    Check,
    MessageSquare,
    Settings,
    Trash2,
    Power,
    QrCode,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Instance {
    id: string;
    name: string;
    token: string;
    status: string;
    waNumber?: string;
    waName?: string;
    waPicture?: string;
    webhookUrl?: string;
    webhookEvents: string[];
    qrCode?: string;
    createdAt: string;
    updatedAt: string;
}

export default function InstanceDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const { user, checkAuth } = useAuth();
    const router = useRouter();
    const [instance, setInstance] = useState<Instance | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (id) {
            loadInstance();
        }
    }, [id]);

    const loadInstance = async () => {
        try {
            const response = await api.getInstance(id);
            if (response.data) {
                setInstance(response.data);
            }
        } catch (error) {
            toast.error('Erro ao carregar instância');
            router.push('/dashboard');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnect = async () => {
        setConnecting(true);
        try {
            const response = await api.connectInstance(id);
            toast.success('Conectando... Escaneie o QR Code');
            loadInstance();

            // Start polling for status
            const poll = setInterval(async () => {
                const statusRes = await api.getInstanceStatus(id);
                if (statusRes.data) {
                    setInstance(prev => prev ? { ...prev, ...statusRes.data } : null);
                    if (statusRes.data.status === 'connected') {
                        clearInterval(poll);
                        toast.success('Conectado com sucesso!');
                    }
                }
            }, 3000);

            // Stop polling after 2 minutes
            setTimeout(() => clearInterval(poll), 120000);
        } catch (error: any) {
            toast.error(error.message || 'Erro ao conectar');
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            await api.disconnectInstance(id);
            toast.success('Desconectado');
            loadInstance();
        } catch (error: any) {
            toast.error(error.message || 'Erro ao desconectar');
        }
    };

    const handleLogout = async () => {
        if (!confirm('Isso removerá a sessão. Você precisará escanear o QR novamente.')) return;

        try {
            await api.logoutInstance(id);
            toast.success('Sessão encerrada');
            loadInstance();
        } catch (error: any) {
            toast.error(error.message || 'Erro ao fazer logout');
        }
    };

    const copyToken = () => {
        if (instance?.token) {
            navigator.clipboard.writeText(instance.token);
            setCopied(true);
            toast.success('Token copiado!');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    if (!instance) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p>Instância não encontrada</p>
            </div>
        );
    }

    const isConnected = instance.status === 'connected';
    const isConnecting = instance.status === 'connecting' || instance.status === 'qr';

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link
                        href="/dashboard"
                        className="p-2 rounded-lg hover:bg-[var(--card)] transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold">{instance.name}</h1>
                            <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${isConnected
                                        ? 'bg-[var(--success)]/20 text-[var(--success)]'
                                        : isConnecting
                                            ? 'bg-[var(--warning)]/20 text-[var(--warning)]'
                                            : 'bg-[var(--danger)]/20 text-[var(--danger)]'
                                    }`}
                            >
                                {instance.status === 'qr' ? 'Aguardando QR' : instance.status}
                            </span>
                        </div>
                        <p className="text-[var(--muted)]">
                            {instance.waNumber ? `+${instance.waNumber}` : 'Não conectado'}
                        </p>
                    </div>
                    <button onClick={loadInstance} className="btn btn-secondary">
                        <RefreshCw className="w-4 h-4" />
                        Atualizar
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Connection Card */}
                    <div className="glass rounded-xl p-6">
                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                            <QrCode className="w-5 h-5" />
                            Conexão WhatsApp
                        </h3>

                        {isConnected ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 p-4 bg-[var(--success)]/10 rounded-lg">
                                    <div className="w-12 h-12 rounded-full bg-[var(--success)]/20 flex items-center justify-center">
                                        <Wifi className="w-6 h-6 text-[var(--success)]" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-[var(--success)]">Conectado</p>
                                        <p className="text-sm text-[var(--muted)]">
                                            {instance.waName} • +{instance.waNumber}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button onClick={handleDisconnect} className="btn btn-secondary flex-1">
                                        <WifiOff className="w-4 h-4" />
                                        Desconectar
                                    </button>
                                    <button onClick={handleLogout} className="btn btn-danger flex-1">
                                        <Power className="w-4 h-4" />
                                        Logout
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {instance.qrCode ? (
                                    <div className="bg-white p-4 rounded-lg">
                                        <img
                                            src={instance.qrCode}
                                            alt="QR Code"
                                            className="w-full max-w-xs mx-auto"
                                        />
                                    </div>
                                ) : (
                                    <div className="p-8 text-center bg-[var(--card)] rounded-lg">
                                        <WifiOff className="w-12 h-12 mx-auto mb-4 text-[var(--muted)]" />
                                        <p className="text-[var(--muted)]">
                                            Clique em conectar para gerar o QR Code
                                        </p>
                                    </div>
                                )}

                                <button
                                    onClick={handleConnect}
                                    disabled={connecting}
                                    className="btn btn-primary w-full"
                                >
                                    {connecting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Conectando...
                                        </>
                                    ) : (
                                        <>
                                            <Wifi className="w-4 h-4" />
                                            Conectar
                                        </>
                                    )}
                                </button>

                                {instance.qrCode && (
                                    <p className="text-center text-sm text-[var(--muted)]">
                                        Abra o WhatsApp {'>'} Aparelhos conectados {'>'} Conectar dispositivo
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* API Token Card */}
                    <div className="glass rounded-xl p-6">
                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                            <Settings className="w-5 h-5" />
                            Token da API
                        </h3>

                        <p className="text-sm text-[var(--muted)] mb-4">
                            Use este token para autenticar requisições à API
                        </p>

                        <div className="flex items-center gap-2 mb-4">
                            <input
                                type="text"
                                value={instance.token}
                                readOnly
                                className="font-mono text-sm"
                            />
                            <button
                                onClick={copyToken}
                                className="btn btn-secondary shrink-0"
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>

                        <div className="p-4 bg-[var(--card)] rounded-lg">
                            <p className="text-xs text-[var(--muted)] mb-2">Exemplo de uso:</p>
                            <code className="text-xs text-[var(--primary)] break-all">
                                curl -X POST http://localhost:3000/message/text \<br />
                                &nbsp;&nbsp;-H "X-Instance-Token: {instance.token.substring(0, 8)}..." \<br />
                                &nbsp;&nbsp;-d '{`{"to":"5511999999999","text":"Olá!"}`}'
                            </code>
                        </div>
                    </div>

                    {/* Info Card */}
                    <div className="glass rounded-xl p-6 lg:col-span-2">
                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                            <MessageSquare className="w-5 h-5" />
                            Informações
                        </h3>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-sm text-[var(--muted)]">ID</p>
                                <p className="font-mono text-sm truncate">{instance.id}</p>
                            </div>
                            <div>
                                <p className="text-sm text-[var(--muted)]">Nome</p>
                                <p className="font-medium">{instance.name}</p>
                            </div>
                            <div>
                                <p className="text-sm text-[var(--muted)]">Criado em</p>
                                <p className="font-medium">
                                    {new Date(instance.createdAt).toLocaleDateString('pt-BR')}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-[var(--muted)]">Atualizado em</p>
                                <p className="font-medium">
                                    {new Date(instance.updatedAt).toLocaleDateString('pt-BR')}
                                </p>
                            </div>
                        </div>

                        {instance.webhookUrl && (
                            <div className="mt-4 pt-4 border-t border-[var(--border)]">
                                <p className="text-sm text-[var(--muted)] mb-1">Webhook URL</p>
                                <p className="font-mono text-sm">{instance.webhookUrl}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
