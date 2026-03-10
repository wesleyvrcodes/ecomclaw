"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Store,
  Trash2,
  Globe,
  Bot,
  Circle,
  Loader2,
  AlertCircle,
  Link2,
  Key,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface StoreItem {
  id: string;
  name: string;
  storeUrl: string;
  isConnected: boolean;
  agentCount: number;
}

export default function StoresPage() {
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add store form
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formClientId, setFormClientId] = useState("");
  const [formClientSecret, setFormClientSecret] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchStores = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<StoreItem[]>("/stores");
      setStores(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load stores";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formUrl.trim() || !formClientId.trim() || !formClientSecret.trim()) return;

    try {
      setFormLoading(true);
      setFormError(null);
      await api.post("/stores", {
        name: formName.trim(),
        storeUrl: formUrl.trim(),
        clientId: formClientId.trim(),
        clientSecret: formClientSecret.trim(),
      });
      setShowAddModal(false);
      setFormName("");
      setFormUrl("");
      setFormClientId("");
      setFormClientSecret("");
      await fetchStores();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to connect store";
      setFormError(message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteStore = async (id: string) => {
    try {
      setDeleting(true);
      await api.delete(`/stores/${id}`);
      setDeleteConfirm(null);
      await fetchStores();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete store";
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Your Stores</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your connected Shopify stores
          </p>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium"
        >
          <Plus className="h-4 w-4" />
          Add Store
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        </div>
      ) : stores.length === 0 ? (
        <Card className="bg-[#0a0a0a] border-[#27272a]">
          <CardContent className="p-12 text-center">
            <Store className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-400 mb-1">
              No stores connected yet
            </p>
            <p className="text-xs text-zinc-600 mb-5">
              Connect your first Shopify store to start deploying agents.
            </p>
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium"
            >
              <Plus className="h-4 w-4" />
              Add Your First Store
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {stores.map((store) => (
            <Card
              key={store.id}
              className="bg-[#0a0a0a] border-[#27272a] hover:border-zinc-600 transition-colors overflow-hidden"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-500/10 p-2.5 rounded-lg">
                      <Store className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {store.name}
                      </h3>
                      </div>
                  </div>
                  <Badge
                    variant={store.isConnected ? "default" : "secondary"}
                    className={
                      store.isConnected
                        ? "bg-green-500/10 text-green-500 hover:bg-green-500/10"
                        : "bg-zinc-800 text-zinc-500 hover:bg-zinc-800"
                    }
                  >
                    <Circle
                      className={`h-2 w-2 fill-current mr-1.5 ${
                        store.isConnected ? "text-green-500" : "text-zinc-600"
                      }`}
                    />
                    {store.isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
                  <Globe className="h-3 w-3 shrink-0" />
                  <span className="truncate">{store.storeUrl}</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-400 mb-4">
                  <Bot className="h-3 w-3" />
                  <span>
                    {store.agentCount} agent{store.agentCount !== 1 ? "s" : ""} deployed
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setExpandedStore(
                        expandedStore === store.id ? null : store.id
                      )
                    }
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a]"
                  >
                    Manage
                    {expandedStore === store.id ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDeleteConfirm(store.id)}
                    className="bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border-[#27272a]"
                    title="Delete store"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>

              {expandedStore === store.id && (
                <div className="border-t border-[#27272a] p-5 bg-[#09090b]">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Store URL</p>
                      <p className="text-sm text-white font-mono">{store.storeUrl}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Agents</p>
                      <p className="text-sm text-white">
                        {store.agentCount} deployed
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Status</p>
                      <p
                        className={`text-sm font-medium ${
                          store.isConnected ? "text-green-400" : "text-zinc-500"
                        }`}
                      >
                        {store.isConnected ? "Connected" : "Disconnected"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="bg-[#0a0a0a] border-[#27272a] sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="bg-red-500/10 p-2.5 rounded-lg">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white">
                  Delete Store
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 mt-0.5">
                  This action cannot be undone
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <p className="text-sm text-zinc-400">
            Are you sure you want to delete this store? All agents deployed to
            this store will also be removed.
          </p>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleting}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDeleteStore(deleteConfirm)}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete Store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Store Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-[#0a0a0a] border-[#27272a] sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-purple-500" />
              <DialogTitle className="text-base font-semibold text-white">
                Add Store
              </DialogTitle>
            </div>
          </DialogHeader>

          <form onSubmit={handleAddStore} className="space-y-4">
            {formError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-400">{formError}</p>
              </div>
            )}

            <div>
              <Label className="text-zinc-300 mb-1.5">
                Store Name <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="My Fashion Store"
                  required
                  className="bg-[#09090b] border-[#27272a] pl-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
                />
              </div>
            </div>

            <div>
              <Label className="text-zinc-300 mb-1.5">
                Shopify Store URL <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="your-store.myshopify.com"
                  required
                  className="bg-[#09090b] border-[#27272a] pl-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Label className="text-zinc-300">
                  Client ID <span className="text-red-400">*</span>
                </Label>
                <div className="group relative">
                  <Info className="h-3.5 w-3.5 text-zinc-600 hover:text-blue-400 cursor-help transition-colors" />
                  <div className="absolute bottom-full left-0 mb-2 w-80 p-3 rounded-lg bg-[#18181b] border border-[#27272a] shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <p className="text-xs text-zinc-300 font-medium mb-2">How to create your Shopify app:</p>
                    <ol className="text-[11px] text-zinc-400 space-y-1.5 list-decimal list-inside">
                      <li>Go to your <span className="text-blue-400">Shopify Admin</span> dashboard</li>
                      <li>Navigate to <span className="text-white">Settings → Apps and sales channels</span></li>
                      <li>Click <span className="text-white">Develop apps</span> (top right). If you don&apos;t see it, click <span className="text-white">Allow custom app development</span> first</li>
                      <li>Click <span className="text-white">Create an app</span> → name it <span className="text-blue-400">ClawCommerce</span></li>
                      <li>Go to <span className="text-white">Configuration</span> tab → <span className="text-white">Admin API integration</span></li>
                      <li>Click <span className="text-white">Configure</span> and enable all required API scopes for your agents</li>
                      <li>Click <span className="text-white">Save</span>, then go to <span className="text-white">API credentials</span> tab</li>
                      <li>Click <span className="text-white">Install app</span> → copy the <span className="text-white">Admin API access token</span></li>
                      <li>Copy the <span className="text-white">API key</span> (Client ID) and <span className="text-white">API secret key</span> (Client Secret)</li>
                    </ol>
                    <div className="mt-2 pt-2 border-t border-[#27272a]">
                      <p className="text-[10px] text-zinc-500">💡 Enable all scopes you need upfront. You&apos;ll see the exact scopes when deploying an agent.</p>
                    </div>
                    <div className="absolute top-full left-8 -mt-px border-4 border-transparent border-t-[#27272a]" />
                  </div>
                </div>
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  type="text"
                  value={formClientId}
                  onChange={(e) => setFormClientId(e.target.value)}
                  placeholder="API key from Shopify custom app"
                  required
                  className="bg-[#09090b] border-[#27272a] pl-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <Label className="text-zinc-300 mb-1.5">
                Client Secret <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  type="password"
                  value={formClientSecret}
                  onChange={(e) => setFormClientSecret(e.target.value)}
                  placeholder="API secret key from Shopify custom app"
                  required
                  className="bg-[#09090b] border-[#27272a] pl-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 font-mono"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={formLoading || !formName.trim() || !formUrl.trim() || !formClientId.trim() || !formClientSecret.trim()}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium"
            >
              {formLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Store className="h-4 w-4" />
                  Connect Store
                </>
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
