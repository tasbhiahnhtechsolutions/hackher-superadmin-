import Stripe from 'stripe';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables from .env file
dotenv.config();

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
    console.error("❌ ERROR: STRIPE_SECRET_KEY is missing in your .env file.");
    process.exit(1);
}

const stripe = new Stripe(stripeKey);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
    console.log("======================================================");
    console.log("        STRIPE SUBSCRIPTION RENEWAL TESTER            ");
    console.log("======================================================\n");

    const subId = process.argv[2];
    
    if (!subId) {
        console.error("❌ Please provide a Subscription ID as an argument!");
        console.error("👉 Example: bun run scripts/test_renewal_coupon.js sub_1xxxxxxxx");
        process.exit(1);
    }

    if (!subId.startsWith("sub_")) {
        console.error("❌ Invalid subscription ID. It must start with 'sub_'");
        process.exit(1);
    }

    try {
        console.log(`🔍 Fetching subscription from Stripe: ${subId}`);
        const subscription = await stripe.subscriptions.retrieve(subId, {
            expand: ['latest_invoice']
        });

        console.log(`\n✅ Subscription Status: ${subscription.status.toUpperCase()}`);
        console.log(`📅 Current Period End:  ${new Date(subscription.current_period_end * 1000).toLocaleString()}`);
        
        // -------------------------------------------------------------
        // STEP 1: Check the original / latest invoice for any discount
        // -------------------------------------------------------------
        const latestInvoice = subscription.latest_invoice;
        if (latestInvoice && latestInvoice.total_discount_amounts && latestInvoice.total_discount_amounts.length > 0) {
            const discountAmount = latestInvoice.total_discount_amounts[0].amount;
            console.log(`\n💰 LATEST PAID INVOICE (${latestInvoice.id}) HAD A DISCOUNT APPLIED!`);
            console.log(`   - Discount applied: ${(discountAmount / 100).toFixed(2)} ${latestInvoice.currency.toUpperCase()}`);
            console.log(`   - Amount customer paid: ${(latestInvoice.amount_paid / 100).toFixed(2)} ${latestInvoice.currency.toUpperCase()}`);
        } else if (latestInvoice) {
            console.log(`\n💰 LATEST PAID INVOICE (${latestInvoice.id}) HAD NO DISCOUNT.`);
            console.log(`   - Amount customer paid: ${(latestInvoice.amount_paid / 100).toFixed(2)} ${latestInvoice.currency.toUpperCase()}`);
        }

        // -------------------------------------------------------------
        // STEP 2: Generate the UPCOMING invoice (Renewal Simulation)
        // -------------------------------------------------------------
        console.log(`\n======================================================`);
        console.log(`⏭️  SIMULATING UPCOMING RENEWAL INVOICE...`);
        console.log(`======================================================`);
        
        try {
            const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
                subscription: subId,
            });

            const hasDiscount = upcomingInvoice.total_discount_amounts && upcomingInvoice.total_discount_amounts.length > 0;
            const subtotal = upcomingInvoice.subtotal;
            const total = upcomingInvoice.total;

            console.log(`   - Upcoming Subtotal: ${(subtotal / 100).toFixed(2)} ${upcomingInvoice.currency.toUpperCase()}`);
            
            if (hasDiscount) {
                console.log(`   ⚠️ WARNING: Upcoming invoice STILL HAS a discount. Amount: ${(upcomingInvoice.total_discount_amounts[0].amount / 100).toFixed(2)}`);
            } else {
                console.log(`   ✅ SUCCESS: No discount found! The coupon was dropped for renewal.`);
            }
            
            console.log(`   - Upcoming Total to Charge: ${(total / 100).toFixed(2)} ${upcomingInvoice.currency.toUpperCase()}`);
            
            if (!hasDiscount) {
                console.log(`\n👉 This proves that when the subscription renews, the user WILL BE CHARGED THE FULL AMOUNT.`);
            }

        } catch (error) {
            console.error("\n⚠️ Could not fetch upcoming invoice. Maybe the subscription is canceled?", error.message);
        }

        // -------------------------------------------------------------
        // STEP 3: Option to manually force the renewal right now
        // -------------------------------------------------------------
        console.log(`\n======================================================`);
        const answer = await askQuestion("⚡ Do you want to FORCE TEST a real renewal charge right now? (y/n): ");
        
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            console.log("\n🚀 Forcing renewal via 'billing_cycle_anchor: now'...");
            
            const updatedSub = await stripe.subscriptions.update(subId, {
                proration_behavior: 'none',  // Don't prorate, just charge full amount for full new cycle
                billing_cycle_anchor: 'now'  // Reset cycle to start right now
            });

            console.log(`\n✅ Renewal triggered successfully!`);
            console.log(`📅 New Period End: ${new Date(updatedSub.current_period_end * 1000).toLocaleString()}`);
            console.log(`👉 You can check Stripe Dashboard or log into Supabase to view the transactions.`);
            console.log(`👉 A new invoice was just generated and your webhook should process it momentarily!`);
        } else {
            console.log("\n🛑 Skipping forced renewal. Exiting safely.");
        }

    } catch (error) {
        console.error("\n❌ Error:", error.message);
    } finally {
        rl.close();
    }
}

main();
