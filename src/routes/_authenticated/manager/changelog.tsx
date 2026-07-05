import { createFileRoute } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/manager/changelog")({
    component: ManagerChangelogRoute,
});

function ManagerChangelogRoute() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-[22px] font-bold mb-1">Change Logs</h1>
                <p className="text-[13px] text-muted-foreground mb-6">Audit trail of promo code and commission changes</p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="py-8 text-center text-muted-foreground">
                        Activity logging feature is coming soon.
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
