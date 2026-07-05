const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log("Fetching SAM Users...");
    const { data: sams } = await supabase.from('user_roles').select('user_id').eq('role', 'sam').limit(1);
    if (!sams || sams.length === 0) {
        console.log("No SAM user found.");
        return;
    }
    const samId = sams[0].user_id;

    console.log(`Checking SAM Analytics View for SAM: ${samId}`);
    const { data: viewData } = await supabase.from('sam_analytics_view').select('*').eq('id', samId).single();
    console.log("View Data:", viewData);

    console.log(`Aggregating actual commissions for SAM: ${samId}`);
    // SAM commissions are under recipient_id = SAM's ID.
    const { data: commissions } = await supabase.from('commissions').select('amount_cents, status').eq('recipient_id', samId);
    let totalEarned = 0;
    let pending = 0;

    if (commissions) {
        commissions.forEach(c => {
            if (c.status === 'paid') totalEarned += c.amount_cents;
            if (c.status === 'pending') pending += c.amount_cents;
        });
    }

    console.log(`Aggregation Total Earned: ${totalEarned}`);
    console.log(`Aggregation Pending: ${pending}`);

    if (viewData && viewData.total_earned_cents === totalEarned && viewData.pending_commission_cents === pending) {
        console.log("✅ Verification Passed! View perfectly matches actual commissions data.");
    } else if (!viewData && totalEarned === 0 && pending === 0) {
        console.log("✅ Verification Passed! No view record, meaning 0 correctly maps to 0.");
    } else {
        console.log("❌ Mismatch detected.");
    }
}

run();
