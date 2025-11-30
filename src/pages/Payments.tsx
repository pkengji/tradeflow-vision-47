import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SlidersHorizontal, Plus, Pencil, Trash2, ChevronLeft } from "lucide-react";
import api, { type CashflowOut } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Direction = "deposit" | "withdraw" | "all";

function formatDateHeader(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const compareDate = new Date(d);
  compareDate.setHours(0, 0, 0, 0);

  const formatted = d.toLocaleDateString("de-CH", { 
    day: "2-digit", 
    month: "2-digit", 
    year: "numeric" 
  });

  if (compareDate.getTime() === today.getTime()) {
    return `Heute, ${formatted}`;
  } else if (compareDate.getTime() === yesterday.getTime()) {
    return `Gestern, ${formatted}`;
  }
  return formatted;
}

function groupCashflowsByDate(cashflows: CashflowOut[]): Map<string, CashflowOut[]> {
  const groups = new Map<string, CashflowOut[]>();
  for (const cf of cashflows) {
    const dateStr = cf.ts;
    if (!dateStr) continue;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const key = date.toISOString().split("T")[0]; // YYYY-MM-DD
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(cf);
  }
  return groups;
}

export default function Payments() {
  const { toast } = useToast();
  const [cashflows, setCashflows] = useState<CashflowOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCashflow, setEditingCashflow] = useState<CashflowOut | null>(null);
  
  // Filter state
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [direction, setDirection] = useState<Direction>("all");

  // Local filter state (for confirmation pattern)
  const [localDateFrom, setLocalDateFrom] = useState<string>("");
  const [localDateTo, setLocalDateTo] = useState<string>("");
  const [localDirection, setLocalDirection] = useState<Direction>("all");

  // Dialog form state
  const [formDirection, setFormDirection] = useState<"deposit" | "withdraw">("deposit");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");

  // Load cashflows
  const loadCashflows = async () => {
    setLoading(true);
    try {
      const params: any = {};
      
      if (dateFrom) {
        params.date_from = dateFrom;
      }
      if (dateTo) {
        params.date_to = dateTo;
      }
      if (direction !== "all") {
        params.direction = direction;
      }

      const data = await api.getCashflows(params);
      setCashflows(data);
    } catch (err) {
      console.error("Failed to load cashflows:", err);
      toast({
        title: "Fehler",
        description: "Zahlungen konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCashflows();
  }, [dateFrom, dateTo, direction]);

  const handleAddCashflow = async () => {
    if (!formAmount || !formDate) {
      toast({
        title: "Fehler",
        description: "Bitte alle Felder ausfüllen",
        variant: "destructive",
      });
      return;
    }

    try {
      await api.createCashflow({
        direction: formDirection,
        amount_usdt: parseFloat(formAmount),
        currency: "USDT",
        date: formDate,
        bot_id: null,
      });
      
      toast({
        title: "Erfolg",
        description: "Zahlung wurde hinzugefügt",
      });
      
      setShowAddDialog(false);
      setFormDirection("deposit");
      setFormAmount("");
      setFormDate("");
      loadCashflows();
    } catch (err) {
      console.error("Failed to create cashflow:", err);
      toast({
        title: "Fehler",
        description: "Zahlung konnte nicht erstellt werden",
        variant: "destructive",
      });
    }
  };

  const handleEditCashflow = async () => {
    if (!editingCashflow || !formAmount || !formDate) {
      toast({
        title: "Fehler",
        description: "Bitte alle Felder ausfüllen",
        variant: "destructive",
      });
      return;
    }

    try {
      await api.updateCashflow(editingCashflow.id, {
        amount_usdt: parseFloat(formAmount),
        date: formDate,
      });
      
      toast({
        title: "Erfolg",
        description: "Zahlung wurde aktualisiert",
      });
      
      setShowEditDialog(false);
      setEditingCashflow(null);
      setFormAmount("");
      setFormDate("");
      loadCashflows();
    } catch (err) {
      console.error("Failed to update cashflow:", err);
      toast({
        title: "Fehler",
        description: "Zahlung konnte nicht aktualisiert werden",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCashflow = async (id: number) => {
    if (!confirm("Möchten Sie diese Zahlung wirklich löschen?")) return;

    try {
      await api.deleteCashflow(id);
      toast({
        title: "Erfolg",
        description: "Zahlung wurde gelöscht",
      });
      loadCashflows();
    } catch (err) {
      console.error("Failed to delete cashflow:", err);
      toast({
        title: "Fehler",
        description: "Zahlung konnte nicht gelöscht werden",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (cf: CashflowOut) => {
    setEditingCashflow(cf);
    setFormAmount(cf.amount_usdt.toString());
    // Extract date from ts field (YYYY-MM-DD)
    const date = new Date(cf.ts);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    setFormDate(dateStr);
    setShowEditDialog(true);
  };

  const openAddDialog = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setFormDate(dateStr);
    setFormAmount("");
    setFormDirection("deposit");
    setShowAddDialog(true);
  };

  const cashflowsGrouped = useMemo(() => groupCashflowsByDate(cashflows), [cashflows]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (direction !== "all") count++;
    if (dateFrom || dateTo) count++;
    return count;
  }, [direction, dateFrom, dateTo]);

  const applyFilters = () => {
    setDateFrom(localDateFrom);
    setDateTo(localDateTo);
    setDirection(localDirection);
    setShowFilters(false);
  };

  const resetFilters = () => {
    setLocalDateFrom("");
    setLocalDateTo("");
    setLocalDirection("all");
    setDateFrom("");
    setDateTo("");
    setDirection("all");
    setShowFilters(false);
  };

  // Initialize local filters from current filters
  useEffect(() => {
    if (showFilters) {
      setLocalDateFrom(dateFrom);
      setLocalDateTo(dateTo);
      setLocalDirection(direction);
    }
  }, [showFilters]);

  const FilterButton = (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={() => setShowFilters(!showFilters)} 
      className="relative"
    >
      <SlidersHorizontal className="h-5 w-5" />
      {activeFilterCount > 0 && (
        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  const DesktopFilterButton = (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setShowFilters(!showFilters)}
      className="relative"
    >
      <SlidersHorizontal className="h-4 w-4" />
      {activeFilterCount > 0 && (
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  const BackButton = (
    <Link to="/settings">
      <Button variant="ghost" size="icon">
        <ChevronLeft className="h-5 w-5" />
      </Button>
    </Link>
  );

  return (
    <DashboardLayout
      pageTitle="Zahlungen"
      mobileHeaderLeft={BackButton}
      desktopHeaderLeft={BackButton}
      mobileHeaderRight={FilterButton}
      desktopHeaderRight={DesktopFilterButton}
    >
      {/* Filter Modal - Mobile */}
      {showFilters && (
        <div 
          className="fixed top-14 inset-x-0 bottom-0 bg-background/80 z-50 lg:hidden" 
          onClick={() => setShowFilters(false)}
        >
          <div
            className="fixed inset-x-0 top-14 bottom-16 bg-background flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div className="space-y-2">
                <Label>Richtung</Label>
                <Select value={localDirection} onValueChange={(v) => setLocalDirection(v as Direction)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    <SelectItem value="deposit">Einzahlung</SelectItem>
                    <SelectItem value="withdraw">Auszahlung</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Von Datum</Label>
                <Input
                  type="date"
                  value={localDateFrom}
                  onChange={(e) => setLocalDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Bis Datum</Label>
                <Input
                  type="date"
                  value={localDateTo}
                  onChange={(e) => setLocalDateTo(e.target.value)}
                />
              </div>
            </div>
            <div className="border-t p-4 flex gap-2">
              <Button variant="outline" onClick={resetFilters} className="flex-1">
                Zurücksetzen
              </Button>
              <Button onClick={applyFilters} className="flex-1">
                Fertig
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-auto flex-1">
        <div className="space-y-4 p-4 pb-24">
          {/* Filter - Desktop */}
          {showFilters && (
            <div className="hidden lg:block border rounded-lg bg-muted/30 p-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Richtung</Label>
                  <Select value={localDirection} onValueChange={(v) => setLocalDirection(v as Direction)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle</SelectItem>
                      <SelectItem value="deposit">Einzahlung</SelectItem>
                      <SelectItem value="withdraw">Auszahlung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Von Datum</Label>
                  <Input
                    type="date"
                    value={localDateFrom}
                    onChange={(e) => setLocalDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bis Datum</Label>
                  <Input
                    type="date"
                    value={localDateTo}
                    onChange={(e) => setLocalDateTo(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={resetFilters}>
                  Zurücksetzen
                </Button>
                <Button onClick={applyFilters}>
                  Fertig
                </Button>
              </div>
            </div>
          )}

          {/* Cashflows List */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-muted-foreground">
                {loading ? "Lade…" : `${cashflows.length} Einträge`}
              </div>
            </div>
            
            <div className="space-y-4">
              {cashflows.length === 0 && !loading && (
                <div className="text-sm text-muted-foreground py-4">Keine Zahlungen vorhanden.</div>
              )}
              
              {Array.from(cashflowsGrouped.entries())
                .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                .map(([dateKey, items], groupIndex) => (
                  <div key={dateKey}>
                    {groupIndex > 0 && <Separator className="my-4" />}
                    <div className="text-xs text-muted-foreground font-medium mb-2 px-1">
                      {formatDateHeader(dateKey)}
                    </div>
                    <div className="divide-y divide-border">
                      {items.map((cf) => {
                        const isDeposit = cf.direction === "deposit";
                        const amountColor = isDeposit ? "text-success" : "text-danger";
                        const amountText = isDeposit 
                          ? formatCurrency(cf.amount_usdt, false)
                          : formatCurrency(-cf.amount_usdt, true);
                        
                        return (
                          <div
                            key={cf.id}
                            className="flex items-center justify-between py-3 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex-1">
                              <div className="font-medium text-sm">
                                {isDeposit ? "Einzahlung" : "Auszahlung"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(cf.ts).toLocaleDateString("de-CH")}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={`font-semibold text-sm ${amountColor}`}>
                                {amountText}
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEditDialog(cf)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-danger hover:text-danger"
                                  onClick={() => handleDeleteCashflow(cf.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </section>

          {/* Add Button */}
          <div className="flex justify-center pt-4">
            <Button onClick={openAddDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Neue Zahlung
            </Button>
          </div>
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Zahlung</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Richtung</Label>
              <div className="flex gap-2">
                <Button
                  variant={formDirection === "deposit" ? "default" : "outline"}
                  onClick={() => setFormDirection("deposit")}
                  className="flex-1"
                >
                  Einzahlung
                </Button>
                <Button
                  variant={formDirection === "withdraw" ? "default" : "outline"}
                  onClick={() => setFormDirection("withdraw")}
                  className="flex-1"
                >
                  Auszahlung
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Betrag (USDT)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Datum</Label>
              <Input
                id="date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleAddCashflow}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zahlung bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Richtung</Label>
              <div className="text-sm font-medium">
                {editingCashflow?.direction === "deposit" ? "Einzahlung" : "Auszahlung"}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Betrag (USDT)</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-date">Datum</Label>
              <Input
                id="edit-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleEditCashflow}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
