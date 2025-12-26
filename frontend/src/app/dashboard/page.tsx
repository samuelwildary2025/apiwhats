'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
    MessageSquare,
    Smartphone,
    Send,
    Users,
    BarChart3,
    Settings,
    LogOut,
    Plus,
    Wifi,
    WifiOff,
    Loader2,
    RefreshCw,
    Trash2,
    Eye,
    Megaphone,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Instance {
    id: string;
    name: string;
    token: string;
    status: string;
    waNumber?: string;
    waName?: string;
    qrCode?: string;
    createdAt: string;
}

interface Stats {
    users: number;
    instances: {
        total: number;
        connected: number;
        active: number;
        limit: number;
    };
    campaigns: number;
    messages: number;
}

export default function DashboardPage() {
    const { user, logout, isLoading: authLoading, checkAuth } = useAuth();
    const router = useRouter();
    const [instances, setInstances] = useState<Instance[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newInstanceName, setNewInstanceName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/');
        }
    }, [authLoading, user, router]);

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    const loadData = async () => {
        try {
            const [instancesRes, statsRes] = await Promise.all([
                api.getInstances(),
                api.getStats(),
            ]);

            if (instancesRes.data) {
                setInstances(instancesRes.data);
            }
            if (statsRes.data) {
                setStats(statsRes.data);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateInstance = async () => {
        if (!newInstanceName.trim()) return;

        setCreating(true);
        try {
            const response = await api.createInstance(newInstanceName);
            if (response.data) {
                toast.success('Instância criada com sucesso!');
                setShowCreateModal(false);
                setNewInstanceName('');
                loadData();
            }
        } catch (error: any) {
            toast.error(error.message || 'Erro ao criar instância');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteInstance = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta instância?')) return;

        try {
            await api.deleteInstance(id);
            toast.success('Instância excluída');
            loadData();
        } catch (error: any) {
            toast.error(error.message || 'Erro ao excluir');
        }
    };

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    if (authLoading || isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-[var(--border)] p-4 flex flex-col">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-black" />
                    </div>
                    <div>
                        <h1 className="font-bold">WhatsApp API</h1>
                        <p className="text-xs text-[var(--muted)]">Painel Admin</p>
                    </div>
                </div>

                <nav className="flex-1 space-y-1">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--card)] text-[var(--primary)]"
                    >
                        <BarChart3 className="w-5 h-5" />
                        Dashboard
                    </Link>
                    <Link
                        href="/dashboard/instances"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--card)] transition-colors"
                    >
                        <Smartphone className="w-5 h-5" />
                        Instâncias
                    </Link>
                    <Link
                        href="/dashboard/campaigns"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--card)] transition-colors"
                    >
                        <Megaphone className="w-5 h-5" />
                        Campanhas
                    </Link>
                    <Link
                        href="/dashboard/settings"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--card)] transition-colors"
                    >
                        <Settings className="w-5 h-5" />
                        Configurações
                    </Link>
                </nav>

                <div className="border-t border-[var(--border)] pt-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--card)] flex items-center justify-center">
                            <Users className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{user?.name || user?.email}</p>
                            <p className="text-xs text-[var(--muted)]">{user?.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--danger)] transition-colors w-full px-3 py-2"
                    >
                        <LogOut className="w-4 h-4" />
                        Sair
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 p-8 overflow-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-bold">Dashboard</h2>
                        <p className="text-[var(--muted)]">Visão geral do sistema</p>
                    </div>
                    <button onClick={loadData} className="btn btn-secondary">
                        <RefreshCw className="w-4 h-4" />
                        Atualizar
                    </button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="glass rounded-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/20 flex items-center justify-center">
                                <Smartphone className="w-5 h-5 text-[var(--primary)]" />
                            </div>
                            <span className="text-xs px-2 py-1 rounded-full bg-[var(--success)]/20 text-[var(--success)]">
                                {stats?.instances.connected || 0} online
                            </span>
                        </div>
                        <p className="text-3xl font-bold">{stats?.instances.total || 0}</p>
                        <p className="text-[var(--muted)] text-sm">Instâncias</p>
                    </div>

                    <div className="glass rounded-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                <Send className="w-5 h-5 text-blue-500" />
                            </div>
                        </div>
                        <p className="text-3xl font-bold">{stats?.messages || 0}</p>
                        <p className="text-[var(--muted)] text-sm">Mensagens</p>
                    </div>

                    <div className="glass rounded-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                <Megaphone className="w-5 h-5 text-purple-500" />
                            </div>
                        </div>
                        <p className="text-3xl font-bold">{stats?.campaigns || 0}</p>
                        <p className="text-[var(--muted)] text-sm">Campanhas</p>
                    </div>

                    <div className="glass rounded-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                                <Users className="w-5 h-5 text-orange-500" />
                            </div>
                        </div>
                        <p className="text-3xl font-bold">{stats?.users || 0}</p>
                        <p className="text-[var(--muted)] text-sm">Usuários</p>
                    </div>
                </div>

                {/* Instances Section */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold">Instâncias WhatsApp</h3>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="btn btn-primary"
                        >
                            <Plus className="w-4 h-4" />
                            Nova Instância
                        </button>
                    </div>

                    {instances.length === 0 ? (
                        <div className="glass rounded-xl p-12 text-center">
                            <Smartphone className="w-12 h-12 mx-auto mb-4 text-[var(--muted)]" />
                            <h4 className="font-semibold mb-2">Nenhuma instância</h4>
                            <p className="text-[var(--muted)] mb-4">
                                Crie sua primeira instância para começar
                            </p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="btn btn-primary"
                            >
                                <Plus className="w-4 h-4" />
                                Criar Instância
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {instances.map((instance) => (
                                <div
                                    key={instance.id}
                                    className="glass rounded-xl p-5 card-hover"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`w-3 h-3 rounded-full ${instance.status === 'connected'
                                                        ? 'status-connected'
                                                        : instance.status === 'connecting' ||
                                                            instance.status === 'qr'
                                                            ? 'status-connecting'
                                                            : 'status-disconnected'
                                                    }`}
                                            />
                                            <div>
                                                <h4 className="font-semibold">{instance.name}</h4>
                                                <p className="text-xs text-[var(--muted)]">
                                                    {instance.waNumber || 'Não conectado'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Link
                                                href={`/dashboard/instances/${instance.id}`}
                                                className="p-2 rounded-lg hover:bg-[var(--card-hover)] transition-colors"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Link>
                                            <button
                                                onClick={() => handleDeleteInstance(instance.id)}
                                                className="p-2 rounded-lg hover:bg-[var(--danger)]/20 text-[var(--danger)] transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[var(--muted)]">Status</span>
                                            <span
                                                className={`capitalize ${instance.status === 'connected'
                                                        ? 'text-[var(--success)]'
                                                        : instance.status === 'connecting' ||
                                                            instance.status === 'qr'
                                                            ? 'text-[var(--warning)]'
                                                            : 'text-[var(--danger)]'
                                                    }`}
                                            >
                                                {instance.status === 'qr' ? 'Aguardando QR' : instance.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[var(--muted)]">Nome WA</span>
                                            <span>{instance.waName || '-'}</span>
                                        </div>
                                    </div>

                                    {instance.qrCode && instance.status !== 'connected' && (
                                        <div className="mt-4 p-4 bg-white rounded-lg">
                                            <img
                                                src={instance.qrCode}
                                                alt="QR Code"
                                                className="w-full"
                                            />
                                        </div>
                                    )}

                                    <Link
                                        href={`/dashboard/instances/${instance.id}`}
                                        className="btn btn-secondary w-full mt-4"
                                    >
                                        <Eye className="w-4 h-4" />
                                        Ver Detalhes
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Create Instance Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="glass rounded-2xl p-6 w-full max-w-md animate-fade-in">
                        <h3 className="text-xl font-semibold mb-4">Nova Instância</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Nome da instância
                                </label>
                                <input
                                    type="text"
                                    placeholder="Minha Instância"
                                    value={newInstanceName}
                                    onChange={(e) => setNewInstanceName(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="btn btn-secondary flex-1"
                                    disabled={creating}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateInstance}
                                    className="btn btn-primary flex-1"
                                    disabled={creating || !newInstanceName.trim()}
                                >
                                    {creating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Criando...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4" />
                                            Criar
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
