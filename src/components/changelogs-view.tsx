import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface ChangeLogsViewProps {
  role: "super_admin" | "sam" | "manager";
}

export function ChangeLogsView({ role }: ChangeLogsViewProps) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  // Fetch all profiles to resolve names and hierarchy locally
  const { data: profiles = [] } = useQuery({
    queryKey: ["changelog-profiles"],
    queryFn: async () => {
      const { data: p } = await supabase.from("profiles").select("id, full_name, email, parent_user_id");
      const { data: r } = await supabase.from("user_roles").select("user_id, role");
      return p?.map(prof => ({
        ...prof,
        role: r?.find(roleRow => roleRow.user_id === prof.id)?.role ?? "affiliate"
      })) ?? [];
    }
  });

  // Fetch all promo codes to resolve code names and affiliates
  const { data: promoCodes = [] } = useQuery({
    queryKey: ["changelog-promo-codes"],
    queryFn: async () => {
      const { data } = await supabase.from("promo_codes").select("id, code, discount_percent, affiliate_id");
      return data ?? [];
    }
  });

  // Fetch audit logs
  const { data: rawLogs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    }
  });

  // Hierarchy check helper
  function isDescendantOf(targetUserId: string, parentUserId: string) {
    let current = profiles.find(p => p.id === targetUserId);
    while (current && current.parent_user_id) {
      if (current.parent_user_id === parentUserId) {
        return true;
      }
      current = profiles.find(p => p.id === current.parent_user_id);
    }
    return false;
  }

  // Format Date to "MMM DD, YYYY"
  function formatDate(isoString: string) {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  // Parse and format each log entry
  const formattedLogs = rawLogs.map((log) => {
    const actor = profiles.find(p => p.id === log.actor_id);
    const changedBy = actor ? actor.full_name : "System";

    let type: "Promo Code" | "Commission" = "Commission";
    let changeDesc = "";
    let targetRole = "";
    let targetName = "";
    let targetUserId = "";

    const newValues = (log.new_values as any) || {};
    const oldValues = (log.old_values as any) || {};

    if (log.entity_type === "promo_code" || log.action.includes("promo")) {
      type = "Promo Code";
      const promoObj = promoCodes.find(p => p.id === log.entity_id) || promoCodes.find(p => p.code === newValues.code);
      const affiliateId = promoObj?.affiliate_id || newValues.affiliate_id;
      const affiliate = profiles.find(p => p.id === affiliateId);
      
      targetUserId = affiliateId || "";
      targetRole = "Affiliate";
      targetName = affiliate ? affiliate.full_name : "Unknown Affiliate";

      if (log.action === "create_promo_code" || log.action === "create") {
        changeDesc = `Created code <strong>${newValues.code || ""}</strong> — ${newValues.discount_percent || 0}% off`;
      } else if (newValues.status === "inactive") {
        changeDesc = `Deactivated code <strong>${newValues.code || oldValues.code || promoObj?.code || ""}</strong>`;
      } else if (newValues.status === "active") {
        changeDesc = `Activated code <strong>${newValues.code || oldValues.code || promoObj?.code || ""}</strong>`;
      } else if (newValues.discount_percent !== undefined && oldValues.discount_percent !== undefined) {
        changeDesc = `Edited code <strong>${newValues.code || oldValues.code || promoObj?.code || ""}</strong> — discount ${oldValues.discount_percent}% → ${newValues.discount_percent}%`;
      } else {
        changeDesc = `Updated code <strong>${newValues.code || oldValues.code || promoObj?.code || ""}</strong>`;
      }
    } else {
      type = "Commission";
      const targetProfile = profiles.find(p => p.id === log.entity_id);
      targetUserId = log.entity_id || "";
      targetName = targetProfile ? targetProfile.full_name : "Unknown User";
      
      const rawRole = targetProfile?.role || "affiliate";
      targetRole = rawRole === "sam" ? "SAM" : rawRole === "manager" ? "Manager" : "Affiliate";

      const oldRate = oldValues.commission_rate !== undefined ? `${(oldValues.commission_rate * 100).toFixed(1)}%` : "";
      const newRate = newValues.commission_rate !== undefined ? `${(newValues.commission_rate * 100).toFixed(1)}%` : "";

      if (oldRate && newRate) {
        changeDesc = `${targetRole} commission changed <strong>${oldRate} → ${newRate}</strong>`;
      } else if (newRate) {
        changeDesc = `${targetRole} commission changed to <strong>${newRate}</strong>`;
      } else {
        changeDesc = `Updated commission settings`;
      }
    }

    return {
      id: log.id,
      created_at: log.created_at,
      type,
      changeDesc,
      role: targetRole,
      name: targetName,
      changedBy,
      targetUserId,
    };
  });

  // Filter logs by Role permissions and selected filter values
  const filteredLogs = formattedLogs.filter((log) => {
    // 1. Role-based visibility
    if (role === "manager") {
      // Only shows Affiliate-level changes under this manager
      if (log.role !== "Affiliate") return false;
      // Must be in this manager's hierarchy
      if (user?.id && log.targetUserId !== user.id && !isDescendantOf(log.targetUserId, user.id)) {
        return false;
      }
    } else if (role === "sam") {
      // Hide SAM level changes
      if (log.role === "SAM") return false;
      // Must be in this SAM's hierarchy
      if (user?.id && log.targetUserId !== user.id && !isDescendantOf(log.targetUserId, user.id)) {
        return false;
      }
    }

    // 2. Search filter (Search across description, target name, and changed by)
    const matchesSearch =
      search === "" ||
      log.changeDesc.toLowerCase().includes(search.toLowerCase()) ||
      log.name.toLowerCase().includes(search.toLowerCase()) ||
      log.changedBy.toLowerCase().includes(search.toLowerCase());

    // 3. Type filter
    const matchesType = typeFilter === "all" || log.type === typeFilter;

    // 4. Role filter
    const matchesRole = roleFilter === "all" || log.role.toLowerCase() === roleFilter;

    return matchesSearch && matchesType && matchesRole;
  });

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    setSearch("");
    setTypeFilter("all");
    setRoleFilter("all");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold mb-1">Change Logs</h1>
        <p className="text-[13px] text-muted-foreground mb-6">Audit trail of promo code and commission changes</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Mockup matching filter bar */}
          <div className="flex gap-2.5 flex-wrap p-3 border-b border-[#E5E7EB] bg-[#F9FAFB] items-center">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-[240px] bg-white border-[#D1D5DB]"
            />
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] bg-white border-[#D1D5DB]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Promo Code">Promo Code</SelectItem>
                <SelectItem value="Commission">Commission</SelectItem>
              </SelectContent>
            </Select>

            {role === "super_admin" && (
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[150px] bg-white border-[#D1D5DB]">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="sam">SAM</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="affiliate">Affiliate</SelectItem>
                </SelectContent>
              </Select>
            )}

            {role === "sam" && (
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[150px] bg-white border-[#D1D5DB]">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="affiliate">Affiliate</SelectItem>
                </SelectContent>
              </Select>
            )}

            {role === "manager" && (
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[150px] bg-white border-[#D1D5DB]">
                  <SelectValue placeholder="Affiliate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="affiliate">Affiliate</SelectItem>
                </SelectContent>
              </Select>
            )}

            <Button variant="ghost" onClick={handleReset} className="text-accent hover:text-[#C4541E] hover:bg-[#FCE5D7] text-xs font-semibold px-3 py-1">
              ↺ Reset
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Changed By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No change events found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.type === "Promo Code" ? "blue" : "amber"}>
                        {log.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span dangerouslySetInnerHTML={{ __html: log.changeDesc }} />
                    </TableCell>
                    <TableCell>{log.role}</TableCell>
                    <TableCell className="font-medium">{log.name}</TableCell>
                    <TableCell>{log.changedBy}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
